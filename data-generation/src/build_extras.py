"""
STEP 5 - EXTRAS: this writes the two extra files behind the app's "could this be luck?"
answer and its season clock.

How it is run: python src/build_extras.py, after src/build_results.py
Reads:  data/clean/daily.parquet, data/results/annual.csv, data/results/results.csv
Writes: data/results/luck.csv          one row per place per measure
        data/results/season_dates.csv  one row per UK town per year

THE LUCK TEST IN PLAIN WORDS
  If the weather had no trend, the order of the years would not matter. So the yearly values
  are shuffled into a random order 1,000 times, and each time the trend is measured again.
  The share of shuffles with a trend at least as strong as the real one is the chance that
  the real pattern is just luck. A share of 0.02 means only 20 shuffles in 1,000 matched it.
"""
import os

import numpy as np
import pandas as pd

from measures import yearly_measures

RESULTS_DIR = os.path.join("data", "results")
SHUFFLES = 1000
SEED = 2026        # a fixed starting point, so the file comes out the same on every run


def trend_score(values):
    """Scores the trend in each row of values the way the Mann-Kendall test does: every pair
    of years is compared, +1 if the later year is higher and -1 if it is lower, then summed."""
    later_minus_earlier = values[:, None, :] - values[:, :, None]
    each_pair_once = np.triu(np.ones(values.shape[1:] * 2, dtype=bool), k=1)
    return (np.sign(later_minus_earlier) * each_pair_once).sum(axis=(1, 2))


def luck_share(values, rng):
    """Returns the share of random shuffles whose trend is at least as strong as the real one."""
    values = values[~np.isnan(values)]              # years with no value are left out
    real = abs(trend_score(values[None, :])[0])
    shuffled = rng.permuted(np.tile(values, (SHUFFLES, 1)), axis=1)
    # Strength ignores direction, so a strong fall counts as much as a strong rise.
    return (np.abs(trend_score(shuffled)) >= real).mean()


def build_luck():
    """Runs the shuffle test for every place and measure in the results."""
    annual = pd.read_csv(os.path.join(RESULTS_DIR, "annual.csv"))
    results = pd.read_csv(os.path.join(RESULTS_DIR, "results.csv"))
    rng = np.random.default_rng(SEED)
    rows = []
    for row in results.itertuples():
        series = annual[(annual["place"] == row.place) & (annual["measure_id"] == row.measure_id)]
        rows.append({
            "place": row.place, "measure_id": row.measure_id,
            "real_trend_per_decade": row.rate_per_decade,      # the same number as in results.csv
            "share_as_strong": luck_share(series.sort_values("year")["value"].to_numpy(float), rng),
            "n_shuffles": SHUFFLES,
            "p_value": row.p_value,                            # the formula's answer, for comparison
        })
    return pd.DataFrame(rows)


def build_season_dates():
    """Lists, for each UK town and year, the day summer starts, the day it ends and the day
    the first heatwave starts. Days are numbered from 1 January. A blank means it never happened
    that year (no day reached summer warmth, or there was no heatwave)."""
    daily = pd.read_parquet(os.path.join("data", "clean", "daily.parquet"))
    tables = []
    for place, place_daily in daily[daily["region"] == "UK"].groupby("place", sort=False):
        yearly = yearly_measures(place_daily)
        yearly.insert(0, "place", place)
        tables.append(yearly[["place", "year", "summer_start_doy", "summer_end_doy", "first_heatwave_doy"]])
    return pd.concat(tables, ignore_index=True)


if __name__ == "__main__":
    luck = build_luck()
    luck.to_csv(os.path.join(RESULTS_DIR, "luck.csv"), index=False)
    seasons = build_season_dates()
    seasons.to_csv(os.path.join(RESULTS_DIR, "season_dates.csv"), index=False)

    print(f"luck.csv: {len(luck)} rows, season_dates.csv: {len(seasons)} rows\n")
    # The shuffle test and the formula are two routes to the same question, so they should agree.
    agree = ((luck["share_as_strong"] < 0.05) == (luck["p_value"] < 0.05)).mean()
    print(f"Shuffle test and trend test agree on 'under 5%' in {agree:.0%} of rows.")
    print(luck[luck["place"] == "London"].to_string(index=False))
