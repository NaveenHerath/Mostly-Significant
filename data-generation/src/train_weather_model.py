"""
STEP 8b - NEURAL WEATHER GENERATOR: this trains the network in weather_model.py on the daily
record of all 38 places, uses it to make up 1,000 possible versions of next year for each
place, and counts the weekly chances from those. It is a second, independent way to get the
numbers in trip_weeks.csv, and it is scored on the same unseen years as the simple method.

How it is run: python src/train_weather_model.py            (back-test, then the 2027 outlook)
               python src/train_weather_model.py backtest   (only the back-test)
               python src/train_weather_model.py final      (only the 2027 outlook)
Reads:  data/clean/daily.parquet
Writes: models/weather_gru.pt                 the trained network and what it needs to be reused
        models/realism_checks.csv             made-up weather compared with the real record
        data/results/outlook_checks.csv       rows with method = neural are added
        data/results/trip_weeks_neural.csv    same layout as trip_weeks.csv, 2027 rows from the network

THE METHOD IN PLAIN WORDS
  1. Statistics handles the slow change. Every past day is first warmed to stand in for the
     target year, exactly as build_outlook.py does. A network cannot be trusted outside the
     years it has seen, so the trend is not left to it.
  2. Each day is then written as "how far from normal for this place and date", so that the
     network only has to learn how weather moves from one day to the next: how hot days
     cluster, how rain comes in spells, how heat, dryness and cloud go together.
  3. The trained network is started from a real late-December and run forward one day at a
     time, drawing each next day from the chances it gives. That is done 1,000 times per place.
  4. The made-up days are turned back into degrees and millimetres, then labelled and counted
     with the same functions as the simple outlook.

THE BACK-TEST
  The network is trained on days up to the end of 2020 only, makes up 1,000 versions of 2023,
  and is scored against what happened in 2021-2025 (Brier score, as in build_outlook.py).
  The last two known years are held back from training and used to decide when to stop.
"""
import os
import sys
import time

import numpy as np
import pandas as pd
import torch

from build_outlook import (ALL_LABELS, OUTLOOK_YEAR, TEST_KNOWN_UNTIL, TEST_TARGET, TEST_YEARS,
                           add_week, build_trip_weeks, label_days, month_trends, shift_to, week_chances)
from measures import _run_lengths, thresholds
from weather_model import CHANNELS, LIMIT, RAIN_EDGES, N_RAIN, WeatherGRU

RESULTS_DIR = os.path.join("data", "results")
MODEL_DIR = "models"
FIRST_YEAR = 1984        # cloud data starts here, and the network needs every value
N_SIMS = 1000            # made-up years per place
PAD = 7                  # extra made-up days before 1 January and after 31 December, so a
                         # heatwave that crosses the new year is counted whole
WARM_UP = 60             # real days the network reads before it starts making days up
WINDOW, SKIP = 96, 16    # training reads 96 days at a time; the first 16 are not scored
BATCH, STEPS, CHECK_EVERY = 64, 2000, 200
RAIN_CHOICES = 256       # stored rain amounts per place and band, to draw from
# The smallest spread allowed for each of the six values, so nothing is divided by zero.
MIN_SPREAD = np.array([0.3, 0.05, 0.05, 2.0, 0.05, 0.005])


# ---------------------------------------------------------------- 1. from days to numbers

def day_of_year(dates):
    """Day 1 to 365. In a leap year 29 February shares day 59 with 28 February."""
    day = dates.dt.dayofyear - (dates.dt.is_leap_year & (dates.dt.dayofyear > 59))
    return day.to_numpy()


def clock(day):
    """The time of year as a point on a circle, once round and twice round per year."""
    angle = 2 * np.pi * (np.asarray(day) - 0.5) / 365
    return np.stack([np.sin(angle), np.cos(angle), np.sin(2 * angle), np.cos(2 * angle)], axis=-1)


def seasonal_normal(values, day):
    """Fits a smooth yearly curve through the values and returns it for days 1 to 365."""
    def waves(d):
        angle = 2 * np.pi * (np.asarray(d) - 0.5) / 365
        return np.column_stack([np.ones(len(angle))] + [f(k * angle) for k in range(1, 5) for f in (np.sin, np.cos)])
    weights = np.linalg.lstsq(waves(day), values, rcond=None)[0]
    return waves(np.arange(1, 366)) @ weights


def by_day_average(values, day):
    """The average for each day of the year, taken over that day and the 15 days either side."""
    total = np.bincount(day - 1, weights=values, minlength=365)
    count = np.bincount(day - 1, minlength=365)
    window = np.ones(31)
    around = lambda x: np.convolve(np.tile(x, 3), window, mode="same")[365:730]
    return around(total) / around(count)


def make_state(values, rain, dry_days, rain_7, rain_30, warm_30):
    """Puts one day's weather and memory into the row of numbers the network reads."""
    lib = torch if torch.is_tensor(rain) else np
    extra = [lib.log1p(rain) / 2, (rain >= 1) * 1.0, lib.log1p(dry_days) / 3,
             lib.log1p(rain_7) / 3, lib.log1p(rain_30) / 4, warm_30]
    if lib is torch:
        return torch.cat([values, torch.stack(extra, dim=-1)], dim=-1).float()
    return np.concatenate([values, np.stack(extra, axis=-1)], axis=-1)


def prepare(daily, known_until, target_year):
    """
    Turns the daily record into what the network trains on. Only days up to known_until are
    used, and they are warmed to stand in for target_year first.
    """
    data = dict(places=[], state=[], rain=[], dry=[], normal=[], spread=[], date_info=[],
                facts=[], rain_table=[], bars={}, real={})
    for place, d in daily.groupby("place", sort=False):
        bars = thresholds(d)
        d = add_week(d)
        d = d[d["year"] <= known_until]
        d = shift_to(d, month_trends(d, known_until), target_year)
        d = d[d["year"] >= FIRST_YEAR].reset_index(drop=True)
        day = day_of_year(d["date"])
        rain = d["PRECTOTCORR"].to_numpy()

        # The six values. Range, dryness and wind are always positive and lopsided, so their
        # logarithm is used; that also keeps a made-up night from being warmer than its day.
        raw = np.column_stack([
            d["T2M_MAX"],
            np.log(np.maximum(d["T2M_MAX"] - d["T2M_MIN"], 0.1)),
            np.log(np.maximum(d["T2M_MAX"] - d["T2MDEW"], 0.1)),
            d["CLOUD_AMT"].ffill().bfill(),
            np.log(d["WS10M"]),
            d["GWETROOT"],
        ])
        # Each value becomes "how many usual spreads away from normal for this date".
        normal = np.column_stack([seasonal_normal(raw[:, k], day) for k in range(len(CHANNELS))])
        spread = np.column_stack([np.sqrt(by_day_average((raw[:, k] - normal[day - 1, k]) ** 2, day))
                                  for k in range(len(CHANNELS))])
        spread = np.maximum(spread, MIN_SPREAD)
        values = np.clip((raw - normal[day - 1]) / spread[day - 1], -LIMIT, LIMIT)

        # Memory: days since rain, and running totals over the last 7 and 30 days.
        dry = np.zeros(len(d))
        for t in range(len(d)):
            dry[t] = 0 if rain[t] >= 1 else (dry[t - 1] + 1 if t else 1)
        rain_7 = pd.Series(rain).rolling(7, min_periods=1).sum().to_numpy()
        rain_30 = pd.Series(rain).rolling(30, min_periods=1).sum().to_numpy()
        warm_30 = pd.Series(values[:, 0]).rolling(30, min_periods=1).mean().to_numpy()

        # What the network is told about each date: the clock, the normal chance of a wet
        # day and the normal high.
        date_info = np.column_stack([clock(np.arange(1, 366)), by_day_average((rain >= 1) * 1.0, day),
                                     (normal[:, 0] - 15) / 10])
        # Rain amounts to draw from: for each band, 256 values spread evenly through the
        # amounts this place really had in that band.
        band = np.digitize(rain, RAIN_EDGES)
        edges = [0.0] + RAIN_EDGES + [RAIN_EDGES[-1] * 1.5]
        table = np.zeros((N_RAIN, RAIN_CHOICES))
        for b in range(N_RAIN):
            had = rain[band == b]
            table[b] = (np.quantile(had, np.linspace(0, 1, RAIN_CHOICES)) if len(had)
                        else np.linspace(edges[b], edges[b + 1], RAIN_CHOICES, endpoint=False))

        data["places"].append(place)
        data["state"].append(make_state(values, rain, dry, rain_7, rain_30, warm_30))
        data["rain"].append(rain)
        data["dry"].append(dry)
        data["normal"].append(normal)
        data["spread"].append(spread)
        data["date_info"].append(date_info)
        data["facts"].append([d["lat"].iloc[0] / 60, np.exp(normal[:, 1]).mean() / 10,
                              (normal[:, 0].mean() - 15) / 10, np.log1p(rain.sum() / d["year"].nunique()) / 7])
        data["rain_table"].append(table)
        data["bars"][place] = bars
        data["real"][place] = d[["year", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "CLOUD_AMT"]]

    # Every place covers the same dates, so the per-place tables stack into blocks.
    data["day"], data["year"] = day.copy(), d["year"].to_numpy()
    for key in ("state", "rain", "dry", "normal", "spread", "date_info", "facts", "rain_table"):
        data[key] = torch.tensor(np.stack(data[key]), dtype=torch.float32)
    data["band"] = torch.bucketize(data["rain"], torch.tensor(RAIN_EDGES), right=True)
    data["known_until"], data["target_year"] = known_until, target_year
    return data


# ---------------------------------------------------------------- 2. training

def batch_at(data, place, start, length):
    """Cuts runs of days out of the record: what the network reads and what came next."""
    days = start[:, None] + torch.arange(length)
    place_col = place[:, None]
    next_day = torch.as_tensor(data["day"])[days + 1] - 1
    return dict(state=data["state"][place_col, days],
                date_info=data["date_info"][place_col, next_day],
                place_facts=data["facts"][place][:, None, :].expand(-1, length, -1),
                place=place_col.expand(-1, length),
                rain_band=data["band"][place_col, days + 1],
                values=data["state"][place_col, days + 1, :len(CHANNELS)])


def train(data, steps=STEPS):
    """Trains the network and returns it at the point where it did best on the held-back years."""
    torch.manual_seed(0)
    n_places, n_days = data["state"].shape[:2]
    # The last two known years are held back. The network never trains on them.
    held_from = int(np.argmax(data["year"] >= data["known_until"] - 1))
    held = batch_at(data, torch.arange(n_places), torch.full((n_places,), held_from - WARM_UP),
                    n_days - 1 - (held_from - WARM_UP))

    model = WeatherGRU(n_places)
    optimiser = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-4)
    schedule = torch.optim.lr_scheduler.OneCycleLR(optimiser, max_lr=3e-3, total_steps=steps, pct_start=0.05)
    best, best_weights, started = np.inf, None, time.time()
    for step in range(1, steps + 1):
        model.train()
        place = torch.randint(n_places, (BATCH,))
        start = torch.randint(held_from - WINDOW - 1, (BATCH,))
        score = model.loss(**batch_at(data, place, start, WINDOW))[:, SKIP:].mean()
        optimiser.zero_grad()
        score.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimiser.step()
        schedule.step()

        if step % CHECK_EVERY == 0 or step == steps:
            model.eval()
            with torch.no_grad():
                held_score = model.loss(**held)[:, WARM_UP:].mean().item()
            if held_score < best:
                best, best_weights = held_score, {k: v.clone() for k, v in model.state_dict().items()}
            print(f"  step {step:5d}  training {score.item():7.3f}  held-back {held_score:7.3f}"
                  f"  best {best:7.3f}  ({time.time() - started:4.0f} s)", flush=True)
    model.load_state_dict(best_weights)
    model.eval()
    return model


# ---------------------------------------------------------------- 3. making up years

@torch.no_grad()
def simulate(model, data, n_sims=N_SIMS, seed=1):
    """
    Makes up n_sims versions of the target year for every place. Returns one table per place
    with the daily high, low, rain and cloud of each made-up day (PAD extra days at each end).
    """
    torch.manual_seed(seed)
    n_places = len(data["places"])
    place = torch.arange(n_places).repeat_interleave(n_sims)
    facts = data["facts"][place]
    day, year = data["day"], data["year"]

    # Each made-up year starts from a real 24 December, picked at random from the record.
    # The network first reads the 60 real days before it, to pick up the state of the weather.
    ends = np.flatnonzero((day == 365 - PAD) & (np.arange(len(day)) >= WARM_UP))
    end = torch.as_tensor(np.random.default_rng(seed).choice(ends, len(place)))
    read = batch_at(data, place, end - WARM_UP, WARM_UP)
    memory = model.read(read["state"], read["date_info"], read["place_facts"], read["place"])
    state = data["state"][place, end]
    last_30 = end[:, None] + torch.arange(-29, 1)
    rain_log, warm_log = data["rain"][place[:, None], last_30], data["state"][place[:, None], last_30, 0]
    dry = data["dry"][place, end]

    n_days = PAD + 365 + PAD
    kept = {name: np.zeros((len(place), n_days), dtype=np.float32) for name in ("T2M_MAX", "T2M_MIN", "PRECTOTCORR", "CLOUD_AMT")}
    for step in range(n_days):
        today = (365 - PAD + step) % 365            # position 0 to 364 of the day being made up
        band, values, memory = model.draw_next_day(state, data["date_info"][place, today], facts, place, memory)
        rain = data["rain_table"][place, band, torch.randint(RAIN_CHOICES, (len(place),))]

        # The memory values are moved on by one day, then the new day becomes "today".
        rain_log = torch.cat([rain_log[:, 1:], rain[:, None]], dim=1)
        warm_log = torch.cat([warm_log[:, 1:], values[:, :1]], dim=1)
        dry = torch.where(rain >= 1, torch.zeros_like(dry), dry + 1)
        state = make_state(values, rain, dry, rain_log[:, -7:].sum(1), rain_log.sum(1), warm_log.mean(1))

        # Back from "spreads away from normal" to degrees and percent.
        real = data["normal"][place, today] + data["spread"][place, today] * values
        kept["T2M_MAX"][:, step] = real[:, 0]
        kept["T2M_MIN"][:, step] = real[:, 0] - torch.exp(real[:, 1])
        kept["CLOUD_AMT"][:, step] = real[:, 3].clamp(0, 100)
        kept["PRECTOTCORR"][:, step] = rain

    tables = {}
    for p, name in enumerate(data["places"]):
        rows = slice(p * n_sims, (p + 1) * n_sims)
        table = pd.DataFrame({column: block[rows].ravel() for column, block in kept.items()})
        table["year"] = np.repeat(np.arange(1, n_sims + 1), n_days)      # the made-up year's number
        table["in_year"] = np.tile((np.arange(n_days) >= PAD) & (np.arange(n_days) < PAD + 365), n_sims)
        tables[name] = table
    return tables


def chances_from(tables, data):
    """Labels and counts the made-up days exactly as the simple outlook does its real days."""
    calendar = add_week(pd.DataFrame({"date": pd.date_range(f"{data['target_year']}-01-01", periods=365)}))
    chances = {}
    for place, table in tables.items():
        n_sims = table["year"].max()
        labelled = label_days(table, data["bars"][place])
        labelled = labelled[labelled["in_year"]].copy()        # the extra days at each end are dropped
        labelled["week"] = np.tile(calendar["week"].to_numpy(), n_sims)
        chances[place] = week_chances(labelled, 1, n_sims)
    return chances


# ---------------------------------------------------------------- 4. checks

def score_backtest(daily, neural):
    """Brier scores for 2021-2025, worked out the same way as in build_outlook.py."""
    errors = []
    for place, d in daily.groupby("place", sort=False):
        region, bars = d["region"].iloc[0], thresholds(d)
        d = add_week(d)
        guidebook = week_chances(label_days(d[d["year"] <= TEST_KNOWN_UNTIL], bars), 1981, 2010)
        truth = label_days(d, bars)
        truth = truth[truth["year"].between(*TEST_YEARS)]
        happened = {"heatwave_week": truth.groupby(["week", "year"])["heatwave_day"].any().astype(float).reset_index(name="outcome")}
        for label in ALL_LABELS[1:]:
            happened[label] = truth[["week", label]].rename(columns={label: "outcome"}).dropna()
        for method, table in (("guidebook", guidebook), ("neural", neural[place])):
            for label, outcomes in happened.items():
                gap = (outcomes["week"].map(table.set_index("week")["p_" + label]) - outcomes["outcome"]) ** 2
                errors.append({"region": region, "place": place, "label": label, "method": method,
                               "squared_gaps": gap.sum(), "cases": len(gap)})
    errors = pd.DataFrame(errors)
    totals = pd.concat([errors.assign(region="All"), errors]).groupby(["region", "label", "method"])[["squared_gaps", "cases"]].sum()
    brier = (totals["squared_gaps"] / totals["cases"]).unstack("method")
    rows = pd.DataFrame({"region": brier.index.get_level_values("region"), "label": brier.index.get_level_values("label"),
                         "method": "neural", "cases": totals["cases"].xs("neural", level="method").reindex(brier.index).to_numpy(),
                         "brier": brier["neural"].to_numpy(), "brier_guidebook": brier["guidebook"].to_numpy(),
                         "skill_vs_guidebook": (1 - brier["neural"] / brier["guidebook"]).to_numpy()})
    return rows.round({"brier": 4, "brier_guidebook": 4, "skill_vs_guidebook": 3})


def add_to_checks(neural_rows):
    """Adds the network's scores to outlook_checks.csv, next to the other methods."""
    path = os.path.join(RESULTS_DIR, "outlook_checks.csv")
    checks = pd.read_csv(path)
    checks = pd.concat([checks[checks["method"] != "neural"], neural_rows], ignore_index=True)
    order = lambda column, values: checks[column].map({v: i for i, v in enumerate(values)})
    checks = checks.assign(a=order("region", ["All", "UK", "World"]), b=order("label", ALL_LABELS),
                           c=order("method", ["guidebook", "recent", "simple", "neural"]))
    checks = checks.sort_values(["a", "b", "c"]).drop(columns=["a", "b", "c"])
    checks.to_csv(path, index=False)
    return checks


def realism(tables, data):
    """Compares the made-up weather with the real record on things the network was never told to match."""
    def describe(d, bars):
        years = d["year"].nunique()
        hot_runs = [n for _, n in _run_lengths((d["T2M_MAX"] >= bars["hot_day"]).tolist())]
        waves = [n for n in hot_runs if n >= 3]
        dry_runs = [n for _, n in _run_lengths((d["PRECTOTCORR"] < 1).tolist())]
        return {"hot days a year": sum(hot_runs) / years,
                "heatwaves a year": len(waves) / years,
                "average heatwave length (days)": np.mean(waves) if waves else np.nan,
                "share of heatwaves lasting 5+ days": np.mean([n >= 5 for n in waves]) if waves else np.nan,
                "warm nights a year": (d["T2M_MIN"] >= bars["warm_night"]).sum() / years,
                "rain days a year (1 mm+)": (d["PRECTOTCORR"] >= 1).sum() / years,
                "average dry spell (days)": np.mean(dry_runs),
                "share of dry spells lasting 10+ days": np.mean([n >= 10 for n in dry_runs]),
                "wettest day of the year (mm)": d.groupby("year")["PRECTOTCORR"].max().mean(),
                "hottest day of the year (C)": d.groupby("year")["T2M_MAX"].max().mean()}
    rows = []
    for place, table in tables.items():
        made_up = table[table["in_year"] & (table["year"] <= 200)]      # 200 made-up years are plenty here
        for source, d in (("real", data["real"][place]), ("made_up", made_up)):
            rows.append({"place": place, "source": source, **describe(d, data["bars"][place])})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- 5. the two runs

def run_backtest(daily):
    print(f"BACK-TEST: trained on days to {TEST_KNOWN_UNTIL}, scored on {TEST_YEARS[0]}-{TEST_YEARS[1]}")
    data = prepare(daily, TEST_KNOWN_UNTIL, TEST_TARGET)
    model = train(data)
    tables = simulate(model, data)
    checks = add_to_checks(score_backtest(daily, chances_from(tables, data)))
    print(checks[checks["region"] == "All"].to_string(index=False), "\n")

    by_place = realism(tables, data)
    by_place.round(2).to_csv(os.path.join(MODEL_DIR, "realism_checks.csv"), index=False)
    # The average over all places, real against made-up, side by side.
    print(by_place.drop(columns="place").groupby("source").mean().T[["real", "made_up"]].round(2).to_string(), "\n")


def run_final(daily):
    print(f"OUTLOOK: trained on days to 2025, making up {OUTLOOK_YEAR}")
    data = prepare(daily, 2025, OUTLOOK_YEAR)
    model = train(data)
    # Everything needed to reuse the network is saved with it: the places, in order, and
    # each place's normal and spread for every day of the year.
    torch.save({"weights": model.state_dict(), "places": data["places"], "target_year": OUTLOOK_YEAR,
                **{key: data[key] for key in ("normal", "spread", "date_info", "facts", "rain_table")}},
               os.path.join(MODEL_DIR, "weather_gru.pt"))

    chances = chances_from(simulate(model, data), data)
    # The file has the same layout as trip_weeks.csv. "Then" and "now" are counts of real
    # days and stay as they are; only the outlook rows come from the network.
    trips = build_trip_weeks(daily)
    outlook = trips["period"] == str(OUTLOOK_YEAR)
    neural = pd.concat([chances[place].assign(place=place) for place in data["places"]]).set_index(["place", "week"])
    columns = [c for c in trips.columns if c.startswith("p_")] + ["typ_max_low", "typ_max_high", "n_years"]
    index = pd.MultiIndex.from_frame(trips.loc[outlook, ["place", "week"]])
    trips.loc[outlook, columns] = neural.loc[index, columns].to_numpy()
    trips.loc[outlook, "method"] = "neural"
    chance_columns = [c for c in columns if c.startswith("p_")]
    trips[chance_columns] = trips[chance_columns].round(3)
    trips = trips.round({"typ_max_low": 1, "typ_max_high": 1})
    trips.to_csv(os.path.join(RESULTS_DIR, "trip_weeks_neural.csv"), index=False)
    print(trips[(trips["place"] == "London") & (trips["week"] == 28)].to_string(index=False))


if __name__ == "__main__":
    os.makedirs(MODEL_DIR, exist_ok=True)
    daily = pd.read_parquet(os.path.join("data", "clean", "daily.parquet"),
                            columns=["place", "region", "lat", "date", "T2M_MAX", "T2M_MIN", "PRECTOTCORR",
                                     "CLOUD_AMT", "T2MDEW", "WS10M", "GWETROOT"])
    which = sys.argv[1] if len(sys.argv) > 1 else "both"
    if which in ("both", "backtest"):
        run_backtest(daily)
    if which in ("both", "final"):
        run_final(daily)
