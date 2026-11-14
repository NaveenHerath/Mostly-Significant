# make_fake_data.py
# makes fake versions of the two files naveen will hand over (results.csv + annual.csv)
# so i can build the app before his real data is ready
# run it with: python make_fake_data.py

import os                                    # for making folders
import numpy as np                           # for random numbers
import pandas as pd                          # for building the csv tables

os.makedirs("data/fake_results", exist_ok=True)   # make the folder if its not already there

rng = np.random.default_rng(42)              # fixed seed so the fake data comes out the same every time

years = np.arange(1981, 2026)                # every year from 1981 to 2025, same range as the real data

# a few uk towns with where they are on the map (naveen's real list will replace these)
places = [
    ("London",     51.507, -0.128),
    ("Manchester", 53.480, -2.242),
    ("Birmingham", 52.486, -1.890),
    ("Cardiff",    51.481, -3.179),
    ("Edinburgh",  55.953, -3.188),
    ("Belfast",    54.597, -5.930),
]

# the 3 measures: id, label, unit, typical value
measures = [
    ("heatwave_days", "Heatwave days per year",     "days",   8),
    ("warm_nights",   "Warm nights per year",       "nights", 10),
    ("summer_length", "Days that feel like summer", "days",   85),
]

annual_rows = []                             # will hold one row per place per measure per year
results_rows = []                            # will hold one summary row per place per measure

for place, lat, lon in places:                              # go through every town
    for mid, label, unit, typical in measures:              # and every measure for that town
        per_decade = rng.normal(2.0, 2.0)                   # fake change per decade, different for each town
        trend = typical + per_decade / 10 * (years - 1981)  # a slow steady change over the years
        noise = rng.normal(0, typical * 0.25, len(years))   # random wobble so it looks like real weather
        values = np.clip(trend + noise, 0, None).round(1)   # add them, stop counts going below zero

        # fake verdict rules, roughly how naveen's real ones work
        if per_decade > 2.5:                    # big rise
            verdict, p = "real", 0.004          # convincing, small p-value
        elif per_decade > 1.0:                  # small rise
            verdict, p = "leaning", 0.09        # hint of a trend, not proven
        elif per_decade > -1.0:                 # basically flat
            verdict, p = "not_backed", 0.45     # looks like noise
        else:                                   # going down
            verdict, p = "opposite", 0.02       # real trend, but the wrong way

        for y, v in zip(years, values):                     # one row per year for the chart file
            annual_rows.append({"place": place, "measure_id": mid, "year": int(y), "value": v})

        results_rows.append({                               # the one summary row the verdict card reads
            "place": place, "region": "UK", "lat": lat, "lon": lon,
            "measure_id": mid, "measure_name": label, "unit": unit,
            "rate_per_decade": round(per_decade, 2),        # fake change per decade
            "p_value": p,                                   # fake test result
            "verdict": verdict,                             # one of: real, leaning, not_backed, opposite
            "early_mean": round(values[:10].mean(), 1),     # average of the first 10 years
            "late_mean": round(values[-10:].mean(), 1),     # average of the last 10 years
            "start_year": 1981, "end_year": 2025,
            "plain_definition": f"placeholder definition for {label.lower()}",   # naveen writes the real wording
            "caveat": "fake data for building the app, not real numbers",
        })

pd.DataFrame(annual_rows).to_csv("data/fake_results/annual.csv", index=False)     # save the chart file
pd.DataFrame(results_rows).to_csv("data/fake_results/results.csv", index=False)   # save the summary file
print("done: fake files written for", len(places), "towns")                       # so i know it actually ran