# make_fake_data.py
# makes fake versions of the two files naveen will hand over (results.csv + annual.csv)
# so i can build the app before his real data is ready
# run it once with: python make_fake_data.py

import os                                    # for making folders
import numpy as np                           # for random numbers
import pandas as pd                          # for building the csv tables

os.makedirs("data/fake_results", exist_ok=True)   # make the folder if its not already there

rng = np.random.default_rng(42)              # fixed seed so the fake data comes out the same every time

years = np.arange(1981, 2026)                # every year from 1981 to 2025, same range as the real data

# the 3 measures naveen is doing first for london: id, label, unit, typical value, fake rise per decade
measures = [
    ("heatwave_days",  "Heatwave days per year",     "days",   8,  2.5),
    ("warm_nights",    "Warm nights per year",       "nights", 10, 3.0),
    ("summer_length",  "Days that feel like summer", "days",   85, 4.0),
]

annual_rows = []                             # will hold one row per measure per year
results_rows = []                            # will hold one summary row per measure

for mid, label, unit, typical, per_decade in measures:
    trend = typical + per_decade / 10 * (years - 1981)      # a slow steady rise over the years
    noise = rng.normal(0, typical * 0.25, len(years))       # random wobble so it looks like real weather
    values = np.clip(trend + noise, 0, None).round(1)       # add them, stop counts going below zero

    for y, v in zip(years, values):                         # one row per year for the chart file
        annual_rows.append({"place": "London", "measure_id": mid, "year": int(y), "value": v})

    results_rows.append({                                   # the one summary row the verdict card reads
        "place": "London", "region": "UK", "lat": 51.507, "lon": -0.128,
        "measure_id": mid, "measure_name": label, "unit": unit,
        "rate_per_decade": per_decade,                      # fake change per decade
        "p_value": 0.003,                                   # fake test result, small = convincing trend
        "verdict": "real",                                  # must be one of: real, leaning, not_backed, opposite
        "early_mean": round(values[:10].mean(), 1),         # average of the first 10 years
        "late_mean": round(values[-10:].mean(), 1),         # average of the last 10 years
        "start_year": 1981, "end_year": 2025,
        "plain_definition": f"placeholder definition for {label.lower()}",   # naveen writes the real wording
        "caveat": "fake data for building the app, NOT REAL numbers",
    })

pd.DataFrame(annual_rows).to_csv("data/fake_results/annual.csv", index=False)     # save the chart file
pd.DataFrame(results_rows).to_csv("data/fake_results/results.csv", index=False)   # save the summary file
print("done: fake files written to data/fake_results/")     # so i know it actually ran
