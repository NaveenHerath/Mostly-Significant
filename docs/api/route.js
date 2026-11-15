// the gemini side of the chat box, run by vercel as a small server function at /api/route
// it does two jobs, and calculates nothing in either:
//   "route": reads the typed sentence and says which place and measure it is about, or why it can't be tested
//   "word":  takes one finished result (already looked up by the page) and says it in two plain sentences
// gemini picks places and measures from fixed lists only. the key lives in vercel's settings (GEMINI_API_KEY), never in the page

const MEASURES = ["heatwave_days", "heatwave_events", "longest_heatwave", "hottest_day", "warm_nights", "first_heatwave_doy", "summer_length", "autumn_onset_doy", "first_frost_doy", "wettest_day", "heavy_rain_days", "summer_dry_spell", "winter_rain", "summer_sunshine", "heating_need", "yearly_sunshine", "cooling_need"];
const TOPICS = ["snow", "wind", "storms", "fog", "humidity", "floods", "sea", "air", "forecast", "cause", "other"]; // why a hunch can't be tested
const PLACES = ["London", "Maidstone", "Norwich", "Plymouth", "Bristol", "Cardiff", "Birmingham", "Manchester", "Newcastle", "Belfast", "Edinburgh", "Aberdeen", "New York", "Los Angeles", "Toronto", "Sao Paulo", "Paris", "Berlin", "Madrid", "Cairo", "Delhi", "Tokyo", "Sydney", "Johannesburg", "Barcelona", "Rome", "Lisbon", "Athens", "Amsterdam", "Istanbul", "Dubai", "Marrakech", "Cape Town", "Bangkok", "Singapore", "Orlando", "Mexico City", "Rio de Janeiro"];
const VERDICTS = { // what each verdict means, in the words the site uses
  real: "the data backs the tested hunch",
  leaning: "the data points that way, but luck can't be ruled out yet",
  not_backed: "the data doesn't support the tested hunch",
  opposite: "the data shows the reverse of the tested hunch",
};

// what gemini is told when routing. each measure is described by the everyday hunch it tests
const ROUTE_PROMPT = `You route a person's feeling about the weather to one measure in a climate dataset. You do not answer the question.

Measures (pick the one the sentence is about, whichever direction the person claims):
heatwave_days: more hot days, summers are hotter, it is hotter than it used to be
heatwave_events: heatwaves happen more often
longest_heatwave: heatwaves last longer
hottest_day: the hottest day of the year is hotter, records are broken
warm_nights: nights are too warm to sleep
first_heatwave_doy: the first heat of the year arrives earlier
summer_length: summers last longer or start earlier
autumn_onset_doy: autumn arrives later, it stays warm into autumn
first_frost_doy: frosts come later or are rarer (ice on cars, frozen gardens)
wettest_day: the heaviest downpours are heavier
heavy_rain_days: heavy rain happens more often, it rains more
summer_dry_spell: summers are drier, longer spells without rain (brown lawns, hosepipe bans)
winter_rain: winters are wetter
summer_sunshine: summers are sunnier
yearly_sunshine: it is sunnier over the whole year
heating_need: winters are milder, less heating is needed (lower gas bills)
cooling_need: more air conditioning is needed

Set measure_id to "none" when the sentence cannot be tested with these, and set topic to the reason: snow, wind, storms, fog, humidity, floods, sea, air (air quality), forecast (asks about coming weather), cause (asks why the climate changes), or other (anything else, including sentences that are not about weather). Never force a match.

Set place to the place named in the sentence if it is in the list, otherwise "none". Set topic to "none" when a measure fits.

Set reversed to true only when the person claims the opposite direction to the one in the measure's description (for example "summers are getting shorter" for summer_length, or "we get more frost" for first_frost_doy).`;

// what gemini is told when wording a result
const WORD_PROMPT = `You write the short answer for a weather fact-checker. A person asked a question, and it has already been tested against NASA data. You are given the facts of that test.

Rules:
- Use only the facts given. Do not add any number, date, cause, forecast or advice that is not in the facts.
- Write every figure in digits, exactly as it is given ("27.5", never "twenty-seven point five" or "nearly thirty"). Do not work out new figures such as differences, ratios or percentages.
- Sentence one answers the person's own question directly, using the verdict. If they claimed the reverse of the tested hunch, say plainly which way the data actually points.
- Sentence two gives the size of the change: the 1980s average against the recent one.
- Two sentences, 45 words at most. Plain, friendly UK English. No jargon, no lists, no markdown.
- Talk about the claim itself ("the data backs it up"), never "your hunch": the card already tells the person whether their guess was right.
- Say "the data shows" or "the data suggests". Never say "proves", and never say why it changed.
- Speak only about the weather measure that was tested. Do not draw conclusions about things it does not measure, such as bills, health, gardens or travel.`;

const SAFE = /^[\p{L}\p{N} .,'’°²/+−\-:()]{1,80}$/u; // short plain text only, so the page can't be used to send gemini anything else

async function gemini(key, system, user, config) { // one call to gemini, returns the text it wrote
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite"; // can be changed in vercel's settings without touching the code
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(6000), // the page gives up after 7 seconds and uses the backup
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 1000, ...config }, // temperature 0: the same question always gets the same answer
    }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  return (await r.json()).candidates[0].content.parts.map((p) => p.text || "").join("");
}

async function route(key, body) { // sentence in, {measure, topic, place, reversed} out
  const text = String(body.text || "").slice(0, 200).trim(); // short sentences only, which also caps the cost
  if (!text) return [400, { error: "no text" }];
  const out = JSON.parse(await gemini(key, ROUTE_PROMPT, text, {
    responseMimeType: "application/json",
    responseSchema: { // fixed lists, so gemini cannot invent a measure or a place
      type: "OBJECT",
      properties: {
        measure_id: { type: "STRING", enum: [...MEASURES, "none"] },
        topic: { type: "STRING", enum: [...TOPICS, "none"] },
        place: { type: "STRING", enum: [...PLACES, "none"] },
        reversed: { type: "BOOLEAN" },
      },
      required: ["measure_id", "topic", "place", "reversed"],
    },
  }));
  if (out.measure_id !== "none" && !MEASURES.includes(out.measure_id)) return [502, { error: "bad measure" }]; // checked again, in case the list was ignored
  const none = out.measure_id === "none";
  return [200, {
    measure: none ? null : out.measure_id,
    topic: none ? (TOPICS.includes(out.topic) ? out.topic : "other") : null,
    place: PLACES.includes(out.place) ? out.place : null,
    reversed: !none && out.reversed === true,
  }];
}

async function word(key, body) { // one looked-up result in, two plain sentences out
  const f = body.facts || {};
  const strings = ["hunch", "noun", "then", "now", "rate", "luck"]; // the already-formatted figures the page shows on its card
  const ok = PLACES.includes(f.place) && MEASURES.includes(f.measure) && VERDICTS[f.verdict] && strings.every((k) => typeof f[k] === "string" && SAFE.test(f[k]));
  if (!ok) return [400, { error: "bad facts" }];
  const question = String(body.text || "").slice(0, 200).trim();
  const facts = [
    question ? `The person asked: "${question}"` : "",
    `Hunch tested: "${f.hunch}" in ${f.place}`,
    f.reversed === true ? "The person claimed the reverse of the tested hunch." : "",
    `Verdict: ${VERDICTS[f.verdict]}`,
    `1981 to 1990 average: ${f.then} (${f.noun})`,
    `2016 to 2025 average: ${f.now} (${f.noun})`,
    `Change per decade: ${f.rate}`,
    `Shuffled years with a trend as strong as the real one: ${f.luck}`,
  ].filter(Boolean).join("\n");
  const text = (await gemini(key, WORD_PROMPT, facts, {})).trim();
  if (!text || text.length > 400) return [502, { error: "bad wording" }];
  return [200, { text }];
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: "no key set" }); // the page falls back to the on-device model
  const body = req.body || {};
  try {
    const [code, out] = body.mode === "word" ? await word(key, body) : await route(key, body);
    return res.status(code).json(out);
  } catch (e) {
    return res.status(502).json({ error: "gemini failed" }); // timeout, bad json, quota, network
  }
};
