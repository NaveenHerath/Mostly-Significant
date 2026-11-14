"""
STEP 1 - CLEAN: this turns the raw NASA files into one tidy table and checks it.

How it is run: python src/clean.py
Reads:  data/raw/<place>.json  and  data/raw/manifest.csv
Writes: data/clean/daily.parquet     (one row per place per day, 15 variables)
        data/clean/data_checks.csv   (the pass/fail list of data checks)
"""
import json
import os

import numpy as np
import pandas as pd

RAW_DIR = os.path.join("data", "raw")
CLEAN_DIR = os.path.join("data", "clean")


def load_place(place, filename):
    """Reads one raw NASA file and returns a table: one row per day, one column per variable."""
    with open(os.path.join(RAW_DIR, filename), encoding="utf-8") as f:
        raw = json.load(f)
    # NASA stores each variable as {"19810101": value, ...}; a DataFrame lines them up by date.
    table = pd.DataFrame(raw["properties"]["parameter"])
    table.index = pd.to_datetime(table.index, format="%Y%m%d")
    # NASA writes -999 when a value is missing; those become real blanks (NaN) here.
    table = table.replace(-999.0, np.nan)
    table.insert(0, "place", place)
    return table.rename_axis("date").reset_index()


def build_daily():
    """Loads every place listed in the manifest and stacks them into one big table."""
    manifest = pd.read_csv(os.path.join(RAW_DIR, "manifest.csv"))
    tables = [load_place(row.place, row.file) for row in manifest.itertuples()]
    daily = pd.concat(tables, ignore_index=True)
    # Region (UK / World) and coordinates are attached so later steps don't need the manifest.
    # lat/lon is the point the data comes from; city_lat/city_lon is the real city centre.
    if "city_lat" not in manifest.columns:
        manifest["city_lat"], manifest["city_lon"] = manifest["lat"], manifest["lon"]
    return daily.merge(manifest[["place", "region", "lat", "lon", "city_lat", "city_lon"]], on="place")


def run_checks(daily):
    """Runs the eleven data checks and returns them as a pass/fail table."""
    checks = []

    def add(name, passed, detail):
        checks.append({"check": name, "passed": bool(passed), "detail": detail})

    # Every place should have every day from 1 Jan 1981 to 31 Dec 2025 (16,436 days).
    days = daily.groupby("place")["date"].agg(["min", "max", "count"])
    add("full date coverage", (days["count"] == 16436).all(),
        f"{days['count'].min()} to {days['count'].max()} days per place")

    # Missing values: only sunshine and cloud should have gaps, and almost all before 1984.
    # The satellite record occasionally misses a single day later on, so a handful of stray
    # gaps (under 0.1% of days) is allowed, and the places they fall in are named.
    variables = [c for c in daily.columns if c not in ("date", "place", "region", "lat", "lon", "city_lat", "city_lon")]
    blanks = daily[variables].isna().sum()
    blanks = blanks[blanks > 0]
    late = daily[daily["date"] >= "1984-01-01"]
    late_gaps = late[late[variables].isna().any(axis=1)]
    add("missing values only in sunshine/cloud, almost all before 1984",
        set(blanks.index) <= {"ALLSKY_SFC_SW_DWN", "CLOUD_AMT"} and len(late_gaps) < 0.001 * len(late),
        f"blank counts: {blanks.to_dict()}; days with a gap from 1984 on: {len(late_gaps)} "
        f"{late_gaps['place'].value_counts().to_dict()}")

    # Physical ranges: nothing impossible in the numbers.
    uk = daily[daily["region"] == "UK"]
    add("UK temperature between -20 and 45 C",
        uk["T2M_MIN"].min() > -20 and uk["T2M_MAX"].max() < 45,
        f"coldest {uk['T2M_MIN'].min():.1f}, hottest {uk['T2M_MAX'].max():.1f}")
    add("rainfall never negative", daily["PRECTOTCORR"].min() >= 0,
        f"minimum {daily['PRECTOTCORR'].min()}")
    add("humidity between 0 and 100", daily["RH2M"].between(0, 100).all(),
        f"{daily['RH2M'].min():.1f} to {daily['RH2M'].max():.1f}")
    add("soil wetness between 0 and 1",
        daily["GWETROOT"].between(0, 1).all() and daily["GWETTOP"].between(0, 1).all(),
        f"root {daily['GWETROOT'].min()} to {daily['GWETROOT'].max()}")

    # Believable warming: real places have warmed about 0.2 to 0.5 C per decade. A much faster
    # rise means the grid square has a fault in its record (seen once, over Lake Ontario).
    yearly_night = daily.groupby(["place", daily["date"].dt.year])["T2M_MIN"].mean().unstack()
    warming = yearly_night.apply(lambda row: np.polyfit(row.index, row.values, 1)[0] * 10, axis=1)
    add("no place warms faster than 0.8 C per decade at night", warming.max() < 0.8,
        f"fastest is {warming.idxmax()} at {warming.max():.2f} C per decade")

    # Known events: if the data is right, famous weather should show up in it.
    london = daily[daily["place"] == "London"].set_index("date")
    hottest = london["T2M_MAX"].idxmax()
    add("London's hottest day is 19 July 2022", hottest == pd.Timestamp("2022-07-19"),
        f"hottest day is {hottest.date()} at {london['T2M_MAX'].max():.1f} C")

    # December 2010 was the coldest December in a century: it should rank coldest here too.
    december = london[london.index.month == 12]["T2M"].groupby(lambda d: d.year).mean()
    add("December 2010 is London's coldest December", december.idxmin() == 2010,
        f"coldest December is {december.idxmin()} at {december.min():.1f} C")

    # Storm Eunice (18 Feb 2022): wind that day should be in the top 1% of all days.
    eunice = london.loc["2022-02-18", "WS10M_MAX"]
    add("Storm Eunice shows as extreme wind", eunice >= london["WS10M_MAX"].quantile(0.99),
        f"18 Feb 2022 max wind {eunice} m/s vs 99th percentile "
        f"{london['WS10M_MAX'].quantile(0.99):.1f}")

    # Drought summers 2018 and 2022: soil wetness should be among the 10 driest summers.
    summer = london[london.index.month.isin([6, 7, 8])]["GWETROOT"].groupby(lambda d: d.year).mean()
    ranks = summer.rank()
    add("summers 2018 and 2022 have dry soil", ranks[2018] <= 10 and ranks[2022] <= 10,
        f"2018 is {int(ranks[2018])} driest, 2022 is {int(ranks[2022])} driest of {len(ranks)}")

    return pd.DataFrame(checks)


if __name__ == "__main__":
    os.makedirs(CLEAN_DIR, exist_ok=True)
    daily = build_daily()
    daily.to_parquet(os.path.join(CLEAN_DIR, "daily.parquet"), index=False)
    checks = run_checks(daily)
    checks.to_csv(os.path.join(CLEAN_DIR, "data_checks.csv"), index=False)
    print(f"Saved {len(daily):,} rows for {daily['place'].nunique()} places.\n")
    for c in checks.itertuples():
        print(("PASS  " if c.passed else "FAIL  ") + c.check + "  ->  " + c.detail)
