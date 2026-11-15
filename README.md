# Is it just me?

**Team Mostly Significant · NASA Space Apps Challenge 2026 · "Be an Earth System Trend Detective"**

A hunch fact-checker for the weather. People have feelings about how the weather is
changing: "summers are getting hotter", "we barely get frosts anymore". This site tests those
feelings against 45 years of NASA data and answers each one with a verdict, the size of the
change and an honest note on what the data cannot say.

## In numbers

| | |
|---|---|
| Places | 75: 49 UK towns and 26 world cities, in 22 countries, each in its own grid square |
| Years | 45 (1981–2025), about 1.2 million place-days (1,232,700) |
| Measures | 20: 18 per UK town, 10 per world city |
| Trends tested | 1,142: 448 real, 496 leaning, 164 not backed, 34 the opposite |
| Luck test | 1,000 shuffles per trend |
| Data | NASA POWER (MERRA-2), 15 daily variables, about 50 km squares |

## How it works for a visitor

1. Pick a place and a hunch, such as London and "Summers last longer", or type the hunch in
   your own words.
2. Guess first: "I think it's true", "I don't think so" or "No idea". The answer stays
   hidden until you guess.
3. See the verdict, whether your gut was right, the 1980s against the last ten years, the
   change per decade and the luck test. Then the year-by-year chart and the same hunch on a
   map of every other place.

Every hunch is asked the same way: "Is it just me? or... do summers last longer in London?"

There are four verdicts:

| Verdict | Meaning |
|---|---|
| **Yes, it's real** | Under a 5% chance of being luck, and in the direction the hunch claims |
| **Leaning that way** | The right direction, but luck can't be ruled out |
| **Not backed by the data** | No support in the data |
| **It's actually the opposite** | A real trend, going the other way |

UK towns get 18 hunches across heat, seasons, rain and wind, and sun and energy. World cities
get the 10 that mean the same in any climate: the five heat hunches, the two whole-year rain
hunches, windy days, yearly sunshine and air conditioning.

### What is on the page

From top to bottom:

| Section | What it does |
|---|---|
| **How it works** | Three steps and the headline numbers |
| **Say it your own way** | The chat box (below) |
| **Where? / What's your hunch?** | Place and hunch pills, then the guess |
| **Result, Year by year, Could it be luck?** | The verdict card, the chart with its trend line and 1980s and 2016–2025 averages, and a grid of 1,000 shuffles |
| **Everywhere else** | Every place on a map, coloured by its verdict for the chosen hunch |
| **Watch it change** | The map with a year slider, 1981 to 2025 |
| **Odd one out** | A game: three places, one hunch, which one went the other way? |
| **Real, error or quirk?** | A quiz on odd things in the data: a real change, a data fault or a quirk of the grid |
| **What you can do, why we built it, roadmap, meet the team, FAQ** | The project around the data |
| **The science** | The method, the stats and what the data can't tell you |

A **gut score** sits in a small bar in the corner after the first guess ("3 of 4 right"). It
counts guesses from the pickers, the chat and the games, and it resets when the page reloads.

## The chat box

A visitor can type a hunch in their own words ("nights are unbearable in Manchester"). The
sentence becomes a small case card in the conversation. It is reworded as "Is it just me?
or... are nights too warm to sleep in Manchester?", then the visitor guesses, then sees the
verdict, the 1980s and recent averages, the trend, the luck test and the caveat. It is the
same answer as the pickers give, in a smaller form, with a link to the full one.

Each card ends with follow-ups to tap: the same hunch in another place in the same region
where the verdict is different ("Is it just me? or... is it different in Plymouth?"), and
the clearest other change in the same place. A sentence about something the data cannot test (snow, storms, fog, a
forecast, why the climate changes) gets "can't test that", the reason, and related hunches
to try instead.

Two models can read the sentence, and the visitor chooses between them:

| Model | Where it runs | What it does |
|---|---|---|
| **Gemini** | A small server function (`docs/api/route.js`) | Picks the place and the measure from fixed lists, and words the result in two sentences |
| **MiniLM** (all-MiniLM-L12-v2, 32 MB) | In the visitor's browser, with transformers.js (`docs/matcher.js`) | Matches the sentence to the closest example phrase (`docs/phrases.js`). The backup when Gemini cannot be reached |

Neither model supplies a number. They choose which row of the results to show, and every
figure on the card comes from the results files. A Gemini sentence that contains a number
not on the card is thrown away and a fixed template is used instead.

`chat-eval/` holds 60 test questions and the script that scores both models on them
(`node evaluate.mjs`, results in `chat-eval/results.csv`). `node chat-eval/serve.mjs` runs
the site with the chat box on a laptop. The Gemini key is read from `.env.local`, which git
ignores; the live site reads it from Vercel's environment variables.

## The data

All numbers come from **NASA POWER (MERRA-2)**: daily weather from 1 January 1981 to
31 December 2025, on a grid of squares about 50 km across. Trends are tested with the
Mann-Kendall test (Hamed-Rao correction) and sized with Sen's slope, and each one is checked
against 1,000 shuffles of its years. The full method, the definitions and the limitations are
in [data-generation/README.md](data-generation/README.md).

## What is in this repository

The project has two phases, and the only thing that passes between them is a set of results
files.

| Phase | Folder | What it does |
|---|---|---|
| 1. Data generation | [`data-generation/`](data-generation/) | Downloads the NASA data, checks it, turns it into yearly measures, tests each one for a trend and writes the results files |
| 2. The site | `docs/` | Plain HTML, CSS and JavaScript that reads the results files and presents them. It calculates nothing itself |
| Backup | `app.py` | The first version of the app, in Streamlit, reading the same files |

```
NASA POWER API
   → data-generation/download_power.py      raw daily data for 75 places
   → data-generation/src/clean.py           one checked daily table
   → data-generation/src/build_results.py   yearly measures, trends, verdicts
   → data-generation/src/build_extras.py    luck test and season dates
   → data-generation/src/build_*.py         case file extras, outlook, timeline
   → data-generation/data/results/*.csv
   → docs/data/make_data.py, make_timeline.py   the same numbers as JSON for the site
   → docs/                                  the page a visitor sees
```

## Running it

The site:

```
python3 -m http.server 8000 --directory docs
```

then open http://localhost:8000. The chat box works there with the on-device model; Gemini
needs the server function (`node chat-eval/serve.mjs`, or Vercel).

The Streamlit backup:

```
pip install -r requirements.txt
streamlit run app.py
```

The results files are already in the repository, so both run straight away. Rebuilding them
from the NASA data is described in [data-generation/README.md](data-generation/README.md).

## Limitations

- Values are averages over a roughly 50 km square, so peaks read low. London's hottest day
  shows about 34.5 °C here (19 July 2022); weather stations recorded about 40 °C. The trends
  are still valid.
- "Unusually hot" is relative to each place, so the bar differs from town to town.
- Rain varies a lot from year to year, so most rain hunches are only "leaning".
- Muggy nights, windy days and dry soil days come from the weather model's humidity, wind
  and soil wetness, not from direct measurements, so they are less certain than temperature.
  Dry soil days change by less than a day a decade on Sen's slope (it comes out as 0), so the
  site shows them as then against now.
- The data shows that something has changed. It does not show why.

## Team

Mostly Significant, London, November 2026: Bathila (app and visuals) and Naveen (data and
stats).

## Licence

MIT. See [LICENSE](LICENSE).
