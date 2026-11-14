# Mostly Significant

**NASA Space Apps Challenge 2026 · "Be an Earth System Trend Detective"**

A hunch fact-checker for the weather. People have feelings about how the weather is
changing: "summers are getting hotter", "we barely get frosts anymore". This app tests those
feelings against 45 years of NASA data and answers each one with a verdict, the size of the
change and an honest note on what the data cannot say.

## How it works for a visitor

1. Pick a place and a hunch, such as London and "Summer lasts longer".
2. Guess first: is it really happening?
3. See the verdict, the numbers behind it, the trend chart, and the same hunch on a map of
   every other place.

There are four verdicts:

| Verdict | Meaning |
|---|---|
| **Real trend** | Under a 5% chance of being luck, and in the direction the hunch claims |
| **Leaning, not proven** | The right direction, but luck can't be ruled out |
| **Not backed up** | No support in the data |
| **The opposite** | A real trend, going the other way |

The app covers 12 UK towns in depth (15 hunches each: heat, seasons, rain, sunshine and
heating) and 12 world cities on the five heat hunches that mean the same in any climate.

## The data

All numbers come from **NASA POWER (MERRA-2)**: daily weather from 1 January 1981 to
31 December 2025, on a grid of squares about 50 km across. Trends are tested with the
Mann-Kendall test and sized with Sen's slope. The full method, the definitions and the
limitations are in [data-generation/README.md](data-generation/README.md).

## What is in this repository

The project has two phases, and the only thing that passes between them is a set of results
files.

| Phase | Folder | What it does |
|---|---|---|
| 1. Data generation | [`data-generation/`](data-generation/) | Downloads the NASA data, checks it, turns it into yearly measures, tests each one for a trend and writes the results files |
| 2. The app | `app.py` | Reads the results files and presents them. It calculates nothing itself |

```
NASA POWER API
   → data-generation/download_power.py      raw daily data for 24 places
   → data-generation/src/clean.py           one checked daily table
   → data-generation/src/build_results.py   yearly measures, trends, verdicts
   → data-generation/src/build_extras.py    luck test and season dates
   → data-generation/data/results/*.csv
   → app.py                                 the page a visitor sees
```

## Running the app

```
pip install -r requirements.txt
streamlit run app.py
```

The results files are already in the repository, so the app runs straight away. Rebuilding
them from the NASA data is described in
[data-generation/README.md](data-generation/README.md).

## Limitations

- Values are averages over a roughly 50 km square, so peaks read low. London's hottest day
  shows about 34.5 °C here; weather stations recorded about 40 °C. The trends are still valid.
- "Unusually hot" is relative to each place, so the bar differs from town to town.
- Rain varies a lot from year to year, so most rain hunches are only "leaning".
- The data shows that something has changed. It does not show why.

## Team

Mostly Significant, London, November 2026.

## Licence

MIT. See [LICENSE](LICENSE).
