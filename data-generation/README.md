# Hunch fact-checker · Phase 1: data generation

**Team Mostly Significant · NASA Space Apps Challenge 2026 · "Be an Earth System Trend Detective"**

People have feelings about the weather: "summers are getting hotter", "we barely get frosts
anymore". The project tests those everyday hunches against 45 years of NASA data and gives
each one a verdict, the size of the change and an honest note on what the data cannot say.

## Where this phase fits

| Phase | What happens | Where |
|---|---|---|
| **1. Data generation** | NASA data is downloaded, checked, turned into yearly measures and tested for trends. The output is a set of results files. | here |
| 2. The app | A map, charts and a chatbot read the results files and present the verdicts. | the app's own code |

Everything on this page belongs to phase 1. The only thing that passes from phase 1 to
phase 2 is the results files in `data/results`. The app does no calculation of its own, so
every number a user sees is generated here.

The phase runs as six scripts, each feeding the next:

```
NASA POWER API
   → download_power.py     raw daily data for 38 places        data/raw
   → src/clean.py          one checked daily table             data/clean
   → src/build_results.py  yearly measures, trends, verdicts   data/results
   → src/build_extras.py   luck test and season dates          data/results
   → src/build_casefile.py extras for the app's case file      data/results
   → src/build_outlook.py  weekly chances for next year        data/results
   → the app (phase 2)
```

## Data source

- **NASA POWER (MERRA-2)**, daily point API, no login or key needed:
  `https://power.larc.nasa.gov/api/temporal/daily/point` (`community=AG`, `format=JSON`).
- **Period:** 1 January 1981 to 31 December 2025, 16,436 days per place.
- **Grid:** MERRA-2 squares of 0.5° latitude by 0.625° longitude, about 50 km across.
- **15 variables:** `T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `RH2M`, `T2MDEW`, `WS10M`,
  `WS10M_MAX`, `ALLSKY_SFC_SW_DWN`, `CLOUD_AMT`, `HDD18_3`, `CDD18_3`, `GWETROOT`, `GWETTOP`,
  `EVPTRNS`. Missing values are `-999`. Sunshine and cloud start in 1984.

## Places (38)

- **UK, analysed in depth (12):** London, Maidstone, Norwich, Plymouth, Bristol, Cardiff,
  Birmingham, Manchester, Newcastle, Belfast, Edinburgh, Aberdeen.
- **World, big cities (12):** New York, Los Angeles, Toronto, Sao Paulo, Paris, Berlin,
  Madrid, Cairo, Delhi, Tokyo, Sydney, Johannesburg.
- **World, popular trip destinations (14):** Barcelona, Rome, Lisbon, Athens,
  Amsterdam, Istanbul, Dubai, Marrakech, Cape Town, Bangkok, Singapore, Orlando, Mexico City,
  Rio de Janeiro.

### The sea problem

For a coastal city the grid square can be mostly sea, which gives flat, wrong temperatures.
In a first download Aberdeen and Belfast showed almost no frost and no real heat.

`download_power.py` therefore tests every place before downloading it. It pulls one year
(2015) and measures the average gap between the daily maximum and minimum. Over open sea that
gap is only 2 to 4 °C; over land it is usually 5 °C or more. If the gap is under 4.5 °C, the
eight neighbouring squares are tried, nearest first, and the first land square is used.

Five places are moved this way:

| Place | Moved | Reason |
|---|---|---|
| Belfast | 23 km | City square failed the sea test (gap 4.2 °C) |
| Aberdeen | 30 km | City square failed the sea test (gap 2.4 °C) |
| Toronto | 39 km north, by hand | City square is mostly Lake Ontario. It passed the sea test, but its nights appeared to warm 1.0 °C per decade with sudden jumps, while the land squares around it show 0.3 to 0.4 °C |
| Lisbon | 42 km south-east, by hand | City square failed the sea test (gap 4.4 °C). The nearest square that passes is an ocean-cooled coastal strip: August afternoons average 25 °C against Lisbon's 28 °C, and its days warm only 0.1 °C per decade. The square across the Tagus is all land and starts 7 km from the city centre. It lies inland of the city, so its August afternoons read about 3 °C higher than Lisbon's |
| Cape Town | 32 km | City square failed the sea test (gap 3.0 °C). The square used starts 2 km east of the city centre and holds most of the metropolitan area |

Each of the 14 trip destinations was also checked against its neighbouring squares for grid
elevation, monthly temperatures, warming rate and sudden jumps in the record. Two notes come
out of that check:

- **Singapore** passes the sea test on the 2015 test year (gap 4.8 °C) but its 45-year gap is
  4.3 °C, so `build_results.py` marks its rows `PROVISIONAL`. No neighbouring square is
  better (the only one with a larger gap is 70 km north, inland). Its warming rate is the
  same in all five squares around it (0.2 °C per decade at night), so the trends hold, but
  daytime highs read about 1.5 °C low.
- **Mexico City**'s square averages 2,627 m above sea level against the city's 2,240 m, so
  its temperatures read about 3 °C low. The squares around it are no closer.

`data/raw/manifest.csv` records, for every place, the point the data comes from (`lat`,
`lon`), the real city centre (`city_lat`, `city_lon`), the measured `day_night_gap` and a
`validation` note.

## Method

### Definitions

- **Baseline:** 1981–2010. Only complete years 1981–2025 are used.
- **Warm season:** each place's five warmest months in a row, by baseline average daily
  maximum. This is May–September in all 12 UK towns and differs elsewhere (Delhi
  April–August, New York and Los Angeles June–October, Sao Paulo and Johannesburg
  October–February, Sydney and Cape Town November–March, Lisbon June–October, Bangkok
  January–May, Singapore February–June, Mexico City March–July, Rio de Janeiro
  December–April). `thresholds.csv` lists it for every place.
- **Hot day:** daily maximum at or above the place's 90th percentile of warm-season daily
  maximums in the baseline.
- **Heatwave:** 3 or more hot days in a row.
- **Warm night:** daily minimum at or above the place's 90th percentile of warm-season daily
  minimums in the baseline.
- **Summer length:** days with a 5-day centred mean temperature of 15 °C or more.
- **Autumn onset:** first day from 1 July when the 5-day mean drops below 10 °C.
- **First frost:** first day from 1 August with a daily minimum of 0 °C or below.
- **Wettest day:** highest daily rain in the year.
- **Heavy rain day:** 10 mm or more. (20 mm was too rare at 50 km: London had none in 14 of
  45 years.)
- **Summer dry spell:** longest run of days under 1 mm in June–August.
- **Winter rain:** December–February total, named after the January's year (from 1982).
- **Summer sunshine:** June–August mean of `ALLSKY_SFC_SW_DWN`, MJ/m² per day (from 1984).
- **Heating need:** yearly sum of `HDD18_3` (degree days below 18.3 °C).
- **Southern-hemisphere year:** for Sydney, Sao Paulo, Johannesburg, Cape Town and Rio de
  Janeiro a year runs July to June and is named after the year it ends in, so one summer is never split across two
  years. Their series start in 1982.

### Measures

| `measure_id` | What it measures | Region |
|---|---|---|
| `heatwave_events` | Heatwaves per year | UK + World |
| `heatwave_days` | Days inside a heatwave per year | UK + World |
| `longest_heatwave` | Longest heatwave of the year (days) | UK + World |
| `hottest_day` | Hottest day of the year (°C) | UK + World |
| `warm_nights` | Warm nights per year | UK + World |
| `first_heatwave_doy` | Day of year the first heatwave starts | UK |
| `summer_length` | Days of summer-like warmth | UK |
| `autumn_onset_doy` | Day of year autumn chill arrives | UK |
| `first_frost_doy` | Day of year of the first frost | UK |
| `wettest_day` | Wettest day of the year (mm) | UK |
| `heavy_rain_days` | Days with 10 mm of rain or more | UK |
| `summer_dry_spell` | Longest summer dry spell (days) | UK |
| `winter_rain` | Winter rainfall (mm) | UK |
| `summer_sunshine` | Summer sunshine (MJ/m² per day) | UK |
| `heating_need` | Heating degree days per year | UK |

World cities are compared only on the five heat measures, because those mean the same thing
in any climate. The season and rain measures are built around UK seasons.

### Statistics

- **Is there a trend?** Mann-Kendall test with the Hamed-Rao correction for autocorrelation
  (`pymannkendall`). If the corrected p-value comes out blank, the original test is used.
  The test used is recorded in `test_method`.
- **How big is it?** Sen's slope (`scipy.stats.theilslopes` on the real years) times 10,
  giving the change per decade.
- **Cross-check:** ordinary linear regression with a 95% interval. A flag is raised if the
  two methods disagree in sign.
- **Fewer than 10 usable years:** no test is run. The verdict is `not_backed` and the caveat
  says why.
- **Luck test:** each yearly series is shuffled 1,000 times (fixed seed) and scored the way
  Mann-Kendall scores it. `share_as_strong` is the share of shuffles with a trend at least as
  strong as the real one.

### Extras for the case file

- **Years until we'd know** (`years_to_know.csv`): for each `leaning` result, the record
  length at which it would be proven if the trend and the noise stay as they are. The
  Mann-Kendall score grows in proportion to (years)^1.5, so years needed = years so far ×
  (1.96 / score today)^(2/3). Tried on records cut to 25, 30 and 35 years (461 cases): when it
  said "proven by 2025" it was right 85% of the time and within 5 years in 74% of those. It
  errs on the cautious side.
- **Luck lines** (`luck_lines.csv`): the real Sen's-slope line (`shuffle_id` 0) and 50 lines
  from shuffled years, for an animation of the luck test.
- **Top changes** (`top_changes.csv`): each place's measures ranked by the size of the
  Mann-Kendall score, strongest first.
- **Stripes** (`stripes.csv`): yearly mean temperature and its difference from the place's
  1981–2010 average.

### Outlook for next year

`trip_weeks.csv` gives, for every place and week of the year, the chance of a heatwave that
week, a hot day, a warm night, a day above 30 °C, a wet day (5 mm or more) and a good day
(18 to 28 °C, under 1 mm of rain, cloud under 60%).

- A chance is a count: the share of days (or of weeks, for heatwaves) with the label, taken
  over the week and its two neighbours in a window of years.
- `then` is 1981–1995 and `now` is 2011–2025, both as recorded.
- `2027` uses 1996–2025, with each day's temperatures first warmed by the place's trend for
  that month (Sen's slope) times the years between that day and 2027. Rain and cloud are not
  shifted.
- **Back-test:** rebuilt with only data to 2020 and scored on 2021–2025 with the Brier score.
  Against plain 1981–2010 averages it cuts the error by 16% for warm nights, 10% for heatwave
  weeks, 8% for days above 30 °C, 6% for hot days, 2% for good days and 1% for wet days. In
  the UK alone the gain is small (6%, 3%, 0%, 1%, 1%, 0%). `outlook_checks.csv` has the
  scores.
- **Neural cross-check:** a small neural network (`src/train_weather_model.py`) was trained on
  the same warmed days to make up 1,000 versions of the year per place, and scored on the
  same back-test. Its made-up weather is realistic (heatwaves average 4.9 days against 5.1
  in the record, dry spells 7.2 against 7.5), but it cut the error by less than the simple
  count on all six labels (14%, 6%, 8%, 4%, 1%, 0% in the order above). The app therefore
  uses the simple numbers. `trip_weeks_neural.csv` holds the network's version for comparison.
- These are chances for a typical year under the current trend. They are not a forecast of
  the weather in 2027.

### Verdict rules

Each measure has an expected direction, the one the everyday hunch claims. It is "up" for
everything except `first_heatwave_doy` and `heating_need`, which are "down".

| Verdict | Rule |
|---|---|
| `real` | p < 0.05 and the trend goes in the expected direction |
| `opposite` | p < 0.05 and the trend goes the other way |
| `leaning` | p ≥ 0.05 but the direction is right (Sen's slope, or late minus early average if the slope is 0) |
| `not_backed` | everything else |

## Code

| File | What it does |
|---|---|
| `download_power.py` | Tests each place for sea, downloads the raw JSON, writes `manifest.csv` and `power_raw.zip` |
| `src/clean.py` | Raw JSON → `data/clean/daily.parquet`, plus eleven data checks → `data_checks.csv` |
| `src/measures.py` | Definitions and the yearly measures (a toolbox, not run directly) |
| `src/stats.py` | Trend tests and verdict rules (a toolbox, not run directly) |
| `src/build_results.py` | Runs everything → `results.csv`, `annual.csv`, `results_detail.csv`, `thresholds.csv` |
| `src/build_extras.py` | Shuffle test and season dates → `luck.csv`, `season_dates.csv` |
| `src/build_casefile.py` | Extras for the app's case file → `years_to_know.csv`, `luck_lines.csv`, `top_changes.csv`, `stripes.csv` |
| `src/build_outlook.py` | Weekly chances for the 1980s, recent years and 2027, plus a back-test → `trip_weeks.csv`, `outlook_checks.csv` |
| `src/weather_model.py` | The neural network that gives the chances for tomorrow's weather (a toolbox, not run directly) |
| `src/train_weather_model.py` | Optional second method for the outlook: trains the network, makes up 1,000 versions of the year per place and back-tests them → `models/weather_gru.pt`, `trip_weeks_neural.csv`, `neural` rows in `outlook_checks.csv` |

### How to run it

```
pip install -r requirements.txt
python download_power.py        # about 10 to 15 minutes
python src/clean.py
python src/build_results.py
python src/build_extras.py
python src/build_casefile.py
python src/build_outlook.py
python src/train_weather_model.py   # optional, about 45 minutes on a laptop
```

The raw download is also bundled in `power_raw.zip`, so the analysis can be rerun without
calling the API again: unzip it into `data/raw/` and start from `src/clean.py`.

### Data checks

`src/clean.py` runs eleven checks and all of them pass on the current data
(`data/clean/data_checks.csv`): full date coverage, missing values only where expected,
physical ranges for temperature, rain, humidity and soil wetness, no place warming faster
than 0.8 °C per decade at night, and four known events that should appear in the data
(London's hottest day on 19 July 2022, the cold December of 2010, Storm Eunice, and the dry
summers of 2018 and 2022).

## What this phase generates (`data/results`)

| File | One row is | Columns |
|---|---|---|
| `results.csv` | one place × one measure (310 rows) | `place, region, lat, lon, measure_id, measure_name, unit, season, start_year, end_year, n_years, rate_per_decade, early_mean, late_mean, p_value, test_method, expected_direction, verdict, plain_definition, caveat` |
| `annual.csv` | one place × one measure × one year | `place, measure_id, year, value` |
| `luck.csv` | one place × one measure | `place, measure_id, real_trend_per_decade, share_as_strong, n_shuffles, p_value` |
| `season_dates.csv` | one UK town × one year | `place, year, summer_start_doy, summer_end_doy, first_heatwave_doy` |
| `years_to_know.csv` | one place × one `leaning` measure | `place, measure_id, years_so_far, score_now, years_needed, extra_years, year_we_would_know, note` |
| `luck_lines.csv` | one place × one measure × one line | `place, measure_id, shuffle_id, slope_per_decade, start_year, start_value, end_year, end_value` |
| `top_changes.csv` | one place × one ranked measure | `place, rank, measure_id, measure_name, verdict, strength, rate_per_decade, early_mean, late_mean, unit` |
| `stripes.csv` | one place × one year | `place, year, mean_temp, anomaly` |
| `trip_weeks.csv` | one place × one week × one period | `place, week, week_start, period, p_heatwave_week, p_hot_day, p_warm_night, p_above_30, p_wet_day, p_good_day, typ_max_low, typ_max_high, n_years, method` |
| `outlook_checks.csv` | one region × one label × one method | `region, label, method, cases, brier, brier_guidebook, skill_vs_guidebook` |
| `trip_weeks_neural.csv` | as `trip_weeks.csv` | same columns; the `2027` rows come from the network (`method = neural`, `n_years` = 1,000 made-up years) |
| `results_detail.csv` | as `results.csv` | adds the regression cross-check columns |
| `thresholds.csv` | one place | hot-day and warm-night thresholds, warm season, day-night gap |

`early_mean` is the average of the first ten years (1981–1990) and `late_mean` the last ten
(2016–2025). `lat`/`lon` in `results.csv` are the real city centre, for the map.
[data/results/instructions.md](data/results/instructions.md) explains how the app and the
chatbot use these files.

## Results in brief

310 results: 12 UK towns × 15 measures and 26 world cities × 5 measures.

| Region | `real` | `leaning` | `not_backed` | `opposite` |
|---|---|---|---|---|
| UK (180) | 77 | 89 | 11 | 3 |
| World (130) | 79 | 41 | 10 | 0 |

**London, first ten years against the last ten:**

| Measure | 1981–1990 | 2016–2025 | p | Verdict |
|---|---|---|---|---|
| Heatwave days per year | 7.2 | 18.7 | 0.002 | real |
| Warm nights per year | 12.9 | 27.9 | 0.0005 | real |
| Summer length (days) | 77.2 | 107.7 | <0.0001 | real |
| Hottest day (°C) | 28.1 | 31.5 | <0.0001 | real |
| Autumn onset (day of year) | 285 | 294 | 0.028 | real |
| First frost (day of year) | 322 | 327 | 0.25 | leaning |

**Findings worth a second look:**

- Warm nights have increased in all 12 UK towns (`real` everywhere).
- The longest summer dry spell has got *shorter* in Plymouth (15.3 → 11.7 days), Cardiff
  (15.2 → 11.5) and Edinburgh (12.2 → 9.8). These are the three `opposite` verdicts: the
  feeling that summers have longer dry spells is not what the data shows there.
- First frost is later in most towns, but only proven in five of twelve. "We barely get
  frosts anymore" is mostly a `leaning`, not a `real`.

## Limitations

- Values are averages over a roughly 50 km square, so peaks read low. London's hottest day
  shows 34.5 °C here; weather stations recorded about 40 °C. Trends are still valid.
- Hot-day and warm-night thresholds are relative to each place, so the bar differs by town.
- Years with no heatwave or no frost have no date and drop out of those trends. Plymouth has
  a first-frost date in only 15 of 45 years.
- Belfast, Aberdeen, Toronto, Lisbon and Cape Town use a neighbouring land square (see
  `manifest.csv`).
- Singapore's rows are marked `PROVISIONAL`: its square is partly sea, so daytime highs read
  low. Mexico City's square sits about 400 m higher than the city, so it reads about 3 °C low.
- In tropical cities temperatures vary little through the year, so a small warming moves many
  nights over the threshold. Warm-night counts rise very steeply there (Singapore 9 → 72 a
  year) and are best read as "how often", not "how much hotter".
- Sunshine and cloud data start in 1984.
- Rain varies a lot from year to year, so most rain trends are only `leaning`. A 50 km
  average also reads low for local downpours.
- World cities are compared on five heat measures only.
- Southern-hemisphere years run July to June, so they cover 1982–2025.
- **Hamed-Rao correction:** in six results the corrected test says significant while the
  plain Mann-Kendall test and the shuffle test both say not significant (Birmingham
  `longest_heatwave` and `autumn_onset_doy`, Cardiff `heavy_rain_days`, Manchester
  `winter_rain`, Edinburgh `summer_dry_spell`, Los Angeles `longest_heatwave`). These six
  verdicts are weaker than they look. `luck.csv` shows both numbers side by side.
- **Delhi** shows no increase in any heat measure in this data. Haze and irrigation are known
  to hold daytime heat down there, but this has not been checked against station records, so
  it is not presented as a finding.
