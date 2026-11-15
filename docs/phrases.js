// the example sentences the on-device matcher compares a typed question against
// a typed question is matched to whichever sentence here is closest in meaning, and takes that sentence's measure

// everyday ways of saying each of the 17 hunches (the site's own wording plus naveen's phrase list)
const MATCH_PHRASES = {
  heatwave_days: ["we get more heatwave days", "summers are getting hotter", "more scorching days", "there are more really hot days"],
  heatwave_events: ["we get more heatwaves", "heatwaves are more frequent", "heatwaves happen more often"],
  longest_heatwave: ["heatwaves last longer", "heatwaves drag on for longer", "hot spells go on for more days"],
  hottest_day: ["the hottest days are hotter", "records keep being broken", "the peak temperature is higher", "the hottest day of the year is more extreme"],
  warm_nights: ["nights are too warm to sleep", "muggy nights", "it doesn't cool down at night anymore"],
  first_heatwave_doy: ["heat arrives earlier in the year", "the first heatwave comes earlier", "the first hot spell of the year is sooner"],
  summer_length: ["summers last longer", "summer starts earlier and ends later", "summer is longer than it used to be"],
  autumn_onset_doy: ["autumn turns up later", "it stays warm longer into autumn", "autumn starts later"],
  first_frost_doy: ["frosts come later than they used to", "we barely get frosts anymore", "the first frost is later", "it doesn't freeze until later in the year"],
  wettest_day: ["downpours are heavier", "the heaviest rain is getting heavier", "when it rains it pours"],
  heavy_rain_days: ["it rains harder more often", "more days of heavy rain", "it chucks it down more often"],
  summer_dry_spell: ["summer dry spells are longer", "summers are drier", "it goes longer without rain in summer"],
  winter_rain: ["winters are wetter", "it rains more in winter"],
  summer_sunshine: ["summers are sunnier", "we get more sunshine in summer"],
  heating_need: ["we need less heating", "winters are milder", "winters are warmer", "I use the heating less"],
  yearly_sunshine: ["it is sunnier than it used to be", "we get more sunshine over the year"],
  cooling_need: ["we need more air conditioning", "we need the air con more", "it takes more cooling to stay comfortable"],
};

// topics the data cannot test: a question that lands here gets an honest "can't test that" with the reason
const DECOYS = {
  snow: { reply: "We don’t have a measure for snow, so that one can’t be tested here.", phrases: ["it snows less than it used to", "we don't get snow anymore", "no more white christmases"] },
  wind: { reply: "We don’t have a measure for wind, so that one can’t be tested here.", phrases: ["it is windier", "more gales", "the wind is stronger"] },
  storms: { reply: "We don’t have a measure for storms, so that one can’t be tested here.", phrases: ["storms are getting worse", "more thunderstorms", "more hurricanes"] },
  fog: { reply: "We don’t have a measure for fog, so that one can’t be tested here.", phrases: ["there is less fog", "it is foggier"] },
  humidity: { reply: "We don’t have a measure for humidity, so that one can’t be tested here.", phrases: ["it is more humid", "the air feels stickier"] },
  floods: { reply: "We don’t have a measure for floods. The closest we can test is heavy rain.", phrases: ["floods are more common", "rivers flood more often"] },
  sea: { reply: "The data covers weather over land, so the sea can’t be tested here.", phrases: ["the sea level is rising", "the sea is warmer"] },
  air: { reply: "We don’t have a measure for air quality, so that one can’t be tested here.", phrases: ["air pollution is worse", "the air quality is getting worse"] },
  forecast: { reply: "This checks how the weather has changed since 1981. It isn’t a forecast.", phrases: ["will it rain tomorrow", "what is the weather this weekend", "what will the weather be like next week"] },
  cause: { reply: "The data shows what has changed, not why. Try a hunch about heat, seasons, rain or sunshine.", phrases: ["is climate change real", "is global warming caused by humans"] },
};

// the generic reply when nothing is close enough
const CANT_TEST = "I can’t test that one. Try a hunch about heat, seasons, rain or sunshine.";
