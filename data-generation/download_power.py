"""
Downloads NASA POWER daily weather data (1981-2025, 15 variables) for 12 UK towns and
12 big world cities. This raw data is what the trend analysis is built on.

NASA's data comes in squares about 50 km wide. For a coastal city the square can be mostly
sea, which gives flat, wrong temperatures. So each place is tested first and, if it lands
on sea, the nearest neighbouring land square is used instead.

How it is run: python download_power.py  (plain Python 3.8+, about 5 to 8 minutes)

It generates:
  data/raw/<place>.json   one file per place, NASA's reply unchanged
  data/raw/manifest.csv   coordinates asked for, coordinates used, and why
  power_raw.zip           all of the above in one file
"""
import csv
import json
import math
import os
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone

# ---------------------------------------------------------------- SETTINGS
# Where NASA's data service lives, the date range we want, and where files are saved.
API = "https://power.larc.nasa.gov/api/temporal/daily/point"
START, END = "19810101", "20251231"
RAW_DIR = os.path.join("data", "raw")

# The 15 weather variables to download for every place (temperature, rain, wind, sun, soil...).
PARAMETERS = [
    "T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M", "T2MDEW",
    "WS10M", "WS10M_MAX", "ALLSKY_SFC_SW_DWN", "CLOUD_AMT",
    "HDD18_3", "CDD18_3", "GWETROOT", "GWETTOP", "EVPTRNS",
]

# Sea test settings. Over open sea, day and night temperatures differ by only 2-4 C;
# over land it is usually 5 C or more. Below SEA_GAP we treat a square as "mostly sea".
SEA_GAP = 4.5
TEST_YEAR = "2015"          # one year of data is enough to measure the day-night gap
GRID_LAT, GRID_LON = 0.5, 0.625   # size of one NASA (MERRA-2) grid square, in degrees

# Places where the sea test passes but the city's square is still unusable, so a neighbouring
# square is chosen by hand: place -> (latitude, longitude, reason written to the manifest).
# Toronto's square is mostly Lake Ontario. Its nights appear to warm 1.0 C per decade with sudden
# jumps around 1997 and 2005, while the land squares around it all show a steady 0.3 to 0.4 C.
FORCED_POINTS = {
    "Toronto": (44.0, -79.375, "moved 39 km north by hand: city square is mostly Lake Ontario "
                               "and its temperature record has artificial jumps"),
}

# The places: (name, region, latitude, longitude) of the real city centre.
# A new city is one more line in this list. Negative latitude means south, negative longitude means west.
PLACES = [
    # --- 12 UK towns: the in-depth analysis ---
    ("London", "UK", 51.51, -0.13),
    ("Maidstone", "UK", 51.27, 0.52),
    ("Norwich", "UK", 52.63, 1.30),
    ("Plymouth", "UK", 50.38, -4.14),
    ("Bristol", "UK", 51.45, -2.59),
    ("Cardiff", "UK", 51.48, -3.18),
    ("Birmingham", "UK", 52.48, -1.90),
    ("Manchester", "UK", 53.48, -2.24),
    ("Newcastle", "UK", 54.98, -1.61),
    ("Belfast", "UK", 54.60, -5.93),
    ("Edinburgh", "UK", 55.95, -3.19),
    ("Aberdeen", "UK", 57.15, -2.09),
    # --- 12 big world cities: every inhabited continent ---
    ("New York", "World", 40.71, -74.01),
    ("Los Angeles", "World", 34.05, -118.24),
    ("Toronto", "World", 43.65, -79.38),
    ("Sao Paulo", "World", -23.55, -46.63),
    ("Paris", "World", 48.86, 2.35),
    ("Berlin", "World", 52.52, 13.40),
    ("Madrid", "World", 40.42, -3.70),
    ("Cairo", "World", 30.04, 31.24),
    ("Delhi", "World", 28.61, 77.21),
    ("Tokyo", "World", 35.68, 139.69),
    ("Sydney", "World", -33.87, 151.21),
    ("Johannesburg", "World", -26.20, 28.05),
]


# ---------------------------------------------------------------- TALKING TO NASA
def fetch(lat, lon, params, start, end):
    """Asks NASA for one place: builds the web address, sends it and returns the reply as a dictionary."""
    query = urllib.parse.urlencode({
        "parameters": ",".join(params), "community": "AG",
        "latitude": lat, "longitude": lon,
        "start": start, "end": end, "format": "JSON",
    })
    with urllib.request.urlopen(API + "?" + query, timeout=180) as reply:
        return json.loads(reply.read().decode("utf-8"))


def fetch_with_retry(lat, lon, params, start=START, end=END):
    """Same as fetch, but if NASA's server hiccups it waits 10 seconds and tries once more."""
    try:
        return fetch(lat, lon, params, start, end)
    except Exception as first_error:
        print("    request failed (%s); retrying in 10s" % first_error)
        time.sleep(10)
        return fetch(lat, lon, params, start, end)


# ---------------------------------------------------------------- VALIDATING A PLACE
def day_night_gap(lat, lon):
    """Downloads one test year for this point and returns the average (daily max - daily min)."""
    reply = fetch_with_retry(lat, lon, ["T2M_MAX", "T2M_MIN"], TEST_YEAR + "0101", TEST_YEAR + "1231")
    highs = reply["properties"]["parameter"]["T2M_MAX"]
    lows = reply["properties"]["parameter"]["T2M_MIN"]
    # Days NASA marks as missing (-999) are ignored, then the gap is averaged over the year.
    gaps = [highs[d] - lows[d] for d in highs if highs[d] > -900 and lows[d] > -900]
    time.sleep(1.5)
    return sum(gaps) / len(gaps)


def neighbour_squares(lat, lon):
    """Returns the centres of the 8 grid squares around this point, nearest to the city first."""
    # First comes the centre of the grid square the city sits in.
    centre_lat = round(lat / GRID_LAT) * GRID_LAT
    centre_lon = round((lon + 180) / GRID_LON) * GRID_LON - 180
    options = []
    for step_lat in (-1, 0, 1):
        for step_lon in (-1, 0, 1):
            if step_lat == 0 and step_lon == 0:
                continue                      # that is the city's own square, already tested
            new_lat = round(centre_lat + step_lat * GRID_LAT, 4)
            new_lon = round(centre_lon + step_lon * GRID_LON, 4)
            # Rough distance in km from the real city to this square's centre.
            km_north = (new_lat - lat) * 111
            km_east = (new_lon - lon) * 111 * math.cos(math.radians(lat))
            options.append((math.hypot(km_north, km_east), new_lat, new_lon))
    return sorted(options)


def choose_point(lat, lon):
    """Decides which coordinates get downloaded: the city itself, or the nearest land square."""
    gap = day_night_gap(lat, lon)
    if gap >= SEA_GAP:
        return lat, lon, gap, "ok: city square is land"

    # The city's own square looks like sea, so the neighbours are tried, closest first.
    print("    city square looks like sea (day-night gap %.1f C); checking neighbours" % gap)
    for distance, new_lat, new_lon in neighbour_squares(lat, lon):
        new_gap = day_night_gap(new_lat, new_lon)
        if new_gap >= SEA_GAP:
            note = "moved %.0f km to nearest land square (city square gap was %.1f C)" % (distance, gap)
            return new_lat, new_lon, new_gap, note

    # No land square nearby (a small island, say): the city point is kept but flagged.
    return lat, lon, gap, "WARNING: sea-dominated, no land square nearby"


# ---------------------------------------------------------------- FULL DOWNLOAD
def download_place(lat, lon):
    """Gets all 15 variables for 1981-2025. If NASA rejects the big request, they are fetched one by one."""
    try:
        return fetch_with_retry(lat, lon, PARAMETERS), PARAMETERS
    except Exception as error:
        print("    full request failed (%s); trying one variable at a time" % error)

    merged, got = None, []
    for name in PARAMETERS:
        try:
            part = fetch_with_retry(lat, lon, [name])
        except Exception as error:
            print("    SKIPPED %s: %s" % (name, error))
            continue
        if merged is None:
            merged = part
        else:
            merged["properties"]["parameter"].update(part["properties"]["parameter"])
            merged.get("parameters", {}).update(part.get("parameters", {}))
        got.append(name)
        time.sleep(2)
    if merged is None:
        raise RuntimeError("no variables could be downloaded")
    return merged, got


def already_have(path, lat, lon):
    """Returns the saved file's contents if it exists AND was downloaded at these coordinates."""
    if not (os.path.exists(path) and os.path.getsize(path) > 100000):
        return None
    with open(path, encoding="utf-8") as f:
        saved = json.load(f)
    saved_lon, saved_lat = saved["geometry"]["coordinates"][:2]
    if abs(saved_lat - lat) > 0.001 or abs(saved_lon - lon) > 0.001:
        return None                           # same place name but different point, so it gets redone
    return saved


# ---------------------------------------------------------------- MAIN PROGRAM
def main():
    """For each place this validates the point, downloads it, then writes the manifest and the zip."""
    os.makedirs(RAW_DIR, exist_ok=True)
    manifest, failed = [], []

    for number, (place, region, lat, lon) in enumerate(PLACES, 1):
        filename = place.replace(" ", "_") + ".json"
        path = os.path.join(RAW_DIR, filename)
        print("[%d/%d] %s" % (number, len(PLACES), place))

        try:
            # Step 1, validation: this finds coordinates whose grid square is land, not sea.
            # A place with a hand-picked square skips the search and uses that square.
            if place in FORCED_POINTS:
                use_lat, use_lon, note = FORCED_POINTS[place]
                gap = day_night_gap(use_lat, use_lon)
            else:
                use_lat, use_lon, gap, note = choose_point(lat, lon)
            print("    %s -> using (%.3f, %.3f), day-night gap %.1f C" % (note, use_lat, use_lon, gap))

            # Step 2: the full 45 years are downloaded, unless exactly this point is already saved.
            saved = already_have(path, use_lat, use_lon)
            if saved is not None:
                got = list(saved["properties"]["parameter"].keys())
                print("    already downloaded, keeping existing file")
            else:
                data, got = download_place(use_lat, use_lon)
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(data, f)
                print("    saved %.1f MB, %d variables" % (os.path.getsize(path) / 1e6, len(got)))
                time.sleep(4)
        except Exception as error:
            print("    FAILED: %s" % error)
            failed.append(place)
            continue

        # Step 3: what was done for this place is recorded (it goes into manifest.csv).
        manifest.append({
            "place": place, "region": region,
            "lat": use_lat, "lon": use_lon,              # the point the data really comes from
            "city_lat": lat, "city_lon": lon,            # the real city centre (what a map should show)
            "day_night_gap": round(gap, 2), "validation": note,
            "file": filename,
            "downloaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "variables": " ".join(got),
        })

    if not manifest:
        print("\nNothing was downloaded. Check your internet connection and run again.")
        return

    # The manifest is a small index: which place is in which file, and how it was validated.
    with open(os.path.join(RAW_DIR, "manifest.csv"), "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(manifest[0].keys()))
        writer.writeheader()
        writer.writerows(manifest)

    # The manifest and this run's files are bundled into one zip (old, unlisted cities are left out).
    with zipfile.ZipFile("power_raw.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
        bundle.write(os.path.join(RAW_DIR, "manifest.csv"), arcname="manifest.csv")
        for row in manifest:
            bundle.write(os.path.join(RAW_DIR, row["file"]), arcname=row["file"])

    # Final report: what moved, what needs attention.
    print("\nDone: %d of %d places. Zip: power_raw.zip" % (len(manifest), len(PLACES)))
    for row in manifest:
        if not row["validation"].startswith("ok"):
            print("  %s: %s" % (row["place"], row["validation"]))
    if failed:
        print("Failed (run the script again to retry just these): " + ", ".join(failed))


if __name__ == "__main__":
    main()
