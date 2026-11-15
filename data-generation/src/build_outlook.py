"""
STEP 7 - OUTLOOK: this works out, for every place and every week of the year, the chance of a
heatwave, a hot day, a warm night, a wet day and a good-weather day. It does so for the 1980s,
for recent years and for next year, and then checks the method against years it has not seen.

How it is run: python src/build_outlook.py, after src/clean.py
Reads:  data/clean/daily.parquet
Writes: data/results/trip_weeks.csv      one row per place per week per period (the chances)
        data/results/outlook_checks.csv  how well the method predicted 2021-2025

THE METHOD IN PLAIN WORDS
  A chance is a count. To get the chance of a hot day in mid-July, every mid-July day in a
  window of years is looked at, and the share of them that were hot is the chance.
  "Then" is 1981-1995 and "now" is 2011-2025, both exactly as recorded.
  For next year the last 30 years are used (the usual length of a climate average), but each
  day is first warmed by the amount the place has been warming since that day, so a day from
  2013 stands in for a day in 2027. Rain and cloud are left as they were, because their trends
  are mostly unproven. In the back-test, 30 warmed years predicted hot days and heatwaves
  better than 15, and about as well as 40.

DEFINITIONS
  Week          : weeks are numbered from 1 January (week 1 = 1-7 January). Week 52 runs to
                  31 December. 29 February is counted with 28 February.
  Hot day       : daily maximum at or above the place's hot-day bar (as in the trend analysis).
  Heatwave day  : a day inside a run of 3 or more hot days.
  Warm night    : daily minimum at or above the place's warm-night bar.
  Above 30 C    : daily maximum of 30 C or more, the same bar everywhere.
  Wet day       : 5 mm of rain or more.
  Good day      : daily maximum between 18 and 28 C, under 1 mm of rain, cloud under 60%.
"""
import os

import numpy as np
import pandas as pd
from scipy import stats as sps

from measures import _run_lengths, thresholds

RESULTS_DIR = os.path.join("data", "results")
OUTLOOK_YEAR = 2027
OUTLOOK_WINDOW = 30      # years of warmed days behind next year's chances
# The three periods in the file: name -> (first year, last year, year the days are shifted to).
PERIODS = {"then": (1981, 1995, None), "now": (2011, 2025, None),
           str(OUTLOOK_YEAR): (2025 - OUTLOOK_WINDOW + 1, 2025, OUTLOOK_YEAR)}
# The back-test pretends it is the end of 2020 and predicts the five years that followed.
TEST_KNOWN_UNTIL, TEST_YEARS, TEST_TARGET = 2020, (2021, 2025), 2023
DAY_LABELS = ["hot_day", "warm_night", "above_30", "wet_day", "good_day"]
ALL_LABELS = ["heatwave_week"] + DAY_LABELS


def add_week(d):
    """Adds the year and the week number (1 to 52, counted from 1 January) to each day."""
    d = d.sort_values("date").reset_index(drop=True).copy()
    d["year"] = d["date"].dt.year
    # In a leap year every day after 28 February is moved back one, so a date always falls
    # in the same week whatever the year.
    day = d["date"].dt.dayofyear - (d["date"].dt.is_leap_year & (d["date"].dt.dayofyear > 59))
    d["week"] = np.minimum((day - 1) // 7 + 1, 52)
    return d


def month_trends(d, last_year):
    """Measures how fast days and nights are warming in each calendar month, in C per year."""
    # A single month is noisy, so each month's trend is measured from that month and its two
    # neighbours together. Only years up to last_year are used (the back-test needs that).
    d = d[d["year"] <= last_year]
    trends = {}
    for column in ("T2M_MAX", "T2M_MIN"):
        for month in range(1, 13):
            around = [(month - 2) % 12 + 1, month, month % 12 + 1]
            yearly = d[d["date"].dt.month.isin(around)].groupby("year")[column].mean()
            trends[(column, month)] = sps.theilslopes(yearly.values, yearly.index).slope
    return trends


def shift_to(d, trends, target_year):
    """Returns the days warmed to stand in for target_year: trend per year x years in between."""
    d = d.copy()
    years_ahead = target_year - d["year"]
    month = d["date"].dt.month
    for column in ("T2M_MAX", "T2M_MIN"):
        d[column] = d[column] + years_ahead * month.map(lambda m: trends[(column, m)])
    return d


def label_days(d, bars):
    """Adds the yes/no labels to each day (1 = yes, 0 = no, blank = cannot be told)."""
    d = d.copy()
    hot = d["T2M_MAX"] >= bars["hot_day"]
    in_heatwave = np.zeros(len(d), dtype=bool)
    for start, length in _run_lengths(hot.tolist()):
        if length >= 3:
            in_heatwave[start:start + length] = True
    d["heatwave_day"] = in_heatwave
    d["hot_day"] = hot.astype(float)
    d["warm_night"] = (d["T2M_MIN"] >= bars["warm_night"]).astype(float)
    d["above_30"] = (d["T2M_MAX"] >= 30).astype(float)
    # Days with no rain figure (the faulty stretch removed in clean.py) are left out of the
    # wet-day and good-day counts, so those chances rest on the years that can be trusted.
    has_rain = d["PRECTOTCORR"].notna()
    d["wet_day"] = (d["PRECTOTCORR"] >= 5).astype(float).where(has_rain)
    good = d["T2M_MAX"].between(18, 28) & (d["PRECTOTCORR"] < 1) & (d["CLOUD_AMT"] < 60)
    # Cloud is missing before 1984 and on a few later days; those days are left out of the count.
    d["good_day"] = good.astype(float).where(d["CLOUD_AMT"].notna() & has_rain)
    return d


def with_neighbours(per_week):
    """Adds each week's two neighbouring weeks to it (week 52 and week 1 are neighbours)."""
    return per_week + np.roll(per_week, 1, axis=0) + np.roll(per_week, -1, axis=0)


def week_chances(labelled, first_year, last_year):
    """Turns labelled days into one row per week: the chances and the usual range of highs."""
    d = labelled[labelled["year"].between(first_year, last_year)]
    weeks = pd.RangeIndex(1, 53, name="week")
    table = pd.DataFrame(index=weeks)

    # Heatwave week: each year's week is a yes or a no (did it hold a heatwave day?). The
    # chance is the share of yes among that week and its two neighbours over all the years.
    had_heatwave = d.groupby(["week", "year"])["heatwave_day"].any().unstack("year").reindex(weeks)
    table["p_heatwave_week"] = with_neighbours(had_heatwave.sum(axis=1).to_numpy()) / with_neighbours(
        had_heatwave.count(axis=1).to_numpy())

    # Day labels: the share of days with the label, again over the week and its two neighbours.
    for label in DAY_LABELS:
        by_week = d.groupby("week")[label].agg(["sum", "count"]).reindex(weeks)
        table["p_" + label] = with_neighbours(by_week["sum"].to_numpy()) / with_neighbours(by_week["count"].to_numpy())

    # The usual range of daytime highs: 8 in 10 days fall between these two values.
    for week in weeks:
        nearby = d.loc[d["week"].isin([(week - 2) % 52 + 1, week, week % 52 + 1]), "T2M_MAX"]
        table.loc[week, ["typ_max_low", "typ_max_high"]] = nearby.quantile([0.10, 0.90]).to_numpy()
    table["n_years"] = last_year - first_year + 1
    return table.reset_index()


def build_trip_weeks(daily):
    """Builds the chances for every place, week and period."""
    tables = []
    for place, d in daily.groupby("place", sort=False):
        bars = thresholds(d)
        d = add_week(d)
        trends = month_trends(d, last_year=d["year"].max())
        for period, (first_year, last_year, target) in PERIODS.items():
            days = d if target is None else shift_to(d, trends, target)
            table = week_chances(label_days(days, bars), first_year, last_year)
            table.insert(0, "place", place)
            table.insert(2, "week_start", [(pd.Timestamp(OUTLOOK_YEAR, 1, 1) + pd.Timedelta(days=7 * (w - 1))).strftime("%m-%d")
                                           for w in table["week"]])
            table.insert(3, "period", period)
            tables.append(table)
    out = pd.concat(tables, ignore_index=True)
    out["method"] = "simple"
    chance_columns = [c for c in out.columns if c.startswith("p_")]
    out[chance_columns] = out[chance_columns].round(3)
    return out.round({"typ_max_low": 1, "typ_max_high": 1})


def build_checks(daily):
    """Scores three ways of predicting 2021-2025 using only what was known at the end of 2020."""
    # guidebook : plain 1981-2010 averages, what a travel guide printed in 2020 would say
    # recent    : the last 15 years as they were (2006-2020), no shift
    # simple    : the last 30 years warmed to 2023 by each place's trend (this script's method)
    errors = []
    for place, d in daily.groupby("place", sort=False):
        region = d["region"].iloc[0]
        bars = thresholds(d)
        d = add_week(d)
        known = d[d["year"] <= TEST_KNOWN_UNTIL]
        trends = month_trends(known, last_year=TEST_KNOWN_UNTIL)
        labelled = label_days(known, bars)
        predictions = {
            "guidebook": week_chances(labelled, 1981, 2010),
            "recent": week_chances(labelled, TEST_KNOWN_UNTIL - 14, TEST_KNOWN_UNTIL),
            "simple": week_chances(label_days(shift_to(known, trends, TEST_TARGET), bars),
                                   TEST_KNOWN_UNTIL - OUTLOOK_WINDOW + 1, TEST_KNOWN_UNTIL),
        }
        # What really happened: the labels are worked out on the real record, then the test years are kept.
        truth = label_days(d, bars)
        truth = truth[truth["year"].between(*TEST_YEARS)]
        happened = {"heatwave_week": truth.groupby(["week", "year"])["heatwave_day"].any().astype(float).reset_index(name="outcome")}
        for label in DAY_LABELS:
            happened[label] = truth[["week", label]].rename(columns={label: "outcome"}).dropna()

        # Brier score: the squared gap between the predicted chance and what happened (1 or 0).
        for method, table in predictions.items():
            for label, outcomes in happened.items():
                predicted = outcomes["week"].map(table.set_index("week")["p_" + label])
                gap = (predicted - outcomes["outcome"]) ** 2
                errors.append({"method": method, "label": label, "region": region,
                               "squared_gaps": gap.sum(), "cases": len(gap)})

    errors = pd.DataFrame(errors)
    everywhere = errors.assign(region="All")
    totals = pd.concat([everywhere, errors]).groupby(["region", "label", "method"], sort=False)[["squared_gaps", "cases"]].sum()
    totals["brier"] = totals["squared_gaps"] / totals["cases"]
    scores = totals["brier"].unstack("method")
    rows = []
    for (region, label), row in scores.iterrows():
        for method in ("guidebook", "recent", "simple"):
            rows.append({"region": region, "label": label, "method": method,
                         "cases": int(totals.loc[(region, label, method), "cases"]),
                         "brier": row[method], "brier_guidebook": row["guidebook"],
                         # Skill: 0 means no better than the guidebook, 0.10 means 10% less error.
                         "skill_vs_guidebook": 1 - row[method] / row["guidebook"]})
    return pd.DataFrame(rows).round({"brier": 4, "brier_guidebook": 4, "skill_vs_guidebook": 3})


if __name__ == "__main__":
    daily = pd.read_parquet(os.path.join("data", "clean", "daily.parquet"),
                            columns=["place", "region", "lat", "date", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "CLOUD_AMT"])
    trips = build_trip_weeks(daily)
    trips.to_csv(os.path.join(RESULTS_DIR, "trip_weeks.csv"), index=False)
    checks = build_checks(daily)
    # The neural network's scores (added by train_weather_model.py) are carried over, so this
    # script can be rerun without retraining the network.
    checks_path = os.path.join(RESULTS_DIR, "outlook_checks.csv")
    if os.path.exists(checks_path):
        old = pd.read_csv(checks_path)
        checks = pd.concat([checks, old[old["method"] == "neural"]], ignore_index=True)
        rank = {name: i for i, name in enumerate(["All", "UK", "World"] + ALL_LABELS)}
        checks = checks.sort_values(["region", "label"], key=lambda col: col.map(rank), kind="stable")
    checks.to_csv(checks_path, index=False)

    print(f"trip_weeks.csv: {len(trips)} rows, outlook_checks.csv: {len(checks)} rows\n")
    # London in mid-July (week 28 starts on 9 July), then the back-test scores for all places.
    print(trips[(trips["place"] == "London") & (trips["week"] == 28)].to_string(index=False))
    print()
    print(checks[checks["region"] == "All"].to_string(index=False))
