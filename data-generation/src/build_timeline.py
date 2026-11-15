"""
STEP 8 - TIMELINE: this writes the two files behind the app's map with a year slider.

How it is run: python src/build_timeline.py, after src/clean.py
Reads:  data/clean/daily.parquet
Writes: data/results/timeline_years.csv   one row per place, variable and year: the slider's data
        data/results/timeline_trends.csv  one row per place and variable: its normal and its trend

WHAT THE MAP SHOWS, IN PLAIN WORDS
  Five everyday variables are worked out for every calendar year in all 38 places. A pin is not
  coloured by the value itself (Dubai would always be red and Aberdeen always blue) but by how
  far that year is from the place's own normal, the 1981-2010 average. Temperatures are compared
  in degrees; rain and sunshine in percent, so a dry city and a wet one fit on one colour scale.

  A single year is mostly weather. The 10-year average (the 10 years ending in the slider's
  year) is climate. Both are saved so the app can switch between them: at 1990 the 10-year
  average is the "1980s" figure and at 2025 the "recent" one, the same pair used in results.csv.

  Every series is also tested with the same trend test as the hunches, so the app can say
  whether a change is proven instead of leaving the user to judge it by eye.
"""
import os

import numpy as np
import pandas as pd

from stats import SIGNIFICANT, direction, trend_test

RESULTS_DIR = os.path.join("data", "results")
BASELINE = (1981, 2010)  # the "normal" years every place is compared with
WINDOW = 10              # years in the smoothed average
MIN_DAYS = 350           # a year with fewer valid days than this gets no value

# One entry per variable on the map: (id, name, NASA variable, how the year is summed up, unit,
# how a year is compared with normal, a plain sentence for the public).
VARIABLES = [
    ("avg_temp", "Average temperature", "T2M", "mean", "°C", "difference",
     "The average temperature across the whole year, day and night."),
    ("day_temp", "Daytime highs", "T2M_MAX", "mean", "°C", "difference",
     "The average of each day's highest temperature across the year."),
    ("night_temp", "Night-time lows", "T2M_MIN", "mean", "°C", "difference",
     "The average of each night's lowest temperature across the year."),
    ("rain_total", "Rain", "PRECTOTCORR", "sum", "mm", "percent",
     "All the rain that fell in the year, added up."),
    ("sunshine", "Sunshine", "ALLSKY_SFC_SW_DWN", "mean", "MJ/m² per day", "percent",
     "The average energy from the sun reaching the ground each day (records start in 1984)."),
]

# Series left out because the data is plainly wrong. Singapore's rain more than doubles after
# 2020 (7,465 mm in 2025 against about 2,400 mm a year before), which no rain gauge there shows.
EXCLUDED = {("Singapore", "rain_total")}


def yearly_values(daily):
    """Turns the daily table into one value per place, variable and calendar year."""
    year = daily["date"].dt.year.rename("year")
    tables = []
    for var_id, _, column, how, *_ in VARIABLES:
        grouped = daily.groupby(["place", year], sort=False)[column]
        value = grouped.agg(how)
        # A year missing more than a couple of weeks is left blank (sunshine before 1984).
        value[grouped.count() < MIN_DAYS] = np.nan
        tables.append(value.rename("value").reset_index().assign(variable_id=var_id))
    yearly = pd.concat(tables, ignore_index=True)
    excluded = pd.MultiIndex.from_frame(yearly[["place", "variable_id"]]).isin(EXCLUDED)
    return yearly[~excluded]


def add_comparisons(yearly):
    """Adds the 10-year average and how far each figure is from the place's own normal."""
    compare_as = {v[0]: v[5] for v in VARIABLES}
    keys = ["place", "variable_id"]
    yearly = yearly.sort_values(keys + ["year"], kind="stable").reset_index(drop=True)

    # The average of the 10 years ending in each year; blank until 10 full years exist.
    yearly["value_10yr"] = (yearly.groupby(keys, sort=False)["value"]
                            .transform(lambda s: s.rolling(WINDOW, min_periods=WINDOW).mean()))

    in_baseline = yearly["year"].between(*BASELINE)
    normal = yearly[in_baseline].groupby(keys)["value"].mean().rename("normal")
    yearly = yearly.join(normal, on=keys)

    # Degrees above or below normal for temperatures, percent of normal for rain and sunshine.
    percent = yearly["variable_id"].map(compare_as) == "percent"
    for source, target in [("value", "vs_normal"), ("value_10yr", "vs_normal_10yr")]:
        gap = yearly[source] - yearly["normal"]
        yearly[target] = np.where(percent, 100 * gap / yearly["normal"], gap)
    return yearly


def build_trends(yearly):
    """Tests each place's yearly series for a trend, the same way the hunches are tested."""
    info = {v[0]: v for v in VARIABLES}
    rows = []
    for (place, var_id), series in yearly.groupby(["place", "variable_id"], sort=False):
        result = trend_test(series["year"], series["value"])
        # These variables carry no hunch, so there is no expected direction and no verdict:
        # a proven trend is called by the way it goes, anything else is "no_clear_change".
        if result["p_value"] < SIGNIFICANT and direction(result) != 0:
            change = "rising" if direction(result) > 0 else "falling"
        else:
            change = "no_clear_change"
        _, name, nasa_variable, _, unit, compare_as, definition = info[var_id]
        usable = series.dropna(subset=["value"])
        rows.append({
            "place": place, "variable_id": var_id, "variable_name": name, "unit": unit,
            "nasa_variable": nasa_variable, "compare_as": compare_as,
            "start_year": usable["year"].min(), "end_year": usable["year"].max(),
            "n_years": result["n_years"], "normal": series["normal"].iloc[0],
            "rate_per_decade": result["rate_per_decade"], "early_mean": result["early_mean"],
            "late_mean": result["late_mean"], "p_value": result["p_value"],
            "test_method": result["test_method"], "change": change,
            "plain_definition": definition,
        })
    return pd.DataFrame(rows)


if __name__ == "__main__":
    columns = ["place", "date"] + [v[2] for v in VARIABLES]
    daily = pd.read_parquet(os.path.join("data", "clean", "daily.parquet"), columns=columns)

    yearly = add_comparisons(yearly_values(daily))
    trends = build_trends(yearly)

    # Places and variables are kept in their usual order (UK first, temperature first).
    place_order = {p: i for i, p in enumerate(daily["place"].unique())}
    var_order = {v[0]: i for i, v in enumerate(VARIABLES)}
    def in_order(col):
        return col.map(place_order) if col.name == "place" else col.map(var_order) if col.name == "variable_id" else col
    yearly = yearly.sort_values(["place", "variable_id", "year"], key=in_order, kind="stable")
    trends = trends.sort_values(["place", "variable_id"], key=in_order, kind="stable")

    years_file = yearly[["place", "variable_id", "year", "value", "vs_normal", "value_10yr", "vs_normal_10yr"]]
    files = {
        "timeline_years.csv": years_file.round({"value": 2, "vs_normal": 2, "value_10yr": 2, "vs_normal_10yr": 2}),
        "timeline_trends.csv": trends.round({"normal": 2, "rate_per_decade": 3, "early_mean": 2,
                                             "late_mean": 2, "p_value": 5}),
    }
    for name, table in files.items():
        table.to_csv(os.path.join(RESULTS_DIR, name), index=False)
        print(f"{name}: {len(table)} rows")

    # A quick look at London and at the overall picture, to see that the numbers make sense.
    print()
    print(files["timeline_trends.csv"].query("place == 'London'")
          [["variable_name", "normal", "early_mean", "late_mean", "rate_per_decade", "p_value", "change"]]
          .to_string(index=False))
    print()
    print(files["timeline_trends.csv"].groupby(["variable_id", "change"], sort=False).size().unstack(fill_value=0))
