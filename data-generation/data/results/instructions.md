# How the app uses the results files

Team Mostly Significant, NASA Space Apps 2026. Data: **NASA POWER (MERRA-2)**, daily, 1981–2025.

Everything in this folder is already calculated. The app and the chatbot only **look up rows
and put them into words**. Nothing is calculated in the app, and the language model never
does any maths.

---

## 1. The files

| File | One row is | What the app uses it for |
|---|---|---|
| `results.csv` | one place × one measure (240 rows) | the verdict, the size of the change, the map, the chatbot's answers |
| `annual.csv` | one place × one measure × one year | trend charts and the time slider |
| `luck.csv` | one place × one measure | the "could this be luck?" feature |
| `season_dates.csv` (UK only) | one place × one year | the season-clock feature |

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

**World (12 cities, 5 measures each):** New York, Los Angeles, Toronto, Sao Paulo, Paris,
Berlin, Madrid, Cairo, Delhi, Tokyo, Sydney, Johannesburg.

World cities have only `heatwave_events`, `heatwave_days`, `longest_heatwave`, `hottest_day`
and `warm_nights`. A question about frost, rain, sunshine or heating in a world city has no
row, so the honest answer is that only heat measures are covered there.

Sydney, Sao Paulo and Johannesburg use July–June years, so their data starts in 1982. Their
`caveat` says so.

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

In the tool's schema, `place` is an enum of the 24 place names and `measure_id` an enum of
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
| Map of 24 places, pin coloured by verdict for the chosen measure | `results.csv` (`lat`, `lon`, `verdict`) |
| Answer card for a hunch | the single `results.csv` row |
| Trend chart with the 1981–1990 and 2016–2025 averages marked | `annual.csv` + `early_mean`/`late_mean` |
| "Could this be luck?" | `luck.csv` → "X in 1,000 shuffles" |
| Season clock, summer start and end drawn per year | `season_dates.csv` |
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
- Belfast, Aberdeen and Toronto use a neighbouring inland square, because their own square is
  mostly sea or lake.
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
