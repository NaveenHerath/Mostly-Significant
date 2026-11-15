"""
STEP 2 - MEASURES: this turns daily weather into ONE NUMBER PER YEAR for each hunch.

Example: 16,436 daily temperatures for London -> "heatwave days in 1981, 1982, ... 2025".
This file is a toolbox used by build_results.py; it does not run on its own.

DEFINITIONS (the same wording is used in the app and on the project page)
  Baseline years  : 1981 to 2010. This is the "normal" each place is compared against.
  Warm season     : that place's five warmest months in a row. This is May-September in
                    every UK town, but differs elsewhere (November-March in Sydney).
  Hot day         : daily maximum at or above that place's 90th percentile of
                    warm-season daily maximums in the baseline years.
  Heatwave        : 3 or more hot days in a row.
  Warm night      : daily minimum at or above that place's 90th percentile of
                    warm-season daily minimums in the baseline years.
  Summer length   : days in the year whose 5-day centred average temperature is 15 C or more.
  Autumn onset    : first day from 1 July when the 5-day average drops below 10 C.
  First frost     : first day from 1 August with a daily minimum of 0 C or below.
  Heavy rain day  : 10 mm of rain or more in the day.
  Dry spell       : days in a row with under 1 mm of rain, within June-August.
  Winter rainfall : December-February total, named after the year of its January.
  Summer sunshine : average daily sunlight energy at the ground in June-August (from 1984).
  Heating need    : NASA's heating degree days (degrees below 18.3 C), added up over the year.
  Yearly sunshine : average daily sunlight energy at the ground over the whole year (from 1984).
  Cooling need    : NASA's cooling degree days (degrees above 18.3 C), added up over the year.
  Muggy night     : a June-August day whose average dew point is 16 C or more.
  Windy day       : strongest wind of the day above that place's 95th percentile of
                    daily maximum winds in the baseline years.
  Dry soil day    : a June-August day whose topsoil is drier than that place's 10th
                    percentile of June-August topsoil wetness in the baseline years.
  Year            : January-December. South of the equator it is July-June, named after the
                    year it ends in, so that one summer is never split across two years.
"""
import numpy as np
import pandas as pd

BASELINE = (1981, 2010)
FIRST_YEAR, LAST_YEAR = 1981, 2025

# The measures that mean the same thing in any climate. World cities get only these;
# frost, summer length and the June-August and December-February measures are built around
# UK seasons. The last two are whole-year versions of sunshine and energy need, made for the
# world cities, so UK towns keep their own summer sunshine and heating need instead.
WORLD_ONLY_MEASURES = ["yearly_sunshine", "cooling_need"]
WORLD_MEASURES = ["heatwave_events", "heatwave_days", "longest_heatwave", "hottest_day", "warm_nights",
                  "wettest_day", "heavy_rain_days", "windy_days"] + WORLD_ONLY_MEASURES
# A year of sunshine needs at least this many days with a reading to count.
MIN_SUN_DAYS = 330
# A year of rain needs nearly every day. Rain is only ever blank where clean.py removed a
# faulty stretch (Singapore from 2021), and those years get no rain measure at all.
MIN_RAIN_DAYS = 350
MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# The catalogue of measures. Each entry tells the app what the number is, and tells the
# verdict step which direction the public hunch expects ("up" = more / later / hotter).
MEASURES = {
    "heatwave_events": dict(
        name="Heatwaves per year", unit="heatwaves", season="summer", expected="up",
        definition="Number of heatwaves a year. A heatwave is 3 or more days in a row that are unusually hot for that place.",
        caveat="'Unusually hot' means the top 10% of 1981-2010 summer days for that place, so the temperature bar differs between towns."),
    "heatwave_days": dict(
        name="Heatwave days per year", unit="days", season="summer", expected="up",
        definition="Number of days a year that fall inside a heatwave (3 or more unusually hot days in a row).",
        caveat="'Unusually hot' means the top 10% of 1981-2010 summer days for that place, so the temperature bar differs between towns."),
    "longest_heatwave": dict(
        name="Longest heatwave", unit="days", season="summer", expected="up",
        definition="Length of the longest heatwave of the year, in days. Zero means the year had no heatwave.",
        caveat="One long hot spell can dominate a year, so single years jump around a lot."),
    "first_heatwave_doy": dict(
        name="Date of first heatwave", unit="day of year", season="summer", expected="down",
        definition="The day of the year the first heatwave starts. A smaller number means heatwaves arrive earlier.",
        caveat="Years with no heatwave have no date and are left out, so this trend uses fewer years."),
    "hottest_day": dict(
        name="Hottest day of the year", unit="°C", season="summer", expected="up",
        definition="The highest daytime temperature reached in the year.",
        caveat="NASA values are averages over a roughly 50 km square, so peaks read lower than a city weather station."),
    "warm_nights": dict(
        name="Warm nights per year", unit="nights", season="summer", expected="up",
        definition="Number of nights a year that stay unusually warm for that place, the kind that make sleep difficult.",
        caveat="'Unusually warm' means the top 10% of 1981-2010 summer nights for that place."),
    "summer_length": dict(
        name="Length of summer", unit="days", season="summer", expected="up",
        definition="Number of days a year with summer-like warmth: a 5-day average temperature of 15 °C or more.",
        caveat="15 °C is a fixed bar, so colder northern towns have short 'summers' by this measure."),
    "autumn_onset_doy": dict(
        name="Start of autumn", unit="day of year", season="autumn", expected="up",
        definition="The day of the year autumn chill arrives: the first time after 1 July the 5-day average drops below 10 °C.",
        caveat="A single early cold snap can pull the date forward in any one year."),
    "first_frost_doy": dict(
        name="First frost", unit="day of year", season="autumn", expected="up",
        definition="The day of the year of the first autumn frost: the first night after 1 August at 0 °C or below.",
        caveat="Mild years with no frost before 31 December have no date and are left out. Local frost hollows are missed by 50 km data."),
    "wettest_day": dict(
        name="Wettest day of the year", unit="mm", season="year", expected="up",
        definition="The most rain that fell in a single day in the year.",
        caveat="NASA values are averages over a roughly 50 km square, so a local downpour reads lower than a rain gauge under it."),
    "heavy_rain_days": dict(
        name="Heavy rain days per year", unit="days", season="year", expected="up",
        definition="Number of days a year with 10 mm of rain or more, a properly wet day.",
        caveat="Rain swings a lot from one year to the next, so a trend needs to be large before it can be told apart from chance."),
    "summer_dry_spell": dict(
        name="Longest summer dry spell", unit="days", season="summer", expected="up",
        definition="The longest run of days in a row with under 1 mm of rain, in June to August.",
        caveat="One long dry spell can dominate a year (56 days in London in 2018), so single years jump around a lot."),
    "winter_rain": dict(
        name="Winter rainfall", unit="mm", season="winter", expected="up",
        definition="Total rain from December to February. The winter is named after the year its January falls in.",
        caveat="The first winter is 1981-82, so 1981 has no value. Rain swings a lot from one year to the next."),
    "summer_sunshine": dict(
        name="Summer sunshine", unit="MJ/m² per day", season="summer", expected="up",
        definition="Average sunlight energy reaching the ground each day in June to August. A higher number means sunnier, less cloudy summers.",
        caveat="NASA's sunshine record starts in 1984, so this trend covers 1984 to 2025."),
    "heating_need": dict(
        name="Heating need", unit="degree days", season="winter", expected="down",
        definition="How much heating a home needs over the year: for each day colder than 18.3 °C, the number of degrees below it is added up. A smaller number means less heating.",
        caveat="This counts cold weather only. Real heating bills also depend on insulation, wind and prices."),
    "yearly_sunshine": dict(
        name="Sunshine over the year", unit="MJ/m² per day", season="year", expected="up",
        definition="Average sunlight energy reaching the ground each day, over the whole year. A higher number means sunnier, less cloudy or less hazy skies.",
        caveat="NASA's sunshine record starts in 1984, so this trend starts then. Haze and air pollution dim the sun as well as cloud."),
    "cooling_need": dict(
        name="Cooling need", unit="degree days", season="year", expected="up",
        definition="How much cooling a home needs over the year: for each day warmer than 18.3 °C, the number of degrees above it is added up. A bigger number means more need for fans or air conditioning.",
        caveat="This counts warm weather only. Real cooling use also depends on humidity, buildings and who has air conditioning."),
    "muggy_nights": dict(
        name="Muggy nights per year", unit="nights", season="summer", expected="up",
        definition="Number of June-August days with a dew point of 16 °C or more, air so humid that nights feel sticky and sleep is hard.",
        caveat="Humidity comes from NASA's MERRA-2 weather model, not from measurements, so its trend is less certain than temperature. Most UK summers have only a handful of these nights."),
    "windy_days": dict(
        name="Windy days per year", unit="days", season="year", expected="up",
        definition="Number of days a year whose strongest wind is in the top 5% for that place in 1981-2010.",
        caveat="Wind comes from NASA's MERRA-2 weather model averaged over a roughly 50 km square, so gusts read low and the bar is set per place. Model wind trends are less certain than temperature and can differ from local stations."),
    "dry_soil_days": dict(
        name="Dry soil days in summer", unit="days", season="summer", expected="up",
        definition="Number of June-August days the topsoil is drier than all but the driest 10% of 1981-2010 summer days for that place.",
        caveat="Soil wetness comes from NASA's MERRA-2 land model, worked out from rain and temperature rather than measured, so its trend is less certain than temperature."),
}

# UK towns get every measure except the whole-year ones made for the world cities.
UK_MEASURES = [m for m in MEASURES if m not in WORLD_ONLY_MEASURES]


def _run_lengths(flags):
    """Takes a True/False list of days and returns (start position, length) of each run of Trues."""
    runs, start = [], None
    for i, flag in enumerate(flags):
        if flag and start is None:
            start = i                          # a run of hot days begins here
        elif not flag and start is not None:
            runs.append((start, i - start))    # the run just ended
            start = None
    if start is not None:
        runs.append((start, len(flags) - start))
    return runs


def is_southern(place_daily):
    """True if the place is south of the equator, where summer falls around New Year."""
    return place_daily["lat"].iloc[0] < 0


def warm_months(place_daily):
    """Finds this place's five warmest months in a row, e.g. [5, 6, 7, 8, 9] for May-September."""
    d = place_daily[place_daily["date"].dt.year.between(*BASELINE)]
    monthly = d.groupby(d["date"].dt.month)["T2M_MAX"].mean()      # average daytime high per month
    # Every possible 5-month window is tried (they can wrap past December) and the warmest wins.
    windows = [[(start + k) % 12 + 1 for k in range(5)] for start in range(12)]
    return max(windows, key=lambda months: monthly[months].sum())


def warm_season_label(place_daily):
    """The warm season in words, e.g. 'May-Sep', for the thresholds file and the caveats."""
    months = warm_months(place_daily)
    return MONTH_NAMES[months[0] - 1] + "-" + MONTH_NAMES[months[-1] - 1]


def thresholds(place_daily):
    """Works out what counts as 'unusually hot' for this place, using only baseline warm seasons."""
    d = place_daily
    in_baseline = d["date"].dt.year.between(*BASELINE) & d["date"].dt.month.isin(warm_months(d))
    return {
        "hot_day": d.loc[in_baseline, "T2M_MAX"].quantile(0.90),
        "warm_night": d.loc[in_baseline, "T2M_MIN"].quantile(0.90),
    }


def yearly_measures(place_daily):
    """Returns a table with one row per year and one column per measure, for a single place."""
    d = place_daily.sort_values("date").reset_index(drop=True).copy()
    limit = thresholds(d)

    # The daily mean temperature is smoothed over 5 days so one odd day can't flip a season.
    d["t5"] = d["T2M"].rolling(5, center=True, min_periods=3).mean()
    d["year"] = d["date"].dt.year
    d["doy"] = d["date"].dt.dayofyear
    d["hot"] = d["T2M_MAX"] >= limit["hot_day"]
    # The wind and soil bars are set per place from the baseline years, like the heat ones,
    # because 50 km model averages read low next to a local weather station.
    in_baseline = d["date"].dt.year.between(*BASELINE)
    windy_bar = d.loc[in_baseline, "WS10M_MAX"].quantile(0.95)
    dry_soil_bar = d.loc[in_baseline & d["date"].dt.month.isin([6, 7, 8]), "GWETTOP"].quantile(0.10)

    # South of the equator July-December is counted towards the next year, so the year
    # "2020" there means July 2019 to June 2020 and holds one whole summer. The first such
    # year with all its months is 1982. The calendar-date measures below (first heatwave,
    # autumn, frost) assume a January-December year and are only reported for the UK.
    first_year = FIRST_YEAR
    if is_southern(d):
        d["year"] = d["year"] + (d["date"].dt.month >= 7)
        first_year = FIRST_YEAR + 1

    # Winter rain: December is counted with the January and February that follow it, so the
    # total is worked out here, across the year boundary, before the year-by-year loop.
    month = d["date"].dt.month
    winter_of = d["date"].dt.year + (month == 12)
    winter_rain = d[month.isin([12, 1, 2])].groupby(winter_of)["PRECTOTCORR"].sum(min_count=85)

    rows = []
    for year, y in d.groupby("year"):
        if not first_year <= year <= LAST_YEAR:
            continue
        y = y.reset_index(drop=True)

        # Heatwaves: runs of hot days are found and only runs of 3 or more are kept.
        waves = [(s, n) for s, n in _run_lengths(y["hot"].tolist()) if n >= 3]

        # Autumn onset: first day from 1 July where the smoothed temperature is below 10 C.
        after_july = y[(y["date"] >= f"{year}-07-01") & (y["t5"] < 10)]
        # First frost: first day from 1 August where the night reached 0 C or below.
        frost = y[(y["date"] >= f"{year}-08-01") & (y["T2M_MIN"] <= 0)]
        # Summer days: the same days that are counted for summer length. The first and last
        # of them give the start and end of summer for the app's season clock.
        summer = y[y["t5"] >= 15]
        # Dry spells: runs of days with under 1 mm of rain inside June, July and August.
        june_to_august = y[y["date"].dt.month.isin([6, 7, 8])]
        dry_runs = _run_lengths((june_to_august["PRECTOTCORR"] < 1).tolist())
        has_rain = y["PRECTOTCORR"].notna().sum() >= MIN_RAIN_DAYS

        rows.append({
            "year": year,
            "heatwave_events": len(waves),
            "heatwave_days": sum(n for _, n in waves),
            "longest_heatwave": max((n for _, n in waves), default=0),
            "first_heatwave_doy": y.loc[waves[0][0], "doy"] if waves else np.nan,
            "hottest_day": y["T2M_MAX"].max(),
            "warm_nights": int((y["T2M_MIN"] >= limit["warm_night"]).sum()),
            "summer_length": len(summer),
            "summer_start_doy": summer["doy"].iloc[0] if len(summer) else np.nan,
            "summer_end_doy": summer["doy"].iloc[-1] if len(summer) else np.nan,
            "autumn_onset_doy": after_july["doy"].iloc[0] if len(after_july) else np.nan,
            "first_frost_doy": frost["doy"].iloc[0] if len(frost) else np.nan,
            "wettest_day": y["PRECTOTCORR"].max() if has_rain else np.nan,
            "heavy_rain_days": int((y["PRECTOTCORR"] >= 10).sum()) if has_rain else np.nan,
            "summer_dry_spell": max((n for _, n in dry_runs), default=0) if has_rain else np.nan,
            # The winter of 1981 would need December 1980, which is before the data starts.
            "winter_rain": winter_rain.get(year, np.nan) if year > FIRST_YEAR else np.nan,
            # Sunshine is blank before 1984, so those years come out blank here too.
            "summer_sunshine": june_to_august["ALLSKY_SFC_SW_DWN"].mean(),
            "heating_need": y["HDD18_3"].sum(),
            # A year with too few sunshine readings (1981-83, or a July-June year that starts
            # before 1984) is left blank, so half a year is never compared with whole ones.
            "yearly_sunshine": (y["ALLSKY_SFC_SW_DWN"].mean()
                                if y["ALLSKY_SFC_SW_DWN"].notna().sum() >= MIN_SUN_DAYS else np.nan),
            "cooling_need": y["CDD18_3"].sum(),
            "muggy_nights": int((june_to_august["T2MDEW"] >= 16).sum()),
            "windy_days": int((y["WS10M_MAX"] > windy_bar).sum()),
            "dry_soil_days": int((june_to_august["GWETTOP"] < dry_soil_bar).sum()),
        })
    return pd.DataFrame(rows)
