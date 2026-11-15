# Turns the two timeline csvs into one json file for the "Watch it change" map.
# Run from anywhere: python3 docs/data/make_timeline.py
# It only reads data-generation/ and writes docs/data/timeline.json. Standard library only,
# so it runs in the Vercel build without installing anything.

import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE.parent.parent / "data-generation" / "data" / "results"
OUT = HERE / "timeline.json"
FIRST_YEAR, LAST_YEAR = 1981, 2025  # every list in the json has one slot per year in this range


def read(name):
    """Reads one csv into a list of dictionaries keyed by column name."""
    with open(SRC / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def num(text):
    """A csv cell as a number; a blank cell (no value that year) becomes None."""
    return float(text) if text.strip() != "" else None


# If the csvs are not there (a deploy without the analysis folder), the json already in the
# repo is kept, so the build does not fail.
needed = ["timeline_years.csv", "timeline_trends.csv", "results.csv"]
if not all((SRC / name).exists() for name in needed):
    print(f"timeline csvs not found in {SRC}; keeping the existing {OUT.name}")
    raise SystemExit(0)

# The pin positions come from results.csv, which holds the real city centres.
places = {}
for r in read("results.csv"):
    places.setdefault(r["place"], {"region": r["region"], "lat": float(r["lat"]), "lon": float(r["lon"])})

# One list per column, lined up from FIRST_YEAR, for each place and variable.
slots = LAST_YEAR - FIRST_YEAR + 1
columns = {"value": "value", "vs_normal": "vs", "value_10yr": "value10", "vs_normal_10yr": "vs10"}
series = {}
for r in read("timeline_years.csv"):
    lists = series.setdefault((r["place"], r["variable_id"]), {short: [None] * slots for short in columns.values()})
    for column, short in columns.items():
        lists[short][int(r["year"]) - FIRST_YEAR] = num(r[column])

# The trend row adds the normal, the rate and the tested direction to each series. The details
# of a variable (name, unit, definition) are the same everywhere, so they are stored once.
variables = {}
rows = {}
for r in read("timeline_trends.csv"):
    variables.setdefault(r["variable_id"], {
        "name": r["variable_name"], "unit": r["unit"], "compare": r["compare_as"],
        "nasa": r["nasa_variable"], "definition": r["plain_definition"],
    })
    rows.setdefault(r["place"], {})[r["variable_id"]] = {
        **series[(r["place"], r["variable_id"])],
        "normal": float(r["normal"]), "rate": float(r["rate_per_decade"]), "p": float(r["p_value"]),
        "change": r["change"], "n_years": int(r["n_years"]),
        "early": float(r["early_mean"]), "late": float(r["late_mean"]),
    }

data = {"first_year": FIRST_YEAR, "last_year": LAST_YEAR, "window": 10, "baseline": [1981, 2010],
        "places": {p: places[p] for p in places if p in rows}, "variables": variables, "rows": rows}
OUT.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB, {len(rows)} places, {len(variables)} variables)")

# Two known figures, to see at a glance that the file is right.
london = rows["London"]["avg_temp"]
print("London 10-year average temperature, 1990 and 2025:", london["value10"][1990 - FIRST_YEAR], london["value10"][-1],
      "(should be 9.6 and 10.92)")
print("Singapore has rain?", "rain_total" in rows["Singapore"], "(should be False)")
