# How the app uses the results files

Team Mostly Significant, NASA Space Apps 2026. Data: **NASA POWER (MERRA-2)**, daily, 1981–2025.

Everything in this folder is already calculated. The app and the chatbot only **look up rows
and put them into words**. Nothing is calculated in the app, and the language model never
does any maths.

---

## 1. The files

| File | One row is | What the app uses it for |
|---|---|---|
| `results.csv` | one place × one measure (310 rows) | the verdict, the size of the change, the map, the chatbot's answers |
| `annual.csv` | one place × one measure × one year | trend charts and the time slider |
| `luck.csv` | one place × one measure | the "could this be luck?" feature |
| `season_dates.csv` (UK only) | one place × one year | the season-clock feature |
| `years_to_know.csv` | one place × one `leaning` measure | "when would this be proven?" |
| `luck_lines.csv` | one place × one measure × one line | the trend line, and the shuffle animation |
| `top_changes.csv` | one place × one ranked measure | "what's changing here?" |
| `stripes.csv` | one place × one year | warming stripes behind the chart |
| `trip_weeks.csv` | one place × one week × one period | next year's outlook, the map's future mode |

The files are UTF-8 (units contain `°C`), so they are read with `encoding="utf-8"`.
`results_detail.csv` and `thresholds.csv` are working files for the analysis. The app does
not need them.

### `results.csv` columns

`place, region, lat, lon, measure_id, measure_name, unit, season, start_year, end_year, n_years, rate_per_decade, early_mean, late_mean, p_value, test_method, expected_direction, verdict, plain_definition, caveat`

- `region` is `UK` or `World`. `lat`/`lon` are the real city centre, which is where the map
  pin goes.
- `rate_per_decade` is the change per 10 years in the measure's `unit`. A negative number
  means the measure is falling.
- `early_mean` is the average over 1981–1990 and `late_mean` the average over 2016–2025.
  The difference between them is the easiest number to explain to a user.
- `expected_direction` is `up` or `down`: the direction the hunch claims. "Hotter" is `up`.
- `verdict` is exactly one of `real`, `leaning`, `not_backed`, `opposite` (section 2).
- `plain_definition` is one sentence defining the measure, written for the public.
- `caveat` is the honest limitation for that row. It belongs next to every answer.

### `annual.csv`

`place, measure_id, year, value`. A missing year means the event did not happen. A year with
no frost has no first-frost date, for example. A blank is not a zero and is left as a gap in
charts.

### `luck.csv`

`place, measure_id, real_trend_per_decade, share_as_strong, n_shuffles, p_value`

Each yearly series was shuffled 1,000 times. `share_as_strong` is the share of shuffles
(0 to 1) that showed a trend at least as strong as the real one. Near 0 means luck almost
never produces this. Near 0.5 or higher means luck produces it all the time.

In words: `share_as_strong = 0.002` → "only 2 in 1,000 random orderings looked this strong."

### `season_dates.csv`

`place, year, summer_start_doy, summer_end_doy, first_heatwave_doy`. A blank means it did not
happen that year. `doy` is the day of the year (1 = 1 January). It converts to a date with
`datetime.date(year, 1, 1) + timedelta(days=doy - 1)`.

### `years_to_know.csv`

`place, measure_id, years_so_far, score_now, years_needed, extra_years, year_we_would_know, note`

Only `leaning` rows are in this file. `note` is a ready sentence ("If this continues, about
20 more years of data would prove it."). The three number columns are blank when there is no
estimate, and `note` then says why. It is an "if this continues" estimate, never a promise.

### `luck_lines.csv`

`place, measure_id, shuffle_id, slope_per_decade, start_year, start_value, end_year, end_value`

Each row is one straight line, drawn from (`start_year`, `start_value`) to (`end_year`,
`end_value`). `shuffle_id = 0` is the real trend line, which is also the line for the main
chart. Lines 1 to 50 come from the same years in a random order: drawn in grey, they show
what luck alone produces. In 43 results the real slope is exactly 0 (counts with many equal
years), so the lines are flat; for those the `luck.csv` share is shown in words instead.

### `top_changes.csv`

`place, rank, measure_id, measure_name, verdict, strength, rate_per_decade, early_mean, late_mean, unit`

`rank` 1 is the measure with the strongest trend in that place. `strength` has no unit and is
only for ordering; `verdict` says which way the measure went.

### `stripes.csv`

`place, year, mean_temp, anomaly`. `anomaly` is the year's mean temperature minus the place's
1981–2010 average, in °C. Blue for below zero, red for above, one bar per year.

### `trip_weeks.csv`

`place, week, week_start, period, p_heatwave_week, p_hot_day, p_warm_night, p_above_30, p_wet_day, p_good_day, typ_max_low, typ_max_high, n_years, method`

- `week` runs 1 to 52 from 1 January. A date becomes a week with
  `min((date.timetuple().tm_yday - 1) // 7 + 1, 52)`. `week_start` is its first day (`07-16`)
  and is read as text (`dtype={"week_start": str}`).
- `period` is `then` (1981–1995), `now` (2011–2025) or `2027` (the outlook: the last 30
  years warmed by each place's trend). The honest comparison is `then` against `2027`.
- Every `p_` column is a chance from 0 to 1. `p_heatwave_week` is the chance the week holds
  at least one heatwave day. The others are the chance for any one day in that week: a hot
  day (for that place), a warm night, a day above 30 °C, a wet day (5 mm or more), a good day
  (18 to 28 °C, dry, not overcast).
- `typ_max_low` and `typ_max_high` are the usual range of daytime highs (8 days in 10).
- Wording: "about a 4 in 10 chance", never "there will be". It is a chance for a typical
  year under the current trend, not a weather forecast.

---

## 2. What the verdicts mean

| `verdict` | In plain words | Colour idea |
|---|---|---|
| `real` | "Yes, the data backs your hunch." | green |
| `leaning` | "Points that way, but we can't rule out luck yet." | amber |
| `not_backed` | "The data doesn't support this hunch." | grey |
| `opposite` | "Surprise: the data shows the reverse." | red or purple |

The verdict describes the **trend in the data**. It is not a score for the user, so the app
never says something like "you are 80% right".

The `opposite` rows are the strongest demo moments. The longest summer dry spell has got
*shorter* in Plymouth, Cardiff and Edinburgh, for example.

---

## 3. Places and measures

**UK (12 towns, 15 measures each):** London, Maidstone, Norwich, Plymouth, Bristol, Cardiff,
Birmingham, Manchester, Newcastle, Belfast, Edinburgh, Aberdeen.

**World (26 cities, 5 measures each):** New York, Los Angeles, Toronto, Sao Paulo, Paris,
Berlin, Madrid, Cairo, Delhi, Tokyo, Sydney, Johannesburg, Barcelona, Rome, Lisbon, Athens,
Amsterdam, Istanbul, Dubai, Marrakech, Cape Town, Bangkok, Singapore, Orlando, Mexico City,
Rio de Janeiro.

World cities have only `heatwave_events`, `heatwave_days`, `longest_heatwave`, `hottest_day`
and `warm_nights`. A question about frost, rain, sunshine or heating in a world city has no
row, so the honest answer is that only heat measures are covered there.

Sydney, Sao Paulo, Johannesburg, Cape Town and Rio de Janeiro use July–June years, so their
data starts in 1982. Their `caveat` says so.

### Measures and the everyday hunches that map to them

| `measure_id` | Everyday phrases that map here | Direction the hunch claims |
|---|---|---|
| `heatwave_events` | "more heatwaves", "heatwaves are more frequent" | up |
| `heatwave_days` | "summers are getting hotter", "more scorching days" | up |
| `longest_heatwave` | "heatwaves last longer" | up |
| `first_heatwave_doy` | "heat arrives earlier", "summer starts earlier" | down (earlier) |
| `hottest_day` | "the hottest days are hotter", "records keep being broken" | up |
| `warm_nights` | "nights are too hot to sleep", "muggy nights" | up |
| `summer_length` | "summers last longer", "summer starts earlier and ends later" | up |
| `autumn_onset_doy` | "autumn arrives later", "it stays warm longer" | up (later) |
| `first_frost_doy` | "frosts come later", "we barely get frosts" | up (later) |
| `wettest_day` | "downpours are heavier" | up |
| `heavy_rain_days` | "it rains harder", "more wet days" | up |
| `summer_dry_spell` | "summers are drier", "longer dry spells" | up |
| `winter_rain` | "winters are wetter" | up |
| `summer_sunshine` | "summers are sunnier" | up |
| `heating_need` | "we need less heating", "winters are milder" | down |

`first_heatwave_doy`, `autumn_onset_doy` and `first_frost_doy` are days of the year, so they
read best as a difference in days: "about 9 days later". Their `rate_per_decade` is positive
when the date is getting later and negative when it is getting earlier.

**Hunches with no direct measure.** "Winters are warmer" has no measure of its own. The
closest are `heating_need` (milder winters) and `first_frost_doy`. When one of these stands
in for a hunch, the answer names the measure and says it is a proxy.

**Hunches that cannot be tested.** Snow, fog, storms, wind and humidity have no measure. The
honest answer is "we don't have a measure for that". A forced match would mislead.

---

## 4. The chatbot: lookup, not fine-tuning

The chatbot is a general language model with **tool calling** (also called function
calling). It is not fine-tuned: a fine-tuned model could still invent a number, and there
would be no way to prove that it never does.

The model has two jobs only:

1. **Understand** the user's sentence and pick a `place` and a `measure_id`, or say that it
   can't.
2. **Word** the row it gets back in plain English.

Every number comes from a Python function that reads `results.csv`.

### Flow

```
user types a hunch
   → the model extracts {place, measure_id}        (tool call)
   → Python looks up the row in results.csv         (pandas)
   → the row goes back to the model
   → the model writes the answer using ONLY that row
   → the app shows the answer, a chart from annual.csv and the luck line from luck.csv
```

### The lookup function (the tool)

```python
import pandas as pd

RESULTS_DIR = "data-generation/data/results"     # as seen from app.py at the top of the repo
R = pd.read_csv(f"{RESULTS_DIR}/results.csv", encoding="utf-8")
L = pd.read_csv(f"{RESULTS_DIR}/luck.csv", encoding="utf-8")

def check_hunch(place: str, measure_id: str) -> dict:
    """Returns the results row (and luck share) for one place and measure, or a clear error."""
    row = R[(R.place == place) & (R.measure_id == measure_id)]
    if row.empty:
        return {"error": f"No data for {place} / {measure_id}. "
                         "Measure may not exist for this region."}
    out = row.iloc[0].to_dict()
    luck = L[(L.place == place) & (L.measure_id == measure_id)]
    if not luck.empty:
        out["share_as_strong"] = float(luck.iloc[0].share_as_strong)
    return out
```

In the tool's schema, `place` is an enum of the 38 place names and `measure_id` an enum of
the 15 IDs. An enum stops the model inventing a value. A `none` option covers a hunch that
cannot be mapped.

### System prompt for the chatbot

This is the prompt the app gives its language model. It is written as instructions because
that is how the model reads it.

```
You are the "hunch fact-checker". The user gives a feeling about weather or climate.
1. Call check_hunch with the place and measure_id that best match it. If the hunch
   cannot be tested with the measures available, say so honestly and do not guess.
2. Answer using ONLY the fields returned. Never use numbers from your own memory.
3. Structure: (a) verdict in one plain sentence, (b) the size of the change using
   early_mean vs late_mean ("7 days a year in the 1980s, 19 now"), (c) one sentence
   on whether luck could explain it (use share_as_strong if given), (d) the caveat.
4. Verdict wording: real = "the data backs your hunch"; leaning = "points that way but
   we can't rule out luck"; not_backed = "the data doesn't support it"; opposite =
   "surprise, the data shows the reverse".
5. Always name the source: NASA POWER (MERRA-2), 1981-2025.
6. Say "the data shows", never "this proves". Keep it under 120 words.
7. If the place has no data for the measure, say which measures are available.
```

### What keeps the chatbot honest

- The verdict word comes from the `verdict` column. The model does not decide it.
- A place that is not in the data gets the nearest available place, and the answer says so.
- The answer never states a cause such as "because of climate change". The data shows a
  change, not the reason for it.
- The cases in section 6 are the check that the wiring is right.

---

## 5. App features and the data behind each one

| Feature | Data |
|---|---|
| Map of 38 places, pin coloured by verdict for the chosen measure | `results.csv` (`lat`, `lon`, `verdict`) |
| Answer card for a hunch | the single `results.csv` row |
| Trend chart with the 1981–1990 and 2016–2025 averages marked | `annual.csv` + `early_mean`/`late_mean` |
| "Could this be luck?" | `luck.csv` → "X in 1,000 shuffles" |
| Season clock, summer start and end drawn per year | `season_dates.csv` |
| "When would we know?" line on `leaning` answers | `years_to_know.csv` (`note`) |
| "Shuffle the years" animation | `luck_lines.csv` |
| "Also changing here", and "what's changing in X?" in the chatbot | `top_changes.csv` |
| Warming stripes behind the chart | `stripes.csv` |
| "Heatwave in my birthday week?", and the map's future mode | `trip_weeks.csv` |
| Footer on every page | "NASA POWER (MERRA-2), 1981–2025, ~50 km grid" |

---

## 6. Test cases

These are the expected answers. If the app shows different numbers, the lookup is wrong.

| Hunch | Place / measure | `early_mean` → `late_mean` | `verdict` |
|---|---|---|---|
| "Summers are getting hotter" | London / `heatwave_days` | 7.2 → 18.7 days | `real` |
| "Nights are too warm" | London / `warm_nights` | 12.9 → 27.9 nights | `real` |
| "Summers last longer" | London / `summer_length` | 77.2 → 107.7 days | `real` |
| "We barely get frosts" | London / `first_frost_doy` | day 321.5 → 326.8 | `leaning` |
| "Summer dry spells are longer" | Plymouth / `summer_dry_spell` | 15.3 → 11.7 days | `opposite` |
| "It's snowing less" | any | not testable | no measure for this |
| "Frost is rarer" | Cairo | no row for world cities | heat measures only |

---

## 7. Limitations the app keeps visible

- Values are averages over a roughly 50 km square, so peaks read low (London's hottest day
  shows about 34.5 °C; stations recorded about 40 °C). **Trends are still valid.**
- "Unusually hot" is relative to each place (its own top 10% of 1981–2010 summer days), so
  the bar differs between towns.
- Years with no heatwave or no frost have no date and drop out of those trends.
- Belfast, Aberdeen, Toronto, Lisbon and Cape Town use a neighbouring land square, because
  their own square is mostly sea or lake.
- Singapore's `caveat` starts with `PROVISIONAL`: its square is partly sea, so daytime highs
  read low. Mexico City reads about 3 °C low, because its square sits higher than the city.
- In tropical cities (Singapore, Bangkok, Mexico City) temperatures vary little, so warm-night
  counts rise very steeply. They are worded as "how often", not "how much hotter".
- Rain varies a lot from year to year, so most rain trends are only `leaning`.
- Sunshine data starts in 1984.
- **Delhi** shows no heat increase in this data. This has not been checked against station
  records, so Delhi is not used in a headline or in the demo.

---

## 8. What stays fixed

- The column names and their order, the four verdict words and the measure IDs do not change.
- The numbers can shift slightly if the trend-test rule is updated. New files keep the same
  layout, so the app reloads them and holds no hard-coded numbers.
- The CSVs are generated by the code in `src/` and are not edited by hand.
