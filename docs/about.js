// the bottom block: "Test your gut" (two games) and "About" (why, what you can do, roadmap, team, faq, demo)
// reads its numbers from data.json, then puts each section in its spot on the page
// wrapped in its own scope so names like el or countUp can't clash with app.js
(() => {

const VIDEO_URL = ""; // paste the demo video link here when it's up
const SLIDES_URL = ""; // paste the slides link here when they're up

// ---------- words and picks ----------

// odd one out rounds: one hunch, three nearby places, the odd one's verdict is "opposite" and the other two are real or leaning
// the places are picked by hand, every number and verdict still comes from data.json
// "point" in the wording covers both real and leaning, so we never claim more than the verdict does
const ROUNDS = [
  { measure: "summer_dry_spell", question: "do summer dry spells go on longer", ask: "In two towns, summer dry spells point longer. One clearly went the other way. Which?", noun: "days, longest dry spell", places: ["Bournemouth", "Exeter", "Southampton"] }, // south coast
  { measure: "summer_dry_spell", question: "do summer dry spells go on longer", ask: "In two places, summer dry spells point longer. One clearly went the other way. Which?", noun: "days, longest dry spell", places: ["Oxford", "Bournemouth", "Cardiff"] }, // south, with cardiff over the water
  { measure: "wettest_day", question: "are downpours heavier", ask: "In two towns, the wettest day points wetter. One clearly went the other way. Which?", noun: "mm on the wettest day", places: ["Inverness", "Fort William", "Dundee"] }, // highlands
  { measure: "wettest_day", question: "are downpours heavier", ask: "In two cities, the wettest day points wetter. One clearly went the other way. Which?", noun: "mm on the wettest day", places: ["Madrid", "Lisbon", "Marrakech"] }, // iberia and morocco
  { measure: "windy_days", question: "are there more windy days", ask: "In two cities, windy days point more common. One clearly went the other way. Which?", noun: "windy days a year", places: ["Athens", "Rome", "Cairo"], showCaveat: true }, // mediterranean, model wind is shaky so we say so
];

// a short "where is that" line for each place in the game, so a row isn't just a name
const PLACE_REGION = {
  Bournemouth: "Dorset, England", Exeter: "Devon, England", Southampton: "Hampshire, England", Oxford: "Oxfordshire, England", Cardiff: "Wales", // south
  Inverness: "Highlands, Scotland", "Fort William": "Highlands, Scotland", Dundee: "East Scotland", // scotland
  Madrid: "Spain", Lisbon: "Portugal", Marrakech: "Morocco", Athens: "Greece", Rome: "Italy", Cairo: "Egypt", // world
};

// verdict wording, same as hunches.js, copied so this file doesn't depend on load order
const VERDICT_LABELS = { real: "Yes, it’s real", leaning: "Signs of it, not proven", not_backed: "Not backed by the data", opposite: "It’s actually the opposite" };

// six odd-looking things from the data. answers and figures come from naveen's checks
// (data-generation/data/clean/data_checks.csv) and the Limitations part of data-generation/README.md
// figure can be a function, so it reads the live number from data.json
const QUIZ = [
  { icon: "thermometer", where: "London, 19 July 2022", figure: d => Math.max(...d.rows.London.hottest_day.values).toFixed(1) + " °C", claim: "London’s hottest day in our data. Weather stations recorded about 40 °C that day.", answer: "grid", why: "The 50 km square blurs it: parks and fields get averaged in with the city, so peaks read low. The trends still hold." }, // live from data.json
  { icon: "wind", where: "London, 18 Feb 2022", figure: "20.5 m/s", claim: "Strongest wind that day. A normal top-1% windy day here is 15.2 m/s.", answer: "real", why: "That was Storm Eunice, one of the worst storms in southern England in decades." }, // data_checks.csv: 20.48 vs 99th percentile 15.2
  { icon: "snow", where: "London, December 2010", figure: "−0.3 °C", claim: "The month’s average. The coldest December in all 45 years.", answer: "real", why: "The big freeze of 2010: snow and ice across the UK for weeks." }, // data_checks.csv
  { icon: "droplet", where: "Singapore, 2025", figure: "7,465 mm", claim: "Rain that year. Singapore usually gets about 2,400 mm.", answer: "error", why: "No rain gauge there shows it. NASA’s rain data for Singapore breaks in January 2021, so we cut it off there and use 1981 to 2020." }, // README limitations
  { icon: "moon", where: "Toronto", figure: "1.0 °C", claim: "How fast nights seemed to warm per decade, in sudden jumps. Squares nearby: 0.3 to 0.4 °C.", answer: "error", why: "Toronto’s grid square is mostly Lake Ontario, and the lake threw the numbers off. We moved it to a land square 39 km north." }, // README, one place per grid square
  { icon: "mountain", where: "Mexico City", figure: "3 °C", claim: "How much colder our data reads than the city itself.", answer: "grid", why: "The 50 km square shifts it: the square sits about 400 m higher than the city, and higher ground is cooler. The trends still hold." }, // README limitations
];
const QUIZ_CHOICES = [["real", "Real"], ["error", "Data error"], ["grid", "Grid blur"]]; // value and button word
const QUIZ_SAY = { real: "Real.", error: "Data error.", grid: "Grid blur." }; // how the answer is said on reveal

// naveen first, same order and links as the footer
const TEAM = [
  { name: "Naveen Herath", where: "London, UK", linkedin: "https://www.linkedin.com/in/naveen-herath314/" }, // naveen
  { name: "Bathila Jayasiri", where: "Kent, UK", linkedin: "https://www.linkedin.com/in/bathila-jayasiri" }, // bathila
];

// the linkedin mark, same path as the footer's (from simple icons), a filled logo not a line icon
const LINKEDIN = '<svg class="li-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>';

const FAQ = [
  { icon: "database", q: "Where does the data come from?", a: "NASA POWER, which is built on MERRA-2: satellite and ground observations combined in a weather model. Each place is a square about 50 km wide, with a value for every day from 1981 to 2025." },
  { icon: "pin", q: "Why isn’t my town here, and why 50 km?", a: "We picked 49 UK towns and 26 world cities to cover a wide spread of climates. NASA’s grid is made of squares about 50 km across, so a town’s number is the average over its whole square, not one street." },
  { icon: "check", q: "What makes a trend “real”?", a: "Two things: later years beat earlier ones far more often than chance would allow, and the change goes the way the hunch says. The size is the typical change every 10 years. For the record, these are a Mann-Kendall test (Hamed-Rao version, which allows for one year being like the next) and Sen’s slope." },
  { icon: "dice", q: "What is the luck test?", a: "We shuffle the 45 years into a random order 1,000 times and count how often a trend this strong shows up anyway. “About 3 in 1,000” means luck alone rarely does it." },
  { icon: "trend", q: "What does “signs of it, not proven” mean?", a: "It points the way the hunch says, but it could still be luck. Rain often lands here because it jumps around a lot from year to year." },
  { icon: "thermometer", q: "What does “normal” mean?", a: "A place’s own average over 1981 to 2010. Each place is compared with itself, so a warm year in Aberdeen and a warm year in Dubai mean different temperatures." },
  { icon: "thermometer", q: "Why doesn’t London show 40 °C in 2022?", a: "A 50 km square averages parks, fields and rivers in with the city, so peaks read low. Our London shows 34.5 °C that day. The trends still hold." },
  { icon: "message", q: "Can the chat box make up numbers?", a: "No. A language model only works out which test you mean. Every number on a card comes from the NASA results, and a sentence with a number that isn’t on the card is thrown away. Questions the data can’t test get a general answer, marked as not coming from the NASA data." },
  { icon: "help", q: "Is this a forecast? Does it prove climate change?", a: "Neither. It shows what changed in each place from 1981 to 2025, not what will happen next or why it changed. It’s a fact-check for hunches." },
  { icon: "code", q: "Can I see how it works?", a: "Yes, all the code and every data step are on GitHub.", link: "https://github.com/NaveenHerath/Mostly-Significant" },
];

// small line icons, drawn inline so we don't touch icons.svg (T2's file). 24x24, stroke only
const ICONS = {
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  lightbulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  thermometer: '<path d="M14 4v10.5a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  snow: '<path d="M20 15.5A4.5 4.5 0 0 0 17.5 7h-1.3A7 7 0 1 0 4 13.3"/><path d="M8 16h.01M8 20h.01M12 18h.01M12 22h.01M16 16h.01M16 20h.01"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h.01M16 16h.01M12 12h.01"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
  slides: '<path d="M3 4h18M4 4v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4M12 16v5M8 21h8"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  wind: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
  droplet: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  mountain: '<path d="m3 20 6-10 4 6 2-3 6 7z"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  to: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; // people who asked for less movement get no count-up

// ---------- small helpers ----------

// make an element with a class and some text
function el(tag, cls, text) {
  const e = document.createElement(tag); // the element
  if (cls) e.className = cls; // its class, if any
  if (text != null) e.textContent = text; // its text, if any
  return e; // hand it back
}

// one icon as svg markup, hidden from screen readers because the words carry it
function icon(name, cls) {
  return `<svg class="icon${cls ? " " + cls : ""}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`; // inline svg
}

// a big section pane, frosted glass, with an icon and heading
function pane(id, title, iconName, navKey) {
  const s = el("section", "step about-pane"); // same pane shape as every other step, glass set in about.css
  s.id = id; // so the nav can link to it
  s.dataset.nav = navKey; // so the top bar can highlight it
  s.setAttribute("aria-labelledby", id + "-h"); // the heading names the section
  const h = el("h2"); // the heading
  h.id = id + "-h"; // id for aria
  h.innerHTML = icon(iconName); // icon first
  h.append(title); // then the words
  s.append(h); // heading goes in first
  return s; // caller fills the rest
}

// an inner tile inside a pane: frosted like the "how it works" tiles, one topic colour, icon in its heading
function part(id, title, iconName, tone) {
  const p = el("div", "part glass tone-" + tone); // .glass gives the frost, tone sets the colour
  p.id = id; // so links can jump straight to it
  const h = el("h3", "part-h"); // small heading
  h.innerHTML = icon(iconName, "part-icon"); // icon in the tile's colour
  h.append(title); // then the words
  p.append(h); // heading first
  return p; // caller fills the rest
}

// a hairline list: icon beside a title and one line, optional tag on the right, optional link
function list(items) {
  const ul = el("ul", "hl-list"); // the list
  items.forEach(it => {
    const li = el("li"); // one row
    const row = el(it.href ? "a" : "div", "hl-row"); // link or plain row
    if (it.href) { row.href = it.href; if (/^http/.test(it.href)) { row.target = "_blank"; row.rel = "noopener"; } } // outside links open in a new tab
    row.innerHTML = icon(it.icon, "hl-icon"); // icon on the left
    const words = el("span", "hl-words"); // title and line together
    words.append(el("span", "hl-title", it.title), el("span", "hl-text", it.text)); // as text so nothing gets injected
    row.append(words); // middle
    if (it.tag) row.append(el("span", "hl-tag" + (it.soon ? " is-soon" : ""), it.tag)); // small word on the right
    li.append(row); // into the row
    ul.append(li); // into the list
  });
  return ul; // hand it back
}

// round a number the way people read it
function fmt(n) {
  return Math.abs(n) >= 100 ? Math.round(n).toLocaleString("en-GB") : n.toFixed(1); // big ones whole, small ones one decimal
}

// count a number up from zero, or just show it if motion is off
function countUp(node, target) {
  if (reduceMotion) { node.textContent = fmt(target); return; } // no animation wanted
  const start = performance.now(); // when we started
  const dur = 700; // same as --dur-count in tokens.css
  function tick(now) {
    const t = Math.min(1, Math.max(0, (now - start) / dur)); // how far through, 0 to 1 (first frame can land a hair before start)
    node.textContent = fmt(target * (1 - Math.pow(1 - t, 3))); // eases out so it settles gently
    if (t < 1) requestAnimationFrame(tick); // keep going till the end
  }
  requestAnimationFrame(tick); // kick it off
  setTimeout(() => { node.textContent = fmt(target); }, dur + 50); // safety net: land on the real number even if frames get paused
}

// shuffle a copy of a list so the odd one isn't always in the same spot
function shuffled(listIn) {
  const a = listIn.slice(); // copy so we don't mess up the original
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } // fisher-yates
  return a; // shuffled copy
}

// tell the gut score bar about a pick, if it's on the page
function tellGut(right) {
  if (typeof window.recordGuess === "function") window.recordGuess(right); // app.js owns the score
}

// the shared bottom of a game: next button that never moves, message under it
function gameFoot() {
  const foot = el("div", "game-foot"); // the row
  const next = el("button", "pill pill-primary game-next is-waiting", "Next"); // go on, invisible till a pick
  next.type = "button"; // not a form submit
  const msg = el("p", "game-msg"); // short feedback
  msg.setAttribute("aria-live", "polite"); // read it out
  foot.append(next, msg); // button first so it never moves
  return { foot, next, msg }; // caller wires them up
}

// ---------- game 1: odd one out ----------

function buildOddOneOut(data) {
  // self-check: exactly one place is "opposite", the other two are "real" or "leaning", straight from the data
  const rounds = ROUNDS.filter(r => {
    const verdicts = r.places.map(p => data.rows[p] && data.rows[p][r.measure] && data.rows[p][r.measure].verdict); // their verdicts
    const ok = verdicts.filter(v => v === "opposite").length === 1 && verdicts.every(v => ["opposite", "real", "leaning"].includes(v)); // one opposite, rest real or leaning
    console.assert(ok, "odd one out round doesn't match its verdict rule:", r.measure, r.places, verdicts); // shout in the console if the data changed
    return ok; // drop broken rounds rather than show a wrong answer
  });
  if (!rounds.length) return null; // nothing usable, skip the game

  const g = part("odd-one-out", "Odd one out", "target", "heat"); // the sub-part
  const meta = el("p", "game-meta"); // round 2 of 5
  const hunch = el("p", "game-hunch"); // "is it just me, or ..."
  const q = el("p", "game-q"); // the question, big
  const opts = el("div", "odd-opts"); // the three places
  opts.setAttribute("role", "group"); // they belong together
  opts.setAttribute("aria-label", "Pick the odd one out"); // what the group is for
  const caveat = el("p", "game-caveat"); // the data's own warning, only on rounds that need it
  const { foot, next, msg } = gameFoot(); // next button and message
  g.append(meta, hunch, q, opts, caveat, foot); // put it together

  let round = 0, score = 0; // where we are and how many right

  // draw one round
  function show() {
    const r = rounds[round]; // this round
    meta.textContent = `Round ${round + 1} of ${rounds.length}`; // progress
    hunch.textContent = `Is it just me, or ${r.question}?`; // the hunch, worded like the title
    q.textContent = r.ask; // what to look for, said straight
    const oddPlace = r.places.find(p => data.rows[p][r.measure].verdict === "opposite"); // the answer
    caveat.textContent = r.showCaveat ? data.rows[oddPlace][r.measure].caveat : ""; // live caveat from data.json
    caveat.hidden = !r.showCaveat; // no gap on the other rounds
    msg.textContent = ""; // no result yet
    next.classList.add("is-waiting"); // hide next till they pick, keeps its spot
    opts.replaceChildren(); // clear last round
    shuffled(r.places).forEach(place => {
      const row = data.rows[place][r.measure]; // this place's numbers
      const b = el("button", "odd-opt"); // the whole row is the button
      b.type = "button"; // not a form submit
      b.dataset.odd = place === oddPlace; // remember the answer for the reveal
      const name = el("span", "odd-name"); // place and region
      name.append(el("span", "odd-place", place), el("span", "odd-region", PLACE_REGION[place] || "")); // name over region
      const res = el("span", "odd-res"); // right side: "tap to pick", then the answer
      res.innerHTML = `<span class="odd-tap">Tap to pick</span>` + // faint hint before the pick
        `<span class="odd-ans"><span class="odd-nums">${icon(row.late > row.early ? "up" : "down", "odd-dir")}<span class="odd-then"></span>${icon("to", "odd-to")}<span class="odd-now"></span></span>` + // arrow and then -> now
        `<span class="odd-verdict" data-verdict="${row.verdict}">${VERDICT_LABELS[row.verdict]}</span></span>`; // the site's own verdict for this place
      res.dataset.then = row.early; // 1981-1990 average
      res.dataset.now = row.late; // 2016-2025 average
      b.append(name, res); // name left, answer right
      b.addEventListener("click", () => pick(b)); // their pick
      opts.append(b); // into the list
    });
    opts.dataset.noun = r.noun; // the unit, said once in the message after the reveal
  }

  // they picked: reveal all three
  function pick(chosen) {
    const right = chosen.dataset.odd === "true"; // did they find it
    if (right) score++; // keep score
    opts.querySelectorAll(".odd-opt").forEach(b => {
      b.disabled = true; // one go per round
      b.classList.add("revealed"); // swap "tap to pick" for the answer
      if (b.dataset.odd === "true") b.classList.add("is-right"); // the real odd one always goes green
      else if (b === chosen) b.classList.add("is-wrong"); // a wrong pick goes red
      const res = b.querySelector(".odd-res"); // the numbers
      countUp(res.querySelector(".odd-then"), +res.dataset.then); // count up then
      countUp(res.querySelector(".odd-now"), +res.dataset.now); // and now
    });
    const last = round === rounds.length - 1; // was that the final round
    msg.textContent = (right ? "Right answer!" : "Not quite. Even nearby places can disagree.") + ` Numbers are ${opts.dataset.noun}, 1980s then now.` + (last ? ` You spotted ${score} of ${rounds.length}.` : ""); // feedback, unit, final score
    next.textContent = last ? "Play again" : "Next round"; // button wording
    next.classList.remove("is-waiting"); // show it
    tellGut(right); // gut score bar
  }

  // next round, or start over after the last one
  next.addEventListener("click", () => {
    if (round === rounds.length - 1) { round = 0; score = 0; } else round++; // start again or move on
    show(); // draw it
    opts.querySelector(".odd-opt").focus(); // keep keyboard people in the game
  });

  show(); // first round
  return g; // hand it back
}

// ---------- game 2: real, data error or grid blur? ----------

function buildQuiz(data) {
  const g = part("real-error-grid", "Real, data error or grid blur?", "help", "rain"); // the sub-part
  g.append(el("p", "game-hint", "Real: it really happened. Data error: the record broke. Grid blur: the 50 km square smoothed or shifted it.")); // the three words, once
  const meta = el("p", "game-meta"); // card 2 of 6
  const where = el("p", "quiz-where"); // icon and place
  const figure = el("p", "quiz-figure"); // the big number
  const claim = el("p", "quiz-claim"); // what the number is
  const choices = el("div", "quiz-choices"); // three pills
  choices.setAttribute("role", "group"); // they belong together
  const reveal = el("p", "quiz-reveal"); // the answer and why
  reveal.setAttribute("aria-live", "polite"); // read it out
  const { foot, next, msg } = gameFoot(); // next button and message
  g.append(meta, where, figure, claim, choices, reveal, foot); // put it together

  let i = 0, right = 0; // which card and how many right

  // draw one card
  function show() {
    const item = QUIZ[i]; // this card
    meta.textContent = `Card ${i + 1} of ${QUIZ.length}`; // progress
    where.innerHTML = icon(item.icon); // what kind of weather
    where.append(item.where); // then the place
    figure.textContent = typeof item.figure === "function" ? item.figure(data) : item.figure; // live number or the written one
    claim.textContent = item.claim; // what it is
    reveal.textContent = ""; // no answer yet
    msg.textContent = ""; // no score yet
    next.classList.add("is-waiting"); // hide next till they answer
    choices.setAttribute("aria-label", `Real, data error or grid blur: ${item.where}`); // what the group is for
    choices.replaceChildren(); // clear last card's buttons
    QUIZ_CHOICES.forEach(([value, word]) => {
      const b = el("button", "pill quiz-choice", word); // same pill as everywhere else
      b.type = "button"; // not a form submit
      b.dataset.value = value; // remember which answer this is
      b.addEventListener("click", () => answer(b)); // their pick
      choices.append(b); // into the row
    });
  }

  // they answered
  function answer(b) {
    const item = QUIZ[i]; // this card
    const ok = b.dataset.value === item.answer; // did they get it
    if (ok) right++; // keep count
    choices.querySelectorAll("button").forEach(x => {
      x.disabled = true; // one go per card
      if (x === b) x.classList.add(ok ? "is-right" : "is-wrong"); // their pick, green or red
      else if (x.dataset.value === item.answer) x.classList.add("is-answer"); // show the right one if they missed
    });
    reveal.innerHTML = `<strong>${QUIZ_SAY[item.answer]}</strong> `; // the answer word
    reveal.append(item.why); // then why, as text
    const last = i === QUIZ.length - 1; // final card
    if (last) msg.textContent = `You got ${right} of ${QUIZ.length}.`; // final score
    next.textContent = last ? "Play again" : "Next card"; // button wording
    next.classList.remove("is-waiting"); // show it
    tellGut(ok); // gut score bar
  }

  // next card, or start over
  next.addEventListener("click", () => {
    if (i === QUIZ.length - 1) { i = 0; right = 0; } else i++; // start again or move on
    show(); // draw it
    choices.querySelector("button").focus(); // keep keyboard people in the game
  });

  show(); // first card
  return g; // hand it back
}

// ---------- section: test your gut ----------

function buildGut(data) {
  const s = pane("test-your-gut", "Test your gut", "target", "gut"); // the pane
  const games = el("div", "games"); // side by side on laptops
  [buildOddOneOut(data), buildQuiz(data)].forEach(g => g && games.append(g)); // both games
  s.append(games); // into the pane
  return s; // hand it back
}

// ---------- section: about ----------

function buildAboutPane(data) {
  const s = pane("about", "About", "info", "about"); // the big pane
  const grid = el("div", "about-grid"); // the inner tiles, two across on laptops

  // why we built it
  const why = part("why", "Why we built it", "heart", "heat"); // tile
  why.append(el("p", "part-p", "Everyone has a weather hunch, and memory makes a poor thermometer. NASA has 45 years of daily weather for anywhere on Earth, so we made it a guess you can check.")); // the story in two sentences

  // stats: the strip that used to sit in "how it works", same numbers and icons, read live from data.json
  const stats = part("stats", "Stats", "trend", "seasons"); // tile
  const rows = Object.values(data.rows).flatMap(p => Object.values(p)); // every place and measure
  const places = Object.values(data.places); // every place
  const years = Object.values(data.rows.London)[0]; // any series gives the year span
  const lastYear = years.start + years.values.length - 1; // 1981 + 45 - 1
  const ul = el("ul", "ab-stats"); // four numbers
  ul.setAttribute("aria-label", "The data in numbers"); // what the list is
  [
    ["map-pin", places.length, `places, ${places.filter(p => p.region === "UK").length} in the UK`], // how many places
    ["history", years.values.length, `years, ${years.start} to ${lastYear}`], // how far back
    ["chart-line", rows.length, "trends tested"], // place and measure pairs
    ["dices", rows[0].shuffles, "luck shuffles for each"], // the luck test
  ].forEach(([ic, n, label]) => {
    const li = el("li"); // one number
    li.innerHTML = `<svg class="icon" aria-hidden="true"><use href="icons.svg#${ic}" /></svg>`; // same icon sprite as the rest of the page
    li.append(el("strong", null, n.toLocaleString("en-GB")), el("span", null, label)); // number then what it counts
    ul.append(li); // into the list
  });
  stats.append(ul); // into the tile

  /* features list dropped: the top bar and the home cards already list every page */

  // future scope (was "where it could go next")
  const road = part("future-scope", "Future scope", "flag", "sun"); // tile
  road.append(list([
    { icon: "pin", tag: "Next", title: "Any town you type", text: "Fetch NASA data for a new place on the spot." }, // more places
    { icon: "thermometer", tag: "Next", title: "Check against stations", text: "Compare with Met Office station records." }, // validation
    { icon: "snow", tag: "Later", title: "Snow, fog and storms", text: "The weather we can’t test yet." }, // gaps
    { icon: "help", tag: "Later", title: "Why, not just what", text: "Point to likely causes, like towns growing." }, // causes
  ]));
  road.append(el("p", "part-small", "Ideas, not promises.")); // honest

  // meet the team: name, place, linkedin
  const team = part("team", "Meet the team", "users", "heat"); // tile
  team.append(el("p", "part-p", "Mostly Significant, NASA Space Apps 2026, London.")); // who we are
  const people = el("ul", "team-list"); // two rows
  TEAM.forEach(p => {
    const li = el("li", "team-row"); // one person
    const words = el("span", "team-words"); // name and place
    const where = el("span", "team-where"); // location with a pin
    where.innerHTML = icon("pin"); // the pin
    where.append(p.where); // then the place
    words.append(el("span", "team-name", p.name), where); // stacked
    const a = el("a", "team-li"); // the linkedin button
    a.href = p.linkedin; a.target = "_blank"; a.rel = "noopener"; // opens in a new tab
    a.setAttribute("aria-label", `${p.name} on LinkedIn (opens in a new tab)`); // what it is, for screen readers
    a.innerHTML = LINKEDIN; // the logo
    li.append(words, a); // words left, logo right
    people.append(li); // into the list
  });
  team.append(people); // under the line

  // demo video and slides, only once at least one link is set
  const media = part("watch", "Demo and slides", "play", "seasons"); // tile
  media.append(list([
    { icon: "play", title: "Demo video", text: "A quick walk through the site.", href: VIDEO_URL || null, tag: VIDEO_URL ? "Watch" : "Coming soon", soon: !VIDEO_URL }, // video
    { icon: "slides", title: "Slides", text: "The problem, the data and what we found.", href: SLIDES_URL || null, tag: SLIDES_URL ? "Open" : "Coming soon", soon: !SLIDES_URL }, // slides
  ]));

  grid.append(why, stats, road, team); // reading order: story and numbers, what's next, who
  if (VIDEO_URL || SLIDES_URL) grid.append(media); // no "coming soon" tiles on the live site
  s.append(grid); // into the pane
  return s; // hand it back
}

// ---------- section: common questions, on the how it works page ----------

function buildFaq() {
  const s = pane("questions", "Common questions", "help", "how"); // its own pane
  const faq = el("div", "faq-pane"); // holds the list
  const qs = el("div", "faq-list"); // the questions
  FAQ.forEach(f => {
    const d = el("details", "faq-item"); // native open and close, works with keyboards
    const sum = el("summary"); // the question row
    sum.innerHTML = icon(f.icon, "hl-icon"); // icon first
    sum.append(el("span", "faq-q", f.q)); // the question
    sum.insertAdjacentHTML("beforeend", icon("chevron", "faq-chevron")); // turns when open
    const a = el("p", "faq-a", f.a); // the answer
    if (f.link) { a.append(" "); const l = el("a", null, "Open the repo"); l.href = f.link; l.target = "_blank"; l.rel = "noopener"; a.append(l); } // repo link, new tab
    d.append(sum, a); // question then answer
    qs.append(d); // into the list
  });
  faq.append(qs); // under the heading
  s.append(faq); // into the pane
  return s; // hand it back
}

// ---------- put it on the page ----------

function build(data) {
  const main = document.querySelector("main");
  if (!main) return; // not the main page
  // each pane goes straight after its page heading, and carries its page name for pages.js
  const place = (pane, afterId, page) => {
    pane.dataset.page = page;
    const anchor = document.getElementById(afterId);
    if (anchor) anchor.after(pane); else main.append(pane);
  };
  const gut = buildGut(data); // games pane
  const about = buildAboutPane(data); // about pane
  gut.querySelector("h2").classList.add("visually-hidden"); // the page heading already says it
  about.querySelector("h2").classList.add("visually-hidden"); // same
  place(gut, "games", "games");
  place(about, "about-top", "about");
  place(buildFaq(), "how", "how"); // the questions close the how it works page
}

fetch("data/data.json") // same file app.js uses, the browser caches it
  .then(r => r.json()) // read it as json
  .then(build) // draw everything
  .catch(err => console.error("about block couldn't load data", err)); // quiet fail, the rest of the page still works
})();
