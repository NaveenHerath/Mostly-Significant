"""
STEP 3 - STATS: this tests one yearly series for a trend and turns the result into a verdict.

This file is a toolbox used by build_results.py; it does not run on its own.

THE THREE QUESTIONS IT ANSWERS
  Is there a trend?      Mann-Kendall test -> p-value (chance the pattern is just luck).
  How big is it?         Sen's slope       -> change per decade.
  Do two methods agree?  Linear regression -> a second opinion with a 95% range.
"""
import numpy as np
import pymannkendall as mk
from scipy import stats as sps

SIGNIFICANT = 0.05  # the usual scientific bar: under 5% chance the pattern is luck
MIN_YEARS = 10      # below this many years with a value, we refuse to call a trend


def trend_test(years, values):
    """Runs all the trend maths on one series and returns the numbers as a dictionary."""
    years = np.asarray(years, dtype=float)
    values = np.asarray(values, dtype=float)

    # Years with no value are dropped (e.g. no heatwave that year, so no 'first heatwave date').
    keep = ~np.isnan(values)
    x, y = years[keep], values[keep]
    out = {"n_years": int(len(y))}

    # Averages of the first and last 10 calendar years: the easy-to-explain comparison.
    early, late = values[years <= years.min() + 9], values[years >= years.max() - 9]
    out["early_mean"] = np.nan if np.isnan(early).all() else np.nanmean(early)
    out["late_mean"] = np.nan if np.isnan(late).all() else np.nanmean(late)

    # With fewer than 10 usable years no trend test is trustworthy, so the function stops here and says so.
    if len(y) < MIN_YEARS:
        out.update(p_value=np.nan, test_method="too few years", mk_z=np.nan, rate_per_decade=np.nan,
                   lr_rate_per_decade=np.nan, lr_ci_low=np.nan, lr_ci_high=np.nan,
                   lr_p_value=np.nan, methods_disagree=False)
        return out

    # Mann-Kendall asks: do later years tend to beat earlier years more often than chance?
    # The Hamed-Rao version corrects for years that resemble their neighbours (autocorrelation).
    result = mk.hamed_rao_modification_test(y)
    method = "Mann-Kendall (Hamed-Rao)"
    if np.isnan(result.p):
        # The correction can fail on awkward series; the original test is the fallback.
        result = mk.original_test(y)
        method = "Mann-Kendall (original)"
    out["p_value"], out["test_method"], out["mk_z"] = result.p, method, result.z

    # Sen's slope: the middle value of the slopes between every pair of years.
    # It ignores freak years, unlike an ordinary best-fit line. x10 turns per-year into per-decade.
    sen = sps.theilslopes(y, x)
    out["rate_per_decade"] = sen.slope * 10

    # Second opinion: ordinary straight-line fit, with its 95% confidence range.
    line = sps.linregress(x, y)
    margin = sps.t.ppf(0.975, len(y) - 2) * line.stderr
    out["lr_rate_per_decade"] = line.slope * 10
    out["lr_ci_low"] = (line.slope - margin) * 10
    out["lr_ci_high"] = (line.slope + margin) * 10
    out["lr_p_value"] = line.pvalue

    # A flag is raised if the two methods point in opposite directions (a sign the trend is fragile).
    out["methods_disagree"] = bool(sen.slope * line.slope < 0)
    return out


def direction(result):
    """Which way is the series going? +1 rising, -1 falling, 0 flat."""
    # Sen's slope decides; if it is exactly 0 (common for counts), late vs early averages decide instead.
    for value in (result["rate_per_decade"], result["late_mean"] - result["early_mean"], result["mk_z"]):
        if value > 0:
            return 1
        if value < 0:
            return -1
    return 0


def verdict(result, expected):
    """Compares the trend with what the hunch expects and returns one of four agreed words."""
    if result["n_years"] < MIN_YEARS:
        return "not_backed"   # not enough data to say anything
    going = direction(result)
    wanted = 1 if expected == "up" else -1
    proven = result["p_value"] < SIGNIFICANT

    if proven and going == wanted:
        return "real"         # significant, and in the direction people feel
    if proven and going == -wanted:
        return "opposite"     # significant, but the other way round
    if going == wanted:
        return "leaning"      # right direction, but could still be chance
    return "not_backed"       # no support in the data
