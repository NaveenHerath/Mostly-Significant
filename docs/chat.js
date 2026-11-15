// the "say it your own way" box: a typed sentence becomes a small case card, right there in the conversation
// it gives the same answer as the pickers below (verdict, then and now, trend, luck test, caveat), only smaller
// two models can read the sentence: gemini (through api/route.js) or a small one that runs on this device (matcher.js)
// neither supplies a number. they choose which row of data.json to show, and gemini may put that row into words

(() => { // everything here stays private to this file, so its names can't clash with app.js or timeline.js

const chatForm = $("chat-form"); // the input and its button
const chatInput = $("chat-input"); // where the sentence is typed
const chatThread = $("chat-thread"); // the questions and their answers, newest last
const MAX_TURNS = 6; // older questions drop off the top

// ---------- which model answers ----------

const MODELS = [
  { id: "auto", label: "Auto", note: "Gemini reads your sentence. If it can’t be reached, a small model on your device takes over." },
  { id: "gemini", label: "Gemini", note: "Google’s Gemini reads your sentence and words the answer. It never supplies a number." },
  { id: "device", label: "On-device", note: "A small language model (MiniLM, 34 MB) runs in your browser. No server, and nothing you type leaves this page." },
];
let chatModel = "auto"; // the user's pick, remembered between visits
try { chatModel = MODELS.some((m) => m.id === localStorage.chatModel) ? localStorage.chatModel : "auto"; } catch {} // private windows may refuse storage

function renderModels() { // the three-way switch and the line explaining the current pick
  fill($("chat-models"), MODELS.map((m) => pill(m.label, chatModel === m.id, () => {
    chatModel = m.id;
    try { localStorage.chatModel = m.id; } catch {}
    if (m.id === "device") loadMatcher().catch(() => {}); // starts the download as soon as it's chosen
    renderModels();
  })));
  $("chat-model-note").textContent = MODELS.find((m) => m.id === chatModel).note;
}

// ---------- finding the place ----------

const plain = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); // lower case, accents removed ("São Paulo" -> "sao paulo")
const PLACE_ALIASES = { nyc: "New York", "new york city": "New York", "new delhi": "Delhi", rio: "Rio de Janeiro", joburg: "Johannesburg" }; // other names people type

function findPlace(text) { // the place named in the sentence, and the sentence without it
  const t = plain(text);
  const names = [...Object.keys(DATA.places).map((p) => [plain(p), p]), ...Object.entries(PLACE_ALIASES)]
    .sort((a, b) => b[0].length - a[0].length); // longest first, so "new york city" wins over "new york"
  for (const [name, place] of names) {
    const hit = new RegExp(`\\b(in |at |for |around )?${name}\\b`).exec(t); // whole words only, with its "in" if there is one
    if (hit) return { place, rest: (t.slice(0, hit.index) + t.slice(hit.index + hit[0].length)).replace(/\s+/g, " ").trim() }; // the place is cut out so it doesn't sway the match
  }
  return { place: null, rest: text };
}

// ---------- the two models ----------

async function callGemini(body) { // the server function in api/route.js, or null if it can't answer in time
  try {
    const res = await fetch("api/route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(7000), // seven seconds, then the backup takes over
    });
    return res.ok ? await res.json() : null; // not ok: no key, quota used up, gemini down
  } catch {
    return null; // offline or timed out
  }
}

async function route(text, say) { // sentence in, {measure, topic, place, reversed, alternatives, source} out, whichever model does it
  const found = findPlace(text);
  if (chatModel !== "device") {
    const g = await callGemini({ text });
    if (g && (!g.measure || HUNCHES[g.measure])) return { ...g, place: found.place || g.place, alternatives: [], source: "gemini" };
    if (chatModel === "gemini") return { failed: true }; // they asked for gemini only, so no silent swap
  }
  if (!matcherLoaded) say("Loading the on-device model. The first time takes a few seconds.");
  const m = await matchHunch(found.rest || text);
  matcherLoaded = true;
  return { ...m, place: found.place, reversed: false, source: "device" };
}
let matcherLoaded = false; // so the "loading" line only shows the first time

// ---------- wording the answer ----------

const REVERSED_LINE = { // sentence one when the person claimed the opposite of the hunch that was tested
  real: "The data points the other way from what you said.",
  leaning: "If anything, the data leans the other way from what you said.",
  not_backed: "The data shows no clear change either way.",
  opposite: "The data is on your side here: it shows the reverse of the usual hunch.",
};

function facts(c) { // one result, formatted exactly as the card shows it
  const r = DATA.rows[c.place][c.measure];
  const unit = DATA.measures[c.measure].unit;
  return {
    place: c.place, measure: c.measure, verdict: r.verdict, reversed: !!c.reversed,
    hunch: HUNCHES[c.measure].text, noun: HUNCHES[c.measure].noun,
    then: fmtValue(r.early, unit), now: fmtValue(r.late, unit),
    rate: `${fmtRate(r.rate, unit)} per decade`, luck: fmtLuck(r.share, r.shuffles),
  };
}

function templateWords(f) { // the fixed sentence used on-device, and whenever gemini's wording is refused
  const first = f.reversed ? REVERSED_LINE[f.verdict] : VERDICTS[f.verdict].line;
  return `${first} In ${f.place} it went from ${f.then} in the 1980s to ${f.now} recently (${f.noun}).`;
}

function numbersOk(text, f) { // true only if every number in gemini's sentence is one the card already shows
  const grab = (s) => (s.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => parseFloat(n.replace(/,/g, "")));
  const allowed = [...grab(`${f.then} ${f.now} ${f.rate} ${f.luck}`), 1000, 1980, 1981, 1990, 2016, 2025, 45, 10]; // the figures, plus the years and decades it may mention
  if (/(eleven|twelve|\w+teen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|twice|doubled?|tripled?|halved?)/i.test(text)) return false; // a figure spelled out in words can't be checked, so it isn't allowed
  return grab(text).every((n) => allowed.some((a) => a === n || Math.round(a) === n)); // a rounded figure is fine, a new one is not
}

async function words(c) { // the sentences for the card, and who wrote them
  const f = facts(c);
  if (chatModel !== "device" && c.source !== "device") { // gemini words it unless the device is doing the answering
    const g = await callGemini({ mode: "word", text: c.text, facts: f });
    if (g && g.text && numbersOk(g.text, f)) return { text: g.text, by: "gemini" };
  }
  return { text: templateWords(f), by: "template" };
}

const BYLINE = { // the small print under each card: who understood the question and who worded the answer
  "gemini/gemini": "Understood and worded by Gemini.",
  "gemini/template": "Understood by Gemini, worded by a fixed template.",
  "device/template": "Understood on your device by a small language model (MiniLM), worded by a fixed template.",
  "pick/gemini": "Worded by Gemini.",
  "pick/template": "Worded by a fixed template.",
};

// ---------- small building blocks ----------

function el(tag, className, text) { // one element with a class and some text
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function addTurn(text) { // a new question in the thread, with an empty space for its answer
  const li = el("li", "chat-turn");
  const bot = el("div", "chat-bot");
  li.append(el("p", "chat-you", text), bot);
  chatThread.append(li);
  while (chatThread.children.length > MAX_TURNS) chatThread.firstElementChild.remove();
  li.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "nearest" });
  const say = (line) => { // sets the answer's opening line
    let p = bot.querySelector(".chat-say");
    if (!p) { p = el("p", "chat-say"); bot.prepend(p); }
    p.textContent = line;
  };
  return { bot, say };
}

function sparkline(r) { // every year as a faint dot, with the trend line drawn across in the verdict's colour
  const W = 320, H = 64, pad = 5;
  const end = r.start + r.values.length - 1;
  const trend = (y) => r.intercept + (r.rate / 10) * y; // the same line the big chart draws
  const all = [...r.values.filter((v) => v !== null), trend(r.start), trend(end)];
  const lo = Math.min(...all), hi = Math.max(...all);
  const x = (y) => pad + ((y - r.start) / (end - r.start)) * (W - 2 * pad);
  const yy = (v) => (hi === lo ? H / 2 : H - pad - ((v - lo) / (hi - lo)) * (H - 2 * pad));
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chat-spark");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Each year from ${r.start} to ${end}, with the trend line`);
  r.values.forEach((v, i) => { // a missing year (no frost, no heatwave) is simply left out
    if (v === null) return;
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", x(r.start + i)); c.setAttribute("cy", yy(v)); c.setAttribute("r", 1.8);
    svg.append(c);
  });
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", x(r.start)); line.setAttribute("y1", yy(trend(r.start)));
  line.setAttribute("x2", x(end)); line.setAttribute("y2", yy(trend(end)));
  line.setAttribute("pathLength", 1); // lets css draw it in from left to right
  svg.append(line);
  const wrap = el("div", "chat-spark-wrap");
  const years = el("div", "chat-years");
  years.append(el("span", null, r.start), el("span", null, end));
  wrap.append(svg, years);
  return wrap;
}

function luckMeter(r) { // a thin bar: how much of it is lit is the share of shuffles that matched the real trend
  const n = luckCount(r.share, r.shuffles);
  const wrap = el("div", "chat-luck");
  const bar = el("div", "chat-meter");
  const lit = el("span");
  lit.style.width = `${n === 0 ? 0 : Math.max(1.5, r.share * 100)}%`; // even one match shows as a sliver
  bar.append(lit);
  bar.setAttribute("aria-hidden", "true"); // the sentence beside it says the same thing
  wrap.append(bar, el("p", null, n === 0 ? "Could it be luck? None of 1,000 shuffles of the years matched this trend."
    : `Could it be luck? ${fmtLuck(r.share, r.shuffles)} shuffles of the years matched this trend.`));
  return wrap;
}

// ---------- follow-ups ----------

function differentPlace(c, verdict) { // somewhere in the same region where this hunch gets a different verdict
  const order = ["opposite", "not_backed", "leaning", "real"]; // the most surprising first
  const others = placesIn(DATA.places[c.place].region)
    .filter((p) => p !== c.place && p !== "Delhi" && DATA.rows[p][c.measure] && DATA.rows[p][c.measure].verdict !== verdict); // delhi isn't offered until it's checked against stations
  others.sort((a, b) => order.indexOf(DATA.rows[a][c.measure].verdict) - order.indexOf(DATA.rows[b][c.measure].verdict));
  return others[0];
}

function biggestChange(c) { // the clearest trend in this place, other than the one just shown
  const rows = DATA.rows[c.place];
  const ids = Object.keys(rows).filter((m) => m !== c.measure && HUNCHES[m] && (rows[m].verdict === "real" || rows[m].verdict === "opposite"));
  ids.sort((a, b) => rows[a].p - rows[b].p); // smallest p value first
  return ids[0];
}

function openFullCase(c, guess) { // the same answer in the full view further down the page
  state.place = c.place;
  state.region = DATA.places[c.place].region;
  state.topic = HUNCHES[c.measure].topic;
  state.measure = c.measure;
  state.guess = guess;
  render();
  $("result").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
}

// ---------- the case card ----------

function startCase(turn, c) { // says what is being tested and asks for a guess. the answer stays hidden until then
  const hunch = HUNCHES[c.measure].text;
  turn.say(c.reversed ? `You’ve put it the other way round, so I’m testing “${hunch}” in ${c.place}. What’s your guess?`
    : `I’m testing that as “${hunch}” in ${c.place}. What’s your guess?`);
  const wording = words(c); // gemini writes its two sentences while the person decides
  const row = el("div", "pills chat-guess");
  row.append(...GUESSES.map((g) => pill(g.label, false, async () => {
    row.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    row.replaceWith(await card(c, g.id, await wording));
    turn.say(`${c.reversed ? "You put it the other way round, so I" : "I"} tested that as “${hunch}” in ${c.place}.`); // the question has been answered, so it's dropped from the line
    turn.bot.querySelector(".chat-alts")?.remove(); // the "did you mean" row has done its job
  })));
  turn.bot.append(row);
  const alts = (c.alternatives || []).filter((id) => id !== c.measure && DATA.rows[c.place][id]); // near misses from the on-device model
  if (alts.length) {
    const more = el("div", "pills chat-alts");
    more.append(el("span", "chat-or", "Or did you mean:"), ...alts.map((id) => pill(HUNCHES[id].text, false, () => {
      turn.bot.replaceChildren();
      startCase(turn, { ...c, measure: id, alternatives: [] });
    })));
    turn.bot.append(more);
  }
}

async function card(c, guess, worded) { // the whole answer, small: verdict, words, then and now, trend, luck, caveat
  const r = DATA.rows[c.place][c.measure];
  const f = facts(c);
  const box = el("div", "chat-card");
  box.dataset.verdict = r.verdict; // css colours the stamp, the trend line and the meter

  const head = el("div", "chat-head");
  head.append(el("span", "chat-stamp", VERDICTS[r.verdict].label), el("span", "chat-gut", GUT[guess][r.verdict]));

  const nums = el("p", "chat-nums");
  nums.append(el("span", "chat-then", f.then), el("span", "chat-arrow", "→"), el("span", "chat-now", f.now), el("span", "chat-noun", `${f.noun}, 1980s to now`));

  const next = el("div", "pills chat-next");
  next.append(pill("See the full case", false, () => openFullCase(c, guess)));
  const other = differentPlace(c, r.verdict);
  if (other) next.append(pill(`It’s a different story in ${other}`, false, () => followUp(`Same hunch in ${other}?`, { place: other, measure: c.measure })));
  const big = biggestChange(c);
  if (big) next.append(pill(`Biggest change in ${c.place}`, false, () => followUp(`What’s changed most in ${c.place}?`, { place: c.place, measure: big })));

  box.append(
    head,
    el("p", "chat-words", worded.text),
    nums,
    sparkline(r),
    el("p", "chat-rate", f.rate),
    luckMeter(r),
    el("p", "chat-caveat", r.caveat),
    next,
    el("p", "chat-by", `${BYLINE[`${c.source}/${worded.by}`]} Every number comes from NASA POWER (MERRA-2), 1981 to 2025, not from the model.`),
  );
  return box;
}

function followUp(label, pick) { // a tapped follow-up becomes the next question in the thread
  const turn = addTurn(label);
  startCase(turn, { ...pick, text: `Is it just me, or ${HUNCHES[pick.measure].question} in ${pick.place}?`, source: "pick", reversed: false });
}

// ---------- asking ----------

async function ask(text) { // one typed sentence, from start to guess buttons
  const turn = addTurn(text);
  turn.say("Checking.");
  let r;
  try {
    r = await route(text, turn.say);
  } catch {
    turn.say("That didn’t work this time. Pick a place and a hunch below instead."); // the on-device model couldn't load
    return;
  }
  if (r.failed) { turn.say("Gemini isn’t answering right now. Switch to On-device and ask again."); return; }
  const place = r.place || state.place; // no place in the sentence: the one already picked below
  if (!r.measure) { // can't be tested: say why
    turn.say((r.topic && DECOYS[r.topic]?.reply) || CANT_TEST);
    return;
  }
  let m = r.measure;
  const SWAP = { summer_sunshine: "yearly_sunshine", yearly_sunshine: "summer_sunshine" }; // the same hunch, measured over summer in the uk and the whole year elsewhere
  if (!DATA.rows[place][m] && DATA.rows[place][SWAP[m]]) m = SWAP[m];
  if (!DATA.rows[place][m]) { // e.g. frost in cairo
    turn.say(`“${HUNCHES[m].text}” is only measured for the UK towns. Here is what can be tested in ${place}:`);
    const row = el("div", "pills");
    row.append(...Object.keys(HUNCHES).filter((id) => DATA.rows[place][id]).map((id) => pill(HUNCHES[id].text, false, () => {
      turn.bot.replaceChildren();
      startCase(turn, { place, measure: id, text, source: "pick", reversed: false });
    })));
    turn.bot.append(row);
    return;
  }
  startCase(turn, { place, measure: m, text, source: r.source, reversed: r.reversed, alternatives: r.alternatives });
}

// ---------- wiring ----------

const STARTERS = ["Nights are unbearable in Manchester", "I never scrape ice off my car any more", "Are summers getting shorter in London?", "It’s snowing less"]; // examples to tap, one of them untestable on purpose

let chatBusy = false; // one question at a time
async function submit(text) {
  if (!text || !DATA || chatBusy) return;
  chatBusy = true;
  chatForm.setAttribute("aria-busy", "true"); // css dims the button while it works
  $("chat-starters").hidden = true; // the examples make way for the conversation
  await ask(text);
  chatForm.removeAttribute("aria-busy");
  chatBusy = false;
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault(); // no page reload
  const text = chatInput.value.trim();
  chatInput.value = "";
  submit(text);
});

chatInput.addEventListener("focus", () => { // gets the backup model ready as soon as someone goes to type
  const saveData = navigator.connection && navigator.connection.saveData;
  if (!saveData) loadMatcher().then(() => { matcherLoaded = true; }).catch(() => {}); // on data saver the 34 MB is only fetched if it's actually needed
}, { once: true });

fill($("chat-starters"), STARTERS.map((s) => pill(s, false, () => submit(s))));
renderModels();

})();
