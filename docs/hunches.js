// all the plain english wording lives here, so we can tweak words without touching app.js

// the four topic tabs, in the order they show up
const TOPICS = [
  { id: "heat", label: "Heat", icon: "thermometer" }, // heatwaves, hot days, warm nights
  { id: "seasons", label: "Seasons", icon: "leaf" }, // when summer, autumn and frost turn up
  { id: "rain", label: "Rain and wind", icon: "cloud-rain" }, // downpours, wet days, dry spells, wind, dry ground
  { id: "sun", label: "Sun and energy", icon: "sun" }, // sunshine, and how much heating (uk) or cooling (world) we need
];

// each measure as an everyday hunch, its colour (see tokens.css), the same hunch as a question that follows "Is it just me, or ...",
// plus a short noun for the then-vs-now numbers, and presets: extra everyday pill sentences for the same hunch
const HUNCHES = {
  heatwave_days: { topic: "heat", accent: "heat", text: "We get more heatwave days", question: "do we get more heatwave days", noun: "heatwave days a year", presets: ["There are more scorching days", "Summers feel hotter than when I was a kid"] }, // london test case, label matches the number
  heatwave_events: { topic: "heat", accent: "heat", text: "We get more heatwaves", question: "do we get more heatwaves", noun: "heatwaves a year", presets: ["Heatwaves keep coming back", "We get a heatwave every summer now"] }, // count of heatwaves
  longest_heatwave: { topic: "heat", accent: "heat", text: "Heatwaves last longer", question: "do heatwaves drag on longer", noun: "days, longest heatwave", presets: ["Hot spells go on for weeks", "The heat doesn’t let up for days"] }, // longest run
  hottest_day: { topic: "heat", accent: "heat", text: "The hottest days are hotter", question: "are the hottest days getting hotter", noun: "hottest day of the year", presets: ["The peak of summer is hotter", "The hottest day is hotter than ever"] }, // peak temp
  warm_nights: { topic: "heat", accent: "heat", text: "Nights are too warm to sleep", question: "are nights too warm to sleep", noun: "warm nights a year", presets: ["I can’t sleep in summer", "Bedrooms stay hot all night"] }, // nights that stay warm
  muggy_nights: { topic: "heat", accent: "heat", text: "Summer nights feel muggier", question: "are summer nights muggier", noun: "muggy nights a summer", presets: ["The air is sticky at night", "Summer nights feel close and humid"] }, // uk only, dew point 16 C or more
  first_heatwave_doy: { topic: "seasons", accent: "summer", text: "Heat arrives earlier in the year", question: "does the heat turn up earlier in the year", noun: "first heatwave, on average", presets: ["It gets hot by May now", "Summer heat comes sooner"] }, // a date
  summer_length: { topic: "seasons", accent: "summer", text: "Summers last longer", question: "do summers last longer", noun: "days of summer", presets: ["T-shirt weather lasts longer", "Summer starts sooner and ends later"] }, // length of summer
  autumn_onset_doy: { topic: "seasons", accent: "autumn", text: "Autumn turns up later", question: "does autumn turn up later", noun: "autumn starts, on average", presets: ["It’s still warm in September", "Autumn feels later every year"] }, // a date
  first_frost_doy: { topic: "seasons", accent: "winter", text: "Frosts come later than they used to", question: "do frosts come later than they used to", noun: "first frost, on average", presets: ["I rarely scrape ice off my car", "The garden freezes later in the year"] }, // a date
  wettest_day: { topic: "rain", accent: "rain", text: "Downpours are heavier", question: "are downpours heavier", noun: "mm on the wettest day", presets: ["When it rains, it pours", "Downpours are more extreme"] }, // biggest single day
  heavy_rain_days: { topic: "rain", accent: "rain", text: "It rains harder more often", question: "does it chuck it down more often", noun: "heavy rain days a year", presets: ["It chucks it down more often", "We get more days of heavy rain"] }, // count of days
  summer_dry_spell: { topic: "rain", accent: "rain", text: "Summer dry spells are longer", question: "do summer dry spells go on longer", noun: "days, longest dry spell", presets: ["It goes weeks without rain in summer", "There are more hosepipe bans"] }, // plymouth test case
  winter_rain: { topic: "rain", accent: "rain", text: "Winters are wetter", question: "are winters wetter", noun: "mm of winter rain", presets: ["It rains all winter", "Winters are soggier"] }, // winter total
  windy_days: { topic: "rain", accent: "rain", text: "It’s windier than it used to be", question: "is it windier than it used to be", noun: "windy days a year", presets: ["There are more gales", "The wind is stronger"] }, // uk and world, days in the windiest 5%
  dry_soil_days: { topic: "rain", accent: "rain", text: "The ground dries out more in summer", question: "does the ground dry out more in summer", noun: "dry soil days a summer", presets: ["The garden is bone dry by August", "The ground cracks in summer"] }, // uk only, rate is 0 everywhere so show then vs now
  summer_sunshine: { topic: "sun", accent: "sun", text: "Summers are sunnier", question: "are summers sunnier", noun: "MJ/m² of sun a day", presets: ["Summers are brighter", "We get more sunny summer days"] }, // solar energy
  heating_need: { topic: "sun", accent: "sun", text: "We need less heating", question: "do we need less heating", noun: "heating degree days", presets: ["Winters are milder", "I put the heating on less"] }, // milder winters
  yearly_sunshine: { topic: "sun", accent: "sun", text: "It’s sunnier than it used to be", question: "is it sunnier than it used to be", noun: "MJ/m² of sun a day", presets: ["There are more sunny days", "The sun feels stronger"] }, // world cities only, whole year
  cooling_need: { topic: "sun", accent: "sun", text: "We need more air con", question: "do we need the air con more", noun: "cooling degree days", presets: ["The air con never goes off", "It’s too hot without a fan"] }, // world cities only, hotter days to cool
};

// the examples the hero line rotates through, the best ones first (world cities only get the ones they have data for)
const EXAMPLES = ["warm_nights", "summer_length", "wettest_day", "heating_need", "first_frost_doy", "hottest_day", "heatwave_days"];

// what each verdict says, straight from CLAUDE.md and naveen’s notes
const VERDICTS = {
  real: { label: "Yes, it’s real", line: "The data backs your hunch." }, // green
  leaning: { label: "Leaning that way", line: "It points that way, but we can’t rule out luck yet." }, // amber
  not_backed: { label: "Not backed by the data", line: "The data doesn’t support this hunch." }, // grey
  opposite: { label: "It’s actually the opposite", line: "Surprise: the data shows the reverse." }, // red
};

// the three guess buttons
const GUESSES = [
  { id: "yes", label: "I think it’s true" }, // user thinks the hunch holds
  { id: "no", label: "I don’t think so" }, // user thinks it doesn’t
  { id: "unsure", label: "No idea" }, // no guess, just show me
];

// how the gut check reads, for each guess and verdict
const GUT = {
  yes: { real: "Your gut was right.", leaning: "Your gut was sort of right.", not_backed: "Your gut was off this time.", opposite: "Your gut was off this time." }, // said true
  no: { real: "Your gut was off this time.", leaning: "Your gut was sort of off.", not_backed: "Your gut was right.", opposite: "Your gut was right." }, // said not true
  unsure: { real: "No guess, fair enough.", leaning: "No guess, fair enough.", not_backed: "No guess, fair enough.", opposite: "No guess, fair enough." }, // no guess
};

// country flag codes for the world city pills (flag-icons uses the two-letter iso codes), uk towns get none
const PLACE_FLAGS = {
  "New York": "us", "Los Angeles": "us", Toronto: "ca", "Sao Paulo": "br", // the americas
  Orlando: "us", "Mexico City": "mx", "Rio de Janeiro": "br", // more of the americas
  Paris: "fr", Berlin: "de", Madrid: "es", // europe
  Barcelona: "es", Rome: "it", Lisbon: "pt", Athens: "gr", Amsterdam: "nl", Istanbul: "tr", // more of europe
  Cairo: "eg", Johannesburg: "za", Marrakech: "ma", "Cape Town": "za", // africa
  Delhi: "in", Tokyo: "jp", Sydney: "au", // asia and australia
  Dubai: "ae", Bangkok: "th", Singapore: "sg", // more of asia
};

// extra notes for places that need one
const PLACE_NOTES = {
  Delhi: "Delhi hasn’t been checked against weather station records yet, so take it with a pinch of salt.", // per naveen
};
