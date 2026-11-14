import os                      # lets me check if a file exists
import pandas as pd            # for reading the csv files
import streamlit as st         # turns this script into a webpage

st.set_page_config(page_title="Mostly Significant", layout="wide")   # tab name + use the full screen width
st.title("Mostly Significant")                                        # big heading at the top
st.write("UK climate hunches, fact-checked with NASA data!")          # the one-line intro

# use naveen's real results if they're there, otherwise use my fake ones
if os.path.exists("data/results/results.csv"):      # has naveen pushed his real file yet?
    folder = "data/results"                          # yes, so read from his folder
    using_fake = False                               # and remember it's the real thing
else:
    folder = "data/fake_results"                     # no, so fall back to my fake data
    using_fake = True                                # and remember it's fake so i can warn people

@st.cache_data                                       # only read the files once, not on every click
def load_data(folder):
    results = pd.read_csv(f"{folder}/results.csv")   # one summary row per place per measure
    annual = pd.read_csv(f"{folder}/annual.csv")     # one row per year, this is for the chart later
    return results, annual                           # hand both tables back

results, annual = load_data(folder)                  # actually load them

if using_fake:                                       # only show this while it's fake data
    st.warning("Heads up: this is fake data for building the app, not real NASA numbers yet.")

# the pickers on the left
with st.sidebar:                                     # everything indented here goes in the left panel
    st.header("Pick a hunch")                        # little heading for the panel
    place = st.selectbox("Where?", sorted(results["place"].unique()))     # dropdown of every place, a to z
    place_rows = results[results["place"] == place]                       # only the rows for that place
    measure = st.selectbox("What do you want to check?", place_rows["measure_name"])   # dropdown of its measures

row = place_rows[place_rows["measure_name"] == measure].iloc[0]   # grab the one row for the place + measure picked

# what each verdict word means in plain english, and which coloured box to show it in
verdicts = {
    "real":       ("Real trend: the data backs this up", st.success),        # green box
    "leaning":    ("Leaning that way, but not proven yet", st.warning),      # yellow box
    "not_backed": ("Not backed up by the data", st.info),                    # blue box
    "opposite":   ("Actually the opposite is happening", st.error),          # red box
}
text, show_box = verdicts[row["verdict"]]            # look up the text and the box for this verdict
show_box(f"**{measure} in {place}:** {text}")        # draw the coloured verdict box

# the key numbers in a row of three
col1, col2, col3 = st.columns(3)                     # split the page into 3 side-by-side columns
col1.metric("Change per decade", f"{row['rate_per_decade']:+.1f} {row['unit']}")   # + or - sign, 1 decimal
col2.metric("p-value", f"{row['p_value']:.3f}")                                     # 3 decimals
col3.metric(f"{row['start_year']} vs recent", f"{row['early_mean']} → {row['late_mean']} {row['unit']}")   # first 10 yrs vs last 10

st.caption(row["plain_definition"])                  # small grey text explaining the measure




############

# CHARTS using plotly


import plotly.graph_objects as go                    # plotly is the charting library, go = its building blocks

# one sentence that explains the p-value like a human would
p = row["p_value"]                                   # grab the p-value for this place + measure
st.write(f"**What the p-value means:** if there was no real trend, there'd only be about a "
         f"{p*100:.1f}% chance of seeing a pattern this strong just by luck.")   # e.g. 0.003 becomes 0.3%

# the yearly data for the chart
yearly = annual[(annual["place"] == place) & (annual["measure_id"] == row["measure_id"])]   # just this place + measure
yearly = yearly.sort_values("year")                  # make sure the years go left to right in order

# work out where to draw the trend line, using naveen's sen's slope
slope_per_year = row["rate_per_decade"] / 10         # his number is per decade, i need it per year
mid_year = yearly["year"].median()                   # the line goes through the middle year...
mid_value = yearly["value"].median()                 # ...and the middle value, that's the standard way for sen's slope
trend = mid_value + slope_per_year * (yearly["year"] - mid_year)   # the height of the line in every year

fig = go.Figure()                                    # start an empty chart
fig.add_trace(go.Scatter(x=yearly["year"], y=yearly["value"],     # the real yearly values
                         mode="lines+markers", name="Each year")) # dots joined with a line
fig.add_trace(go.Scatter(x=yearly["year"], y=trend,               # the trend line on top
                         mode="lines", name="Trend",
                         line=dict(width=4)))                     # make it thicker so it stands out
fig.update_layout(height=420,                                     # how tall the chart is
                  yaxis_title=f"{measure} ({row['unit']})",       # label the side so people know what they're looking at
                  xaxis_title="Year",                             # label the bottom
                  hovermode="x unified")                          # hovering shows both lines for that year
st.plotly_chart(fig, width="stretch")                             # draw it, full width

