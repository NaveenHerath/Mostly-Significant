# turns naveen's csvs into one json file the website can load
# run it from anywhere: python3 docs/data/make_data.py
# it only reads data-generation/, never writes there

import csv  # for reading the csv files
import json  # for writing the json file
import statistics  # for the median (used for the trend line)
from pathlib import Path  # nicer way to handle file paths

HERE = Path(__file__).resolve().parent  # the folder this script lives in (docs/data)
SRC = HERE.parent.parent / "data-generation" / "data" / "results"  # naveen's results folder
OUT = HERE / "data.json"  # where the json goes


def read(name):  # small helper to read a csv into a list of dicts
    with open(SRC / name, encoding="utf-8") as f:  # utf-8 because units have the degree sign
        return list(csv.DictReader(f))  # each row becomes a dict keyed by column name


def num(s):  # turns a csv cell into a number, or None if it's blank
    return float(s) if s.strip() != "" else None  # blank means the event didn't happen, not zero


results = read("results.csv")  # one row per place and measure
annual = read("annual.csv")  # one row per place, measure and year
luck = read("luck.csv")  # one row per place and measure

# group the yearly values by place and measure so we can look them up fast
years = {}  # {(place, measure_id): {year: value}}
for r in annual:  # go through every yearly row
    key = (r["place"], r["measure_id"])  # which series this belongs to
    years.setdefault(key, {})[int(r["year"])] = num(r["value"])  # store value under its year

# same for luck, just one row each
luck_by = {(r["place"], r["measure_id"]): r for r in luck}  # quick lookup table

places = {}  # place name -> region, lat, lon (filled as we go)
measures = {}  # measure id -> name, unit, season etc (same everywhere, so stored once)
rows = {}  # place -> measure id -> the actual numbers

for r in results:  # go through all 240 result rows
    p, m = r["place"], r["measure_id"]  # short names for place and measure

    places[p] = {"region": r["region"], "lat": float(r["lat"]), "lon": float(r["lon"])}  # pin info for the map

    measures[m] = {  # bits that don't change between places
        "name": r["measure_name"],  # e.g. "Heatwave days per year"
        "unit": r["unit"],  # e.g. "days" or "day of year"
        "season": r["season"],  # summer, winter, year etc
        "direction": r["expected_direction"],  # which way the hunch claims (up/down)
        "definition": r["plain_definition"],  # one plain sentence for the public
    }

    start, end = int(r["start_year"]), int(r["end_year"])  # 1981 (or 1982 for southern cities) to 2025
    series = years.get((p, m), {})  # yearly values for this place and measure
    values = [series.get(y) for y in range(start, end + 1)]  # one slot per year, None where missing

    slope = float(r["rate_per_decade"]) / 10  # sen's slope per year (the csv gives it per decade)
    pts = [(y, v) for y, v in zip(range(start, end + 1), values) if v is not None]  # only years with data
    intercept = statistics.median(v - slope * y for y, v in pts)  # usual way to place a sen's slope line

    lk = luck_by.get((p, m), {})  # luck row (should always exist, but just in case)

    rows.setdefault(p, {})[m] = {  # everything the page needs for one answer
        "start": start,  # first year of the series
        "values": values,  # yearly numbers, lined up from start year
        "rate": float(r["rate_per_decade"]),  # change per 10 years
        "early": float(r["early_mean"]),  # 1981-1990 average
        "late": float(r["late_mean"]),  # 2016-2025 average
        "p": float(r["p_value"]),  # p value from mann-kendall (for the how-it-works bit)
        "n_years": int(r["n_years"]),  # how many years actually went into the trend
        "verdict": r["verdict"],  # real / leaning / not_backed / opposite
        "caveat": r["caveat"],  # honest limitation for this row
        "share": num(lk.get("share_as_strong", "")),  # share of shuffles as strong as the real trend
        "shuffles": int(lk.get("n_shuffles", 1000) or 1000),  # how many shuffles were done (1,000)
        "intercept": round(intercept, 4),  # where the trend line sits, so the page does no maths
    }

data = {"places": places, "measures": measures, "rows": rows}  # the whole thing
OUT.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")  # compact json
print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB, {len(results)} rows)")  # quick sanity line

# known figures from the analysis, so we can eyeball them
checks = [  # (place, measure, expected early, expected late, expected verdict)
    ("London", "heatwave_days", 7.2, 18.7, "real"),
    ("London", "warm_nights", 12.9, 27.9, "real"),
    ("London", "summer_length", 77.2, 107.7, "real"),
    ("London", "first_frost_doy", 321.5, 326.8, "leaning"),
    ("Plymouth", "summer_dry_spell", 15.3, 11.7, "opposite"),
]
for p, m, e, l, v in checks:  # go through each test case
    got = rows[p][m]  # what we actually wrote
    ok = (got["early"], got["late"], got["verdict"]) == (e, l, v)  # does it match exactly?
    print(f"{'ok  ' if ok else 'FAIL'} {p} / {m}: {got['early']} -> {got['late']}, {got['verdict']}")  # show it
print("ok   Cairo has frost?", "first_frost_doy" in rows["Cairo"], "(should be False)")  # world = heat only
