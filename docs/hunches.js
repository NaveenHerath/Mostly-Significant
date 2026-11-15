// all the plain english wording lives here, so we can tweak words without touching app.js

// the four topic tabs, in the order they show up
const TOPICS = [
  { id: "heat", label: "Heat", icon: "thermometer" }, // heatwaves, hot days, warm nights
  { id: "seasons", label: "Seasons", icon: "leaf" }, // when summer, autumn and frost turn up
  { id: "rain", label: "Rain", icon: "cloud-rain" }, // downpours, wet days, dry spells
  { id: "sun", label: "Sun and heating", icon: "sun" }, // sunshine and how much heating we need
];

// each measure as an everyday hunch, its colour (see tokens.css), the same hunch as a question that follows "Is it just me, or ...",
// plus a short noun for the then-vs-now numbers
const HUNCHES = {
  heatwave_days: { topic: "heat", accent: "heat", text: "We get more heatwave days", question: "do we get more heatwave days", noun: "heatwave days a year" }, // london test case, label matches the number
  heatwave_events: { topic: "heat", accent: "heat", text: "We get more heatwaves", question: "do we get more heatwaves", noun: "heatwaves a year" }, // count of heatwaves
  longest_heatwave: { topic: "heat", accent: "heat", text: "Heatwaves last longer", question: "do heatwaves drag on longer", noun: "days, longest heatwave" }, // longest run
  hottest_day: { topic: "heat", accent: "heat", text: "The hottest days are hotter", question: "are the hottest days getting hotter", noun: "hottest day of the year" }, // peak temp
  warm_nights: { topic: "heat", accent: "heat", text: "Nights are too warm to sleep", question: "are nights too warm to sleep", noun: "warm nights a year" }, // muggy nights
  first_heatwave_doy: { topic: "seasons", accent: "summer", text: "Heat arrives earlier in the year", question: "does the heat turn up earlier in the year", noun: "first heatwave, on average" }, // a date
  summer_length: { topic: "seasons", accent: "summer", text: "Summers last longer", question: "do summers last longer", noun: "days of summer" }, // length of summer
  autumn_onset_doy: { topic: "seasons", accent: "autumn", text: "Autumn turns up later", question: "does autumn turn up later", noun: "autumn starts, on average" }, // a date
  first_frost_doy: { topic: "seasons", accent: "winter", text: "Frosts come later than they used to", question: "do frosts come later than they used to", noun: "first frost, on average" }, // a date
  wettest_day: { topic: "rain", accent: "rain", text: "Downpours are heavier", question: "are downpours heavier", noun: "mm on the wettest day" }, // biggest single day
  heavy_rain_days: { topic: "rain", accent: "rain", text: "It rains harder more often", question: "does it chuck it down more often", noun: "heavy rain days a year" }, // count of days
  summer_dry_spell: { topic: "rain", accent: "rain", text: "Summer dry spells are longer", question: "do summer dry spells go on longer", noun: "days, longest dry spell" }, // plymouth test case
  winter_rain: { topic: "rain", accent: "rain", text: "Winters are wetter", question: "are winters wetter", noun: "mm of winter rain" }, // winter total
  summer_sunshine: { topic: "sun", accent: "sun", text: "Summers are sunnier", question: "are summers sunnier", noun: "MJ/m² of sun a day" }, // solar energy
  heating_need: { topic: "sun", accent: "sun", text: "We need less heating", question: "do we need less heating", noun: "heating degree days" }, // milder winters
};

// the examples the hero line rotates through, the best ones first (world cities only get the heat ones)
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
  Paris: "fr", Berlin: "de", Madrid: "es", // europe
  Cairo: "eg", Johannesburg: "za", // africa
  Delhi: "in", Tokyo: "jp", Sydney: "au", // asia and australia
};

// extra notes for places that need one
const PLACE_NOTES = {
  Delhi: "Delhi hasn’t been checked against weather station records yet, so take it with a pinch of salt.", // per naveen
};
