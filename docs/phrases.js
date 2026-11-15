// the example sentences the on-device matcher compares a typed question against
// a typed question is matched to whichever sentence here is closest in meaning, and takes that sentence's measure

// everyday ways of saying each of the 20 hunches (the site's own wording plus naveen's phrase list)
const MATCH_PHRASES = {
  heatwave_days: ["we get more heatwave days", "summers are getting hotter", "more scorching days", "there are more really hot days","summers feel hotter than when i was a kid", "it is boiling every summer now", "is it too hot now", "it is so hot these days", "is it hotter now than it used to be"],
  heatwave_events: ["we get more heatwaves", "heatwaves are more frequent", "heatwaves happen more often", "heatwaves keep coming back", "we get a heatwave every summer now", "there is always a heatwave on the news"],
  longest_heatwave: ["heatwaves last longer", "heatwaves drag on for longer", "hot spells go on for more days", "hot spells go on for weeks", "the heat doesn't let up for days", "the heat goes on and on", "the heatwave never ends", "the hot weather goes on forever"],
  hottest_day: ["the hottest days are hotter", "records keep being broken", "the peak temperature is higher", "the hottest day of the year is more extreme", "the peak of summer is hotter", "the hottest day is hotter than ever", "the hottest days are scorching", "it gets to 40 degrees now", "temperatures hit highs we never used to see"],
  warm_nights: ["nights are too warm to sleep", "it doesn't cool down at night anymore", "i can't sleep in summer", "bedrooms stay hot all night", "I sleep with the window open all summer"],
  muggy_nights: ["summer nights feel muggier", "muggy nights", "it is muggier at night", "the air is sticky and close at night", "it is more humid", "the air is sticky at night", "summer nights feel close and humid", "the nights are clammy"],
  first_heatwave_doy: ["heat arrives earlier in the year", "the first heatwave comes earlier", "the first hot spell of the year is sooner", "it gets hot by may now", "summer heat comes sooner", "we get hot weather in spring now"],
  summer_length: ["summers last longer", "summer starts earlier and ends later", "summer is longer than it used to be", "summer starts sooner and ends later", "summer feels longer"],
  autumn_onset_doy: ["autumn turns up later", "it stays warm longer into autumn", "autumn starts later", "it's still warm in september", "autumn feels later every year", "the leaves turn later", "it's still shorts weather in october", "warm enough for short sleeves in october"],
  first_frost_doy: ["frosts come later than they used to", "we barely get frosts anymore", "the first frost is later", "it doesn't freeze until later in the year", "i rarely scrape ice off my car", "the garden freezes later in the year", "frost turns up later"],
  wettest_day: ["downpours are heavier", "the heaviest rain is getting heavier", "when it rains it pours", "downpours are more extreme", "the rain is more torrential", "sudden cloudbursts are more violent", "flash downpours are getting heavier"],
  heavy_rain_days: ["it rains harder more often", "more days of heavy rain", "it chucks it down more often","it buckets down all the time"],
  summer_dry_spell: ["summer dry spells are longer", "summers are drier", "it goes longer without rain in summer", "it goes weeks without rain in summer", "there are more hosepipe bans", "the grass turns brown in summer", "the lawn dries out from no rain"],
  winter_rain: ["winters are wetter", "it rains more in winter", "it rains all winter", "winters are soggier", "winters are grey and wet"],
  windy_days: ["it is windier than it used to be", "it is windier", "more gales", "the wind is stronger","it is always blowing a gale"],
  dry_soil_days: ["the ground dries out more in summer", "the soil is drier", "the ground is cracked in summer", "the garden is bone dry by august","the ground cracks in summer", "the soil is like dust in summer"],
  summer_sunshine: ["summers are sunnier", "we get more sunshine in summer", "summers are brighter", "we get more sunny summer days", "summers are less cloudy"],
  heating_need: ["we need less heating", "winters are milder", "winters are warmer", "I use the heating less","i put the heating on less", "my gas bill is lower in winter"],
  yearly_sunshine: ["it is sunnier than it used to be", "we get more sunshine over the year", "there are more sunny days", "the sun feels stronger", "it is less cloudy all year"],
  cooling_need: ["we need more air conditioning", "we need the air con more", "it takes more cooling to stay comfortable", "the air con never goes off", "it's too hot without a fan", "everyone needs air con now"],
};

// topics the data cannot test: a question that lands here gets an honest "can't test that" with the reason
// "try" lists the related measures offered as tappable suggestions afterwards (fixed here, so it works the same for gemini and on-device)
const DECOYS = {
  snow: { try: ["first_frost_doy", "heating_need"], reply: "We don’t have a measure for snow, so that one can’t be tested here.", phrases: ["it snows less than it used to", "we don't get snow anymore", "no more white christmases"] },
  storms: { try: ["windy_days", "wettest_day", "heavy_rain_days"], reply: "We don’t have a measure for storms, so that one can’t be tested here.", phrases: ["storms are getting worse", "more thunderstorms", "more hurricanes"] },
  fog: { try: ["first_frost_doy", "autumn_onset_doy"], reply: "We don’t have a measure for fog, so that one can’t be tested here.", phrases: ["there is less fog", "it is foggier"] },
  humidity: { try: ["muggy_nights", "warm_nights"], reply: "We only track humidity as muggy summer nights, so try that one.", phrases: ["the air is damper all year", "it feels damp in winter"] }, // the sticky summer feeling goes to muggy_nights
  floods: { try: ["heavy_rain_days", "wettest_day", "winter_rain"], reply: "We don’t have a measure for floods. The closest we can test is heavy rain.", phrases: ["floods are more common", "rivers flood more often"] },
  sea: { reply: "The data covers weather over land, so the sea can’t be tested here.", phrases: ["the sea level is rising", "the sea is warmer"] },
  pollen: { try: ["summer_length"], reply: "We don’t have a measure for pollen, so that one can’t be tested here.", phrases: ["hay fever is worse", "the pollen count is higher", "allergies are worse in spring"] },
  air: { reply: "We don’t have a measure for air quality, so that one can’t be tested here.", phrases: ["air pollution is worse", "the air quality is getting worse"] },
  forecast: { reply: "This checks how the weather has changed since 1981. It isn’t a forecast.", phrases: ["will it rain tomorrow", "what is the weather this weekend", "what will the weather be like next week", "is it hot today", "what is the temperature right now"] },
  cause: { reply: "The data shows what has changed, not why. Try a hunch about heat, seasons, rain, wind or sunshine.", phrases: ["is climate change real", "is global warming caused by humans"] },
};

// what to offer instead when a topic has no "try" list of its own, or its picks are missing for that place
const TRY_INSTEAD = ["heatwave_days", "summer_length", "heavy_rain_days"];

// the generic reply when nothing is close enough
const CANT_TEST = "I can’t test that one. Try a hunch about heat, seasons, rain, wind or sunshine.";
