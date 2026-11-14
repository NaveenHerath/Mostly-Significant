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




########### guessing game before result

# guess first, then reveal
st.subheader(f"Is '{measure.lower()}' going up in {place}?")      # ask the hunch as a question
guess = st.radio(
    "Before you look at the data, what does your gut say?",      # the question above the options
    ["Yes, it's going up", "No, it's not", "Not sure"],         # the three answers
    index=None,                                                  # nothing picked to start with
    horizontal=True,                                             # options side by side instead of stacked
    key=f"guess_{place}_{measure}",                              # a fresh guess for every place + measure
)

if guess is None:                                                # they haven't guessed yet
    st.info("Make a guess to see what the data says.")           # nudge them
    st.stop()                                                    # stop here, nothing below runs until they guess


#############




# what each verdict word means in plain english, and which coloured box to show it in
verdicts = {
    "real":       ("Real trend: the data backs this up", st.success),        # green box
    "leaning":    ("Leaning that way, but not proven yet", st.warning),      # yellow box
    "not_backed": ("Not backed up by the data", st.info),                    # blue box
    "opposite":   ("Actually the opposite is happening", st.error),          # red box
}
text, show_box = verdicts[row["verdict"]]            # look up the text and the box for this verdict
show_box(f"**{measure} in {place}:** {text}")        # draw the coloured verdict box



######## guessing game result : 

# did their gut match the data?
if guess == "Yes, it's going up" and row["verdict"] == "real":           # they said yes, data says yes
    st.write("Your gut was right, the data backs you up!")
elif guess == "No, it's not" and row["verdict"] in ["not_backed", "opposite"]:   # they said no, data agrees
    st.write("Your gut was right, the data doesn't show a rise!")
elif guess == "Not sure":                                                # they didn't commit
    st.write("Fair enough, that's exactly why we check the data!")
else:                                                                    # gut and data disagree, or it's not proven yet
    st.write("Your gut and the data don't quite agree. That's why it's worth checking!")








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



#############

# maps

import plotly.express as px                          # plotly's shortcut version, builds a whole map in one go

st.subheader("Same hunch, every town")                # heading above the map

map_df = results[results["measure_id"] == row["measure_id"]].copy()   # every town's row for the measure picked

nice_names = {                                       # turn the code words into proper labels for the legend
    "real": "Real trend",
    "leaning": "Leaning, not proven",
    "not_backed": "Not backed up",
    "opposite": "The opposite",
}
map_df["Verdict"] = map_df["verdict"].map(nice_names)   # make a new column with the nice label for each town

colours = {                                          # same colour = same meaning, every time
    "Real trend": "#2ecc71",                         # green
    "Leaning, not proven": "#f1c40f",                # amber
    "Not backed up": "#95a5a6",                      # grey
    "The opposite": "#e74c3c",                       # red
}

fig_map = px.scatter_map(
    map_df,                                          # the table to plot
    lat="lat", lon="lon",                            # which columns say where each dot goes
    color="Verdict",                                 # colour the dots by verdict
    color_discrete_map=colours,                      # using my fixed colours above
    hover_name="place",                              # town name pops up when you hover
    hover_data={"rate_per_decade": True,             # also show the change per decade on hover
                "lat": False, "lon": False},         # but hide the coordinates, nobody needs those
    labels={"rate_per_decade": "Change per decade"}, # show a proper name instead of the column name
    zoom=4.3,                                        # zoomed in enough to see the whole uk
    center={"lat": 54.5, "lon": -3.0},               # roughly the middle of the uk
    map_style="carto-darkmatter",                    # dark map so it matches the app
    height=550,                                      # how tall the map is
)
fig_map.update_traces(marker=dict(size=18))          # make the dots big enough to see
st.plotly_chart(fig_map, width="stretch")            # draw it, full width