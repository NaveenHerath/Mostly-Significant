"""
STEP 4 - BUILD RESULTS: this runs the measures for every place and writes the results files
the app reads.

UK towns get all fifteen measures. World cities get the five that mean the same in any climate.

How it is run: python src/build_results.py, after src/clean.py
Reads:  data/clean/daily.parquet
Writes: data/results/results.csv         one row per place per measure (the verdicts)
        data/results/annual.csv          one row per place per measure per year (for charts)
        data/results/results_detail.csv  results.csv plus the second-opinion statistics
        data/results/thresholds.csv      what counts as a hot day / warm night in each place
"""
import os

import pandas as pd

from measures import (MEASURES, WORLD_MEASURES, is_southern, thresholds,
                      warm_season_label, yearly_measures)
from stats import MIN_YEARS, trend_test, verdict

RESULTS_DIR = os.path.join("data", "results")
SEA_GAP = 4.5     # average day-night temperature gap (C) below which a grid square is "mostly sea"
REGIONS = ["UK", "World"]

# The exact column names and order the app expects. The app reads them by name, so they stay as they are.
RESULT_COLUMNS = [
    "place", "region", "lat", "lon", "measure_id", "measure_name", "unit", "season",
    "start_year", "end_year", "n_years", "rate_per_decade", "early_mean", "late_mean",
    "p_value", "test_method", "expected_direction", "verdict", "plain_definition", "caveat",
]


def main():
    daily = pd.read_parquet(os.path.join("data", "clean", "daily.parquet"))
    daily = daily[daily["region"].isin(REGIONS)]
    results, annual, limits = [], [], []

    # The places are handled one at a time, in the order they were downloaded.
    for place, place_daily in daily.groupby("place", sort=False):
        info = place_daily.iloc[0]
        yearly = yearly_measures(place_daily)          # one row per year, one column per measure
        limits.append({"place": place, **thresholds(place_daily)})

        # Sea check: over open sea, days and nights differ by only 2-4 C. If this place looks
        # like that, NASA's grid square is mostly water and the numbers are not the town's.
        day_night_gap = (place_daily["T2M_MAX"] - place_daily["T2M_MIN"]).mean()
        sea_note = ("PROVISIONAL: this grid square is mostly sea, so values understate the town. "
                    if day_night_gap < SEA_GAP else "")
        limits[-1]["day_night_gap"] = day_night_gap
        limits[-1]["sea_dominated"] = day_night_gap < SEA_GAP
        limits[-1]["warm_season"] = warm_season_label(place_daily)

        # South of the equator a "year" runs July to June, and the app's reader is told so.
        south_note = ("Years here run July to June (named after the year they end in), "
                      "so each one holds a whole southern summer. " if is_southern(place_daily) else "")

        # World cities only get the measures that make sense in any climate.
        wanted = WORLD_MEASURES if info["region"] == "World" else list(MEASURES)

        for measure_id in wanted:
            meta = MEASURES[measure_id]
            # The yearly values are saved in "long" format for the app's charts.
            series = yearly[["year", measure_id]].rename(columns={measure_id: "value"})
            series.insert(0, "measure_id", measure_id)
            series.insert(0, "place", place)
            annual.append(series)

            # The series is tested for a trend, then the verdict is decided.
            stats = trend_test(yearly["year"], yearly[measure_id])
            results.append({
                "place": place, "region": info["region"],
                # The real city centre goes in the results, so the app's map pins the city itself.
                "lat": info["city_lat"], "lon": info["city_lon"],
                "measure_id": measure_id, "measure_name": meta["name"], "unit": meta["unit"],
                # The years really covered: 1981-2025, or 1982-2025 for July-June years.
                "season": meta["season"], "start_year": yearly["year"].min(), "end_year": yearly["year"].max(),
                "expected_direction": meta["expected"], "verdict": verdict(stats, meta["expected"]),
                "plain_definition": meta["definition"],
                # Warnings go in front of the standard caveat when they apply.
                "caveat": sea_note + south_note
                          + ("Too few years with a value to test a trend. " if stats["n_years"] < MIN_YEARS else "")
                          + meta["caveat"],
                **stats,
            })

    # Numbers are rounded for readability, then the files are written.
    detail = pd.DataFrame(results)
    for col in ["rate_per_decade", "early_mean", "late_mean", "lr_rate_per_decade", "lr_ci_low", "lr_ci_high"]:
        detail[col] = detail[col].round(2)
    for col in ["p_value", "lr_p_value"]:
        detail[col] = detail[col].round(4)

    os.makedirs(RESULTS_DIR, exist_ok=True)
    detail[RESULT_COLUMNS].to_csv(os.path.join(RESULTS_DIR, "results.csv"), index=False)
    detail.to_csv(os.path.join(RESULTS_DIR, "results_detail.csv"), index=False)
    pd.concat(annual).to_csv(os.path.join(RESULTS_DIR, "annual.csv"), index=False)
    pd.DataFrame(limits).round(2).to_csv(os.path.join(RESULTS_DIR, "thresholds.csv"), index=False)

    # A quick overview is printed: places down the side, measures across, verdicts in the cells.
    print(f"results.csv: {len(detail)} rows\n")
    # A dash marks a measure that is not produced for that place (UK-only measures in world cities).
    print(detail.pivot(index="place", columns="measure_id", values="verdict").fillna("-").to_string())
    print("\nSea-dominated places:", [x["place"] for x in limits if x["sea_dominated"]])
    print("Methods disagree on:", detail.loc[detail["methods_disagree"], ["place", "measure_id"]].values.tolist())


if __name__ == "__main__":
    main()
