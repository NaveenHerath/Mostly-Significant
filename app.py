"""
Is it just me? (a project by Mostly Significant, NASA Space Apps 2026)

someone picks a place and an everyday hunch about the weather, guesses if it's true,
then sees what 45 years of NASA data say about it.

run it with:  streamlit run app.py

it only READS these files, nothing is calculated here:
    data-generation/data/results/results.csv   the verdict for each place + hunch
    data-generation/data/results/annual.csv    the yearly values behind each verdict (for the chart)
    data-generation/data/results/luck.csv      the shuffle test for each verdict
"""

import datetime                                   # for turning a day number (like 322) into a date (like 18 Nov)
import json                                       # for passing numbers safely into the little javascript counter
import os                                         # for building the path to the results folder

import pandas as pd                               # for reading the csv files
import plotly.express as px                       # quick charts, used for the map
import plotly.graph_objects as go                 # build-it-yourself charts, used for the trend chart
import streamlit as st                            # turns this script into a webpage

# ======================================================================== SETTINGS

# where naveen's results live, worked out from where this file is so it runs from any folder
RESULTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data-generation", "data", "results")

# every hunch, worded the way a normal person would say it
HUNCHES = {
    "heatwave_days": "Summers are getting hotter",
    "heatwave_events": "We get more heatwaves than we used to",
    "longest_heatwave": "Heatwaves last longer",
    "first_heatwave_doy": "The first heatwave comes earlier",
    "hottest_day": "The hottest day is getting hotter",
    "warm_nights": "Nights are too warm to sleep",
    "summer_length": "Summer lasts longer",
    "autumn_onset_doy": "Autumn arrives later",
    "first_frost_doy": "The first frost comes later",
    "wettest_day": "Downpours are getting heavier",
    "heavy_rain_days": "More days of heavy rain",
    "summer_dry_spell": "Summer dry spells are longer",
    "winter_rain": "Winters are getting wetter",
    "summer_sunshine": "Summers are getting sunnier",
    "heating_need": "We need less heating",
}

# the hunches grouped into topics, each with an icon and a colour (the colour is used on the chart)
TOPICS = {
    "Heat": dict(icon=":material/local_fire_department:", colour="#F2683A",
                 hunches=["heatwave_days", "heatwave_events", "longest_heatwave",
                          "first_heatwave_doy", "hottest_day", "warm_nights"]),
    "Seasons": dict(icon=":material/eco:", colour="#4CC38A",
                    hunches=["summer_length", "autumn_onset_doy", "first_frost_doy"]),
    "Rain": dict(icon=":material/water_drop:", colour="#4F9CF9",
                 hunches=["wettest_day", "heavy_rain_days", "summer_dry_spell", "winter_rain"]),
    "Sun & heating": dict(icon=":material/wb_sunny:", colour="#F5C542",
                          hunches=["summer_sunshine", "heating_need"]),
}

# the four verdicts: the label, one plain sentence, and one colour that's used everywhere
VERDICTS = {
    "real": dict(label="Real trend", text="The data backs this hunch.", colour="#2ECC71"),
    "leaning": dict(label="Leaning, not proven", text="The data points this way, but luck can't be ruled out yet.", colour="#F1C40F"),
    "not_backed": dict(label="Not backed up", text="The data doesn't support this hunch.", colour="#95A5A6"),
    "opposite": dict(label="The opposite", text="Surprise: the data shows the reverse is happening.", colour="#E74C3C"),
}

# the three guesses, each with an icon
GUESSES = ["Yes, that's happening", "No, it isn't", "Not sure"]
GUESS_ICONS = {GUESSES[0]: ":material/thumb_up:", GUESSES[1]: ":material/thumb_down:", GUESSES[2]: ":material/help:"}

# what to say when the guess is compared with the verdict: (guess, verdict) -> sentence
GUT_CHECK = {
    (GUESSES[0], "real"): "Your gut was right. The data backs you up.",
    (GUESSES[0], "leaning"): "Your gut might be right. The data points your way, but it isn't proven yet.",
    (GUESSES[0], "not_backed"): "Your gut and the data disagree. There's no sign of this in the numbers.",
    (GUESSES[0], "opposite"): "Your gut and the data disagree. It's actually going the other way.",
    (GUESSES[1], "real"): "Your gut and the data disagree. This one is really happening.",
    (GUESSES[1], "leaning"): "Fair to doubt it. It isn't proven, though the data does lean that way.",
    (GUESSES[1], "not_backed"): "Your gut was right. The data doesn't show it.",
    (GUESSES[1], "opposite"): "Right that it isn't happening. In fact it's going the other way.",
}

# ======================================================================== HELPER FUNCTIONS


@st.cache_data                                    # only read the files once, not on every click
def load_data():
    read = lambda name: pd.read_csv(os.path.join(RESULTS_DIR, name), encoding="utf-8")   # small shortcut for reading one file
    return read("results.csv"), read("annual.csv"), read("luck.csv")                      # hand back all three tables


def as_date(day_of_year):
    date = datetime.date(2001, 1, 1) + datetime.timedelta(days=round(day_of_year) - 1)   # day 1 = 1 jan, 2001 isn't a leap year
    return f"{date.day} {date:%b}"                                                       # e.g. "18 Nov"


def show_value(value, unit):
    if pd.isna(value):                            # blank in the data
        return "no value"
    if unit == "day of year":                     # date measures read better as a date
        return as_date(value)
    return f"{value:,.1f} {unit}"                 # everything else: number + unit, e.g. "18.7 days"


def show_change(rate, unit):
    if pd.isna(rate):                             # no trend was tested
        return "not tested"
    if round(rate, 1) == 0:                       # basically flat
        return "no change"
    if unit == "day of year":                     # for dates, say later or earlier
        return f"{abs(rate):.1f} days {'later' if rate > 0 else 'earlier'}"
    return f"{rate:+,.1f} {unit}"                 # everything else: + or - and the unit


def show_html(html, height):
    if hasattr(st, "iframe"):                     # newer streamlit has st.iframe for my own html + javascript
        st.iframe(html, height=height)
    else:                                         # older streamlit uses the components version instead
        import streamlit.components.v1 as components
        components.html(html, height=height)


def label(text):
    st.markdown(f"<div class='step'>{text}</div>", unsafe_allow_html=True)   # a small centred step label above each picker


# ======================================================================== PAGE SET-UP

st.set_page_config(page_title="Is it just me?", layout="centered")   # browser tab name, narrow centred page so it feels like an app

# my own styling on top of the theme in .streamlit/config.toml
st.markdown("""
<style>
/* centre every row of pills / buttons */
[data-testid="stButtonGroup"] { display: flex; justify-content: center; }
[data-testid="stButtonGroup"] > div { justify-content: center; flex-wrap: wrap; }
[data-testid="stElementContainer"]:has([data-testid="stButtonGroup"]) { align-self: center; }   /* centre the short rows too */
/* the little numbered step labels above each picker */
.step { text-align: center; font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase;
        opacity: 0.6; margin: 1.6rem 0 0.4rem; }
.step b { color: #F28C38; font-weight: 600; margin-right: 0.4rem; }
/* section headings further down the page */
.section { text-align: center; font-size: 1.35rem; font-weight: 600; margin: 2.4rem 0 0.2rem; }
.sub { text-align: center; opacity: 0.65; margin-bottom: 0.8rem; }
[data-testid="stCaptionContainer"] { text-align: center; }   /* small grey notes centred too */
/* pills shrink a touch when pressed, so taps feel like they registered */
[data-testid="stButtonGroup"] button { transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1); }
[data-testid="stButtonGroup"] button:active { transform: scale(0.97); }
/* keep sentences to a comfy reading width */
.sub { max-width: 65ch; margin-left: auto; margin-right: auto; }
/* report card rows */
.rc { display: flex; justify-content: space-between; align-items: center; gap: 1rem;
      padding: 0.6rem 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
.rc-change { opacity: 0.6; font-size: 0.85rem; white-space: nowrap; }
.pill { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.8rem;
        font-weight: 600; white-space: nowrap; }
</style>
""", unsafe_allow_html=True)                      # lets streamlit use my css instead of printing it as text

results, annual, luck = load_data()               # read naveen's three results files

# ======================================================================== THE TITLE

st.markdown(
    "<div style='text-align:center; font-size:3rem; font-weight:700; line-height:1.1; letter-spacing:-0.02em; margin-top:1rem;'>Is it just me?</div>"
    "<div style='text-align:center; font-size:1.15rem; margin-top:0.6rem; opacity:0.85;'>"
    "Check your weather hunches against 45 years of NASA data.</div>"
    "<div style='text-align:center; font-size:0.85rem; margin-top:0.4rem; opacity:0.5;'>A project by Mostly Significant</div>",
    unsafe_allow_html=True,                       # plain styled text, so streamlit doesn't add a link icon to it
)

# ======================================================================== 01 WHERE?

label("<b>01</b> Where?")                          # step label
region = st.segmented_control(
    "Region", ["UK", "World"],                    # uk towns or world cities
    format_func=lambda r: (":material/home_pin: " if r == "UK" else ":material/public: ") + r,   # icon in front of each
    default="UK", label_visibility="collapsed",   # start on the uk, hide the label because i drew my own
)
if region is None:                                # they clicked the selected one again, which unselects it
    region = "UK"                                 # so just fall back to the uk

places = results.loc[results["region"] == region, "place"].unique().tolist()   # every place in that region
place = st.pills("Place", places, default=places[0], key=f"place_{region}",    # the places as tiles, first one picked to start
                 label_visibility="collapsed")
if place is None:                                 # nothing picked
    st.stop()                                     # wait until they pick one

place_rows = results[results["place"] == place].set_index("measure_id")   # just this place's rows, looked up by hunch id

# ======================================================================== 02 YOUR HUNCH

label("<b>02</b> What's your hunch?")             # step label
topics = [t for t, info in TOPICS.items() if any(m in place_rows.index for m in info["hunches"])]   # only topics this place has
topic = st.segmented_control(
    "Topic", topics,                              # heat, seasons, rain, sun & heating
    format_func=lambda t: f"{TOPICS[t]['icon']} {t}",   # icon in front of each topic
    default=topics[0], key=f"topic_{region}", label_visibility="collapsed",
)
if topic is None:                                 # unselected
    topic = topics[0]                             # fall back to the first topic

hunch_ids = [m for m in TOPICS[topic]["hunches"] if m in place_rows.index]   # the hunches in that topic this place has
measure_id = st.pills("Hunch", hunch_ids, format_func=HUNCHES.get,           # hunches as tiles, shown in words
                      default=hunch_ids[0], key=f"hunch_{region}_{topic}", label_visibility="collapsed")
if region == "World":                             # world cities only have heat
    st.caption("World cities are checked on heat only. Seasons, rain and heating are built around UK seasons.")
if measure_id is None:                            # nothing picked
    st.stop()                                     # wait

row = place_rows.loc[measure_id]                  # the one results row for this place + hunch
hunch = HUNCHES[measure_id]                       # the hunch in words
unit = row["unit"]                                # its unit, e.g. days
colour = TOPICS[topic]["colour"]                  # the topic colour, used on the chart

# ======================================================================== 03 YOUR GUT

label(f"<b>03</b> {place}: is “{hunch.lower()}” true?")   # the question, with the place and hunch in it
guess = st.pills("Guess", GUESSES, format_func=lambda g: f"{GUESS_ICONS[g]} {g}",   # the three guesses as tiles with icons
                 key=f"guess_{place}_{measure_id}", label_visibility="collapsed")   # a fresh guess for every place + hunch
if guess is None:                                 # no guess yet
    st.markdown("<div class='sub'>Make a guess to see what the data says.</div>", unsafe_allow_html=True)
    st.stop()                                     # nothing below runs until they guess

# ======================================================================== THE RESULT CARD

verdict = VERDICTS[row["verdict"]]               # label, sentence and colour for this verdict
gut = GUT_CHECK.get((guess, row["verdict"]), "Fair enough. That's exactly why it's worth checking.")   # did their gut match?
first, last = int(row["start_year"]), int(row["end_year"])                     # e.g. 1981 and 2025
luck_rows = luck[(luck["place"] == place) & (luck["measure_id"] == measure_id)]   # the shuffle test for this hunch
matched = None if luck_rows.empty else round(luck_rows.iloc[0]["share_as_strong"] * 1000)   # how many of 1,000 shuffles matched

# everything the card needs, handed to the javascript as one bundle
card = dict(
    colour=verdict["colour"], label=verdict["label"], text=verdict["text"], gut=gut,
    early=None if pd.isna(row["early_mean"]) else float(row["early_mean"]),   # 1980s average
    late=None if pd.isna(row["late_mean"]) else float(row["late_mean"]),      # recent average
    is_date=(unit == "day of year"),             # dates count up differently
    unit="" if unit == "day of year" else unit,  # no unit after a date
    early_label=f"{first}–{first + 9}", late_label=f"{last - 9}–{last}",      # e.g. 1981–1990 and 2016–2025
    change=show_change(row["rate_per_decade"], unit),                         # e.g. "+2.8 days"
    luck="" if matched is None else f"{matched:,} in 1,000",                  # e.g. "1 in 1,000"
    what=row["plain_definition"],                # one-line definition of the measure
)

# the card itself: my own html + css + a tiny bit of javascript so the numbers count up
show_html(f"""
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  body {{ margin: 0; font-family: Inter, sans-serif; color: #E6E9EF; background: transparent; }}
  .card {{ background: #18213A; border-radius: 18px; padding: 26px 24px 22px; text-align: center;
          border-top: 4px solid var(--c); animation: up 350ms cubic-bezier(0.23, 1, 0.32, 1) both; }}
  @keyframes up {{ from {{ opacity: 0; transform: translateY(8px); }} to {{ opacity: 1; transform: none; }} }}
  @keyframes fade {{ from {{ opacity: 0; }} to {{ opacity: 1; }} }}
  @media (prefers-reduced-motion: reduce) {{ .card {{ animation-name: fade; }} }}   /* no sliding for people who turn motion off */
  .early, .late {{ font-variant-numeric: tabular-nums; }}                           /* digits stay the same width so counting doesn't wobble */
  .what {{ max-width: 65ch; margin-left: auto; margin-right: auto; }}
  .badge {{ display: inline-block; padding: 5px 14px; border-radius: 999px; font-weight: 600; font-size: 14px;
           color: #0E1525; background: var(--c); }}
  .text {{ margin-top: 10px; font-size: 16px; opacity: .9; }}
  .gut {{ margin-top: 4px; font-size: 14px; opacity: .6; }}
  .nums {{ display: flex; justify-content: center; align-items: flex-end; gap: 22px; margin-top: 22px; }}
  .lbl {{ font-size: 12px; letter-spacing: .06em; text-transform: uppercase; opacity: .55; }}
  .early {{ font-size: 34px; font-weight: 600; opacity: .55; }}
  .late {{ font-size: 52px; font-weight: 700; color: var(--c); line-height: 1.05; }}
  .arrow {{ font-size: 26px; opacity: .4; padding-bottom: 10px; }}
  .what {{ margin-top: 10px; font-size: 13px; opacity: .55; }}
  .row {{ display: flex; justify-content: center; gap: 28px; margin-top: 18px; font-size: 13px; }}
  .row b {{ display: block; font-size: 17px; margin-top: 2px; }}
  .row span {{ opacity: .55; }}
</style>
<div class="card" id="card">
  <span class="badge" id="badge"></span>
  <div class="text" id="text"></div>
  <div class="gut" id="gut"></div>
  <div class="nums">
    <div><div class="lbl" id="el"></div><div class="early" id="early">–</div></div>
    <div class="arrow">→</div>
    <div><div class="lbl" id="ll"></div><div class="late" id="late">–</div></div>
  </div>
  <div class="what" id="what"></div>
  <div class="row">
    <div><span>Change per decade</span><b id="change"></b></div>
    <div id="luckbox"><span>Could it be luck?</span><b id="luck"></b></div>
  </div>
</div>
<script>
  const d = {json.dumps(card)};                                  // the numbers from python
  const $ = id => document.getElementById(id);                   // shortcut for grabbing an element
  $("card").style.setProperty("--c", d.colour);                  // the verdict colour, used for the top line, badge and big number
  $("badge").textContent = d.label;                              // e.g. Real trend
  $("text").textContent = d.text;                                // e.g. The data backs this hunch.
  $("gut").textContent = d.gut;                                  // e.g. Your gut was right.
  $("el").textContent = d.early_label;  $("ll").textContent = d.late_label;   // the two time periods
  $("what").textContent = d.what;                                // what's being measured
  $("change").textContent = d.change;                            // change per decade
  if (d.luck) {{ $("luck").textContent = d.luck; }} else {{ $("luckbox").style.display = "none"; }}   // hide luck if there's none
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmt(v) {{                                             // how a number is written on screen
    if (d.is_date) {{ const t = new Date(2001, 0, 1); t.setDate(Math.round(v)); return t.getDate() + " " + months[t.getMonth()]; }}
    return v.toFixed(1) + (d.unit ? " " + d.unit : "");           // 1 decimal + unit
  }}
  function count(el, target) {{                                  // counts a number up from a start value to the target
    if (target === null) {{ el.textContent = "no value"; return; }}
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {{ el.textContent = fmt(target); return; }}   // motion turned off: just show it
    const start = d.is_date ? target - 30 : 0;                   // dates start a month earlier, everything else starts at 0
    const t0 = performance.now(), ms = 800;                      // takes 0.8 seconds, long enough to notice, short enough not to wait
    function step(now) {{
      const p = Math.min((now - t0) / ms, 1);                    // how far through we are, 0 to 1
      const eased = 1 - Math.pow(1 - p, 3);                      // slows down at the end so it feels smooth
      el.textContent = fmt(start + (target - start) * eased);
      if (p < 1) requestAnimationFrame(step);                    // keep going until done
    }}
    requestAnimationFrame(step);
  }}
  count($("early"), d.early);                                    // count the 1980s number up
  setTimeout(() => count($("late"), d.late), 150);               // then the recent one, a beat later
</script>
""", 340)                                         # 340 = how tall the card's box is

# ======================================================================== THE CHART

st.markdown("<div class='section'>Every year since 1981</div>", unsafe_allow_html=True)   # heading above the chart
st.markdown(f"<div class='sub'>{row['measure_name']} in {place}</div>", unsafe_allow_html=True)   # what's on the chart

yearly = annual[(annual["place"] == place) & (annual["measure_id"] == measure_id)].sort_values("year")   # the yearly values
has_value = yearly.dropna(subset=["value"])      # years that actually have a value

fig = go.Figure()                                 # empty chart
fig.add_trace(go.Scatter(                         # every year as a dot, joined by a thin line
    x=yearly["year"], y=yearly["value"], mode="lines+markers", name="Each year",
    line=dict(color=colour, width=1.5), marker=dict(size=6, color=colour), opacity=0.55,
))
if pd.notna(row["rate_per_decade"]) and len(has_value):   # only draw a trend if there is one
    trend = has_value["value"].median() + row["rate_per_decade"] / 10 * (has_value["year"] - has_value["year"].median())   # sen's slope line through the middle point
    fig.add_trace(go.Scatter(x=has_value["year"], y=trend, mode="lines", name="Trend",
                             line=dict(color=colour, width=4)))   # thick line, same topic colour
for mean, x0, x1 in [(row["early_mean"], first, first + 9), (row["late_mean"], last - 9, last)]:   # the two decade averages
    if pd.notna(mean):
        fig.add_shape(type="line", x0=x0, x1=x1, y0=mean, y1=mean,           # a dashed flat line over that decade
                      line=dict(color="#E6E9EF", width=2, dash="dash"))
y_title = "date (day of year)" if unit == "day of year" else unit            # what the side axis measures
fig.update_layout(
    height=460, margin=dict(l=10, r=10, t=10, b=10),                         # bigger chart, less empty space
    paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",             # see-through so the page colour shows
    font=dict(family="Inter, sans-serif", color="#E6E9EF"),                  # same font as the rest of the app
    xaxis=dict(showgrid=False), yaxis=dict(title=y_title, gridcolor="rgba(255,255,255,0.07)"),
    legend=dict(orientation="h", y=-0.12, x=0.5, xanchor="center"),         # legend underneath, centred
    hovermode="x unified",                                                   # hover shows both lines for that year
)
st.plotly_chart(fig, width="stretch", config={"displayModeBar": False})     # draw it, hide plotly's toolbar
st.caption("Dashed lines show the average of the first and last ten years.")

missing = len(yearly) - len(has_value)            # years with no value
if missing:                                       # only mention it if it happens
    st.caption(f"{missing} of {len(yearly)} years have no value because it didn't happen that year. They're left out of the trend.")

# ======================================================================== COULD IT BE LUCK?

if matched is not None:                           # only if there's a shuffle test for this hunch
    with st.expander(f"Could it be luck? {matched:,} in 1,000"):            # small, closed by default
        st.write("We shuffled the years into a random order 1,000 times. Each lit dot is a shuffle "
                 "that showed a trend as strong as the real one. Fewer dots means luck is a worse explanation.")
        dots = "".join(                                                       # 1,000 tiny dots, the first few lit up
            f"<span style='display:inline-block;width:7px;height:7px;margin:1px;border-radius:50%;"
            f"background:{colour if i < matched else 'rgba(255,255,255,0.12)'}'></span>"
            for i in range(1000))
        st.markdown(f"<div style='line-height:0;text-align:center'>{dots}</div>", unsafe_allow_html=True)

# ======================================================================== THE MAP

map_rows = results[results["measure_id"] == measure_id]                    # every place that has this hunch
if region == "UK":                                                          # uk town picked, so show the uk only
    map_rows = map_rows[map_rows["region"] == "UK"]
map_rows = map_rows.assign(                                                 # add friendly columns for the hover box
    Verdict=map_rows["verdict"].map(lambda v: VERDICTS[v]["label"]),
    Change=[show_change(r, unit) for r in map_rows["rate_per_decade"]],
)
counts = map_rows["Verdict"].value_counts()                                 # how many places got each verdict
summary = ", ".join(f"{counts[v['label']]} {v['label'].lower()}" for v in VERDICTS.values() if v["label"] in counts)

st.markdown("<div class='section'>Same hunch, everywhere else</div>", unsafe_allow_html=True)
st.markdown(f"<div class='sub'>Across {len(map_rows)} places: {summary}.</div>", unsafe_allow_html=True)

fig_map = px.scatter_map(
    map_rows, lat="lat", lon="lon", color="Verdict",
    color_discrete_map={v["label"]: v["colour"] for v in VERDICTS.values()},       # same verdict colours as the card
    category_orders={"Verdict": [v["label"] for v in VERDICTS.values()]},          # legend always in the same order
    hover_name="place", hover_data={"Change": True, "Verdict": True, "lat": False, "lon": False},
    zoom=4.4 if region == "UK" else 0.6,                                           # zoomed on the uk or the whole world
    center={"lat": 54.5, "lon": -3.0} if region == "UK" else {"lat": 20, "lon": 10},
    map_style="carto-darkmatter", height=480,
)
fig_map.update_traces(marker=dict(size=16))                                        # big enough to tap on a phone
fig_map.update_layout(
    margin=dict(l=0, r=0, t=0, b=0), paper_bgcolor="rgba(0,0,0,0)",
    font=dict(family="Inter, sans-serif", color="#E6E9EF"),
    legend=dict(orientation="h", y=-0.02, x=0.5, xanchor="center", yanchor="top", title=None),   # legend underneath
)
st.plotly_chart(fig_map, width="stretch", config={"displayModeBar": False})

# ======================================================================== REPORT CARD

st.markdown(f"<div class='section'>{place} report card</div>", unsafe_allow_html=True)
st.markdown("<div class='sub'>Every hunch we checked for this place.</div>", unsafe_allow_html=True)

rows_html = ""                                                              # build the rows one by one
for t, info in TOPICS.items():                                              # go topic by topic so it stays grouped
    for m in info["hunches"]:
        if m not in place_rows.index:                                       # skip hunches this place doesn't have
            continue
        r = place_rows.loc[m]
        v = VERDICTS[r["verdict"]]
        rows_html += (f"<div class='rc'><div>{HUNCHES[m]}</div><div>"
                      f"<span class='rc-change'>{show_change(r['rate_per_decade'], r['unit'])}</span>&nbsp;&nbsp;"
                      f"<span class='pill' style='background:{v['colour']};color:#0E1525'>{v['label']}</span></div></div>")
st.markdown(rows_html, unsafe_allow_html=True)                              # no fade-in here, it's just a list

# ======================================================================== HOW IT WORKS (short, for anyone curious)

st.markdown("<div class='section'>How this works</div>", unsafe_allow_html=True)
c1, c2, c3 = st.columns(3)                                                  # three short blocks instead of a wall of text
c1.markdown("**The data**  \nNASA POWER (MERRA-2) daily weather, 1981 to 2025, about a 50 km square around each place.")
c2.markdown("**The test**  \nEach hunch becomes one number per year. The Mann-Kendall test checks if it's really trending.")
c3.markdown("**The verdict**  \nUnder a 5% chance of luck and the right direction = real trend.")

with st.expander("What it can't tell you"):
    st.markdown(
        "- Values are averages over a 50 km square, so peaks read low. The trends are still valid.\n"
        "- \"Unusually hot\" is relative to each place, so the bar differs between towns.\n"
        "- A year with no heatwave or frost has no date, so it's left out.\n"
        "- Belfast, Aberdeen and Toronto use a nearby inland square, because theirs is mostly sea or lake.\n"
        "- Rain jumps around a lot year to year, so most rain hunches are only \"leaning\".\n"
        "- The data shows *that* something changed, not *why*."
    )

st.markdown("<div class='sub' style='margin-top:2rem;font-size:0.8rem'>Data: NASA POWER (MERRA-2) · "
            "Is it just me? by Mostly Significant · NASA Space Apps Challenge 2026</div>", unsafe_allow_html=True)

