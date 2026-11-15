"""
STEP 6 - CASE-FILE EXTRAS: this writes the four small files behind the app's case-file panel.

How it is run: python src/build_casefile.py, after src/build_results.py
Reads:  data/clean/daily.parquet, data/results/annual.csv, data/results/results_detail.csv
Writes: data/results/years_to_know.csv  one row per 'leaning' result: when it could be proven
        data/results/luck_lines.csv     the real trend line plus 50 shuffled ones, for the animation
        data/results/top_changes.csv    each place's measures ranked from most to least changed
        data/results/stripes.csv        each place's yearly mean temperature, for warming stripes

YEARS UNTIL WE'D KNOW, IN PLAIN WORDS
  The Mann-Kendall test gives every series a score (z). A trend counts as proven when the score
  reaches 1.96. If a trend and its year-to-year noise stay the same, the score grows with the
  length of the record in a known way: in proportion to (number of years) to the power 1.5.
  So from today's score and today's record length, the length needed to reach 1.96 follows:

      years needed = years so far x (1.96 / score today) ^ (2/3)

  Example: a score of 1.4 after 45 years needs 45 x (1.96 / 1.4)^(2/3) = 56 years, so about
  11 more. It is an estimate of "if this continues", not a promise.
"""
import math
import os

import numpy as np
import pandas as pd
from scipy import stats as sps

RESULTS_DIR = os.path.join("data", "results")
PROVEN_SCORE = 1.96      # the Mann-Kendall score that matches the 5% significance bar
LIFETIME = 100           # more extra years than this is reported as "not within a lifetime"
LINES = 50               # shuffled trend lines saved per result (enough for an animation)
SEED = 2026              # a fixed starting point, so the files come out the same on every run
BASELINE = (1981, 2010)  # the "normal" years the stripes are coloured against


def build_years_to_know(annual, detail):
    """Estimates, for each 'leaning' result, how long the record must get before it is proven."""
    # The record length runs from the first year that has a value: sunshine starts in 1984 and
    # winter rain in 1982, so their records are shorter than the 45 years of the other measures.
    first_value_year = annual.dropna(subset=["value"]).groupby(["place", "measure_id"])["year"].min()
    rows = []
    for r in detail[detail["verdict"] == "leaning"].itertuples():
        years_so_far = r.end_year - first_value_year[(r.place, r.measure_id)] + 1
        wanted = 1 if r.expected_direction == "up" else -1
        row = {"place": r.place, "measure_id": r.measure_id, "years_so_far": years_so_far,
               "score_now": round(r.mk_z, 2), "years_needed": np.nan, "extra_years": np.nan,
               "year_we_would_know": np.nan}

        # A score of zero, or one pointing the other way, gives nothing to project forward.
        if not r.mk_z * wanted > 0:
            row["note"] = "No steady trend to project yet."
        else:
            needed = years_so_far * (PROVEN_SCORE / abs(r.mk_z)) ** (2 / 3)
            extra = max(1, math.ceil(needed - years_so_far))
            if extra > LIFETIME:
                row["note"] = "At this rate it would not be proven within a lifetime."
            else:
                row.update(years_needed=round(needed), extra_years=extra,
                           year_we_would_know=r.end_year + extra)
                row["note"] = f"If this continues, about {extra} more years of data would prove it."
        rows.append(row)
    table = pd.DataFrame(rows)
    # Whole numbers that can be blank are stored as nullable integers, so 2036 is not written 2036.0.
    for col in ["years_needed", "extra_years", "year_we_would_know"]:
        table[col] = table[col].astype("Int64")
    return table


def build_luck_lines(annual, detail):
    """Saves the real trend line of every tested result, then 50 lines from shuffled years."""
    rng = np.random.default_rng(SEED)
    rows = []
    tested = detail[detail["test_method"] != "too few years"]
    series_by_key = {key: s.sort_values("year") for key, s in annual.groupby(["place", "measure_id"])}

    for r in tested.itertuples():
        series = series_by_key[(r.place, r.measure_id)].dropna(subset=["value"])
        years, values = series["year"].to_numpy(float), series["value"].to_numpy(float)
        for shuffle_id in range(LINES + 1):
            # Line 0 is the real one. The others keep the same values but in a random order of
            # years, which is what the record would look like if there were no trend at all.
            y = values if shuffle_id == 0 else rng.permutation(values)
            line = sps.theilslopes(y, years)          # Sen's slope, the same as in results.csv
            rows.append({
                "place": r.place, "measure_id": r.measure_id, "shuffle_id": shuffle_id,
                "slope_per_decade": line.slope * 10,
                # The line's height at the first and last year, so the app can draw it directly.
                "start_year": r.start_year, "start_value": line.intercept + line.slope * r.start_year,
                "end_year": r.end_year, "end_value": line.intercept + line.slope * r.end_year,
            })
    return pd.DataFrame(rows).round({"slope_per_decade": 2, "start_value": 2, "end_value": 2})


def build_top_changes(detail):
    """Ranks each place's measures by how strong their trend is, strongest first."""
    # The Mann-Kendall score has no units, so heatwave days and millimetres of rain can be
    # compared. Its size is what counts here; the verdict column says which way it went.
    ranked = detail.dropna(subset=["mk_z"]).copy()
    ranked["strength"] = ranked["mk_z"].abs().round(2)
    ranked = ranked.sort_values(["strength"], ascending=False, kind="stable")
    ranked["rank"] = ranked.groupby("place").cumcount() + 1
    # Places stay in their usual order (UK first), with their measures in rank order.
    order = {place: i for i, place in enumerate(detail["place"].unique())}
    ranked = ranked.sort_values(["place", "rank"], key=lambda col: col.map(order) if col.name == "place" else col)
    return ranked[["place", "rank", "measure_id", "measure_name", "verdict", "strength",
                   "rate_per_decade", "early_mean", "late_mean", "unit"]]


def build_stripes(daily):
    """Works out each place's mean temperature per calendar year and how far it is from normal."""
    yearly = (daily.groupby(["place", daily["date"].dt.year.rename("year")], sort=False)["T2M"]
              .mean().rename("mean_temp").reset_index())
    # 'Normal' is the place's own 1981-2010 average. The anomaly is what the stripe colour shows:
    # below zero is a cooler year than normal (blue), above zero a warmer one (red).
    normal = yearly[yearly["year"].between(*BASELINE)].groupby("place")["mean_temp"].mean()
    yearly["anomaly"] = yearly["mean_temp"] - yearly["place"].map(normal)
    return yearly.round(2)


if __name__ == "__main__":
    detail = pd.read_csv(os.path.join(RESULTS_DIR, "results_detail.csv"))
    annual = pd.read_csv(os.path.join(RESULTS_DIR, "annual.csv"))
    daily = pd.read_parquet(os.path.join("data", "clean", "daily.parquet"), columns=["place", "date", "T2M"])

    files = {
        "years_to_know.csv": build_years_to_know(annual, detail),
        "luck_lines.csv": build_luck_lines(annual, detail),
        "top_changes.csv": build_top_changes(detail),
        "stripes.csv": build_stripes(daily),
    }
    for name, table in files.items():
        table.to_csv(os.path.join(RESULTS_DIR, name), index=False)
        print(f"{name}: {len(table)} rows")

    # A quick look at London, to see that the numbers make sense.
    print()
    print(files["years_to_know.csv"].query("place == 'London'").to_string(index=False))
    print()
    print(files["top_changes.csv"].query("place == 'London'").head(5).to_string(index=False))
