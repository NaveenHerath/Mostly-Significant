// the bottom block: odd one out game, quiz, team and the rest
// it draws itself into <div id="about-root"></div> and reads its numbers from data.json
// wrapped in its own scope so names like el or countUp can't clash with app.js
(() => {

const VIDEO_URL = ""; // paste the demo video link here when it's up
const SLIDES_URL = ""; // paste the slides link here when they're up

// odd one out rounds: one hunch, three nearby places, the odd one's verdict is "opposite" and the other two are real or leaning
// the places are picked by hand, every number and verdict still comes from data.json
// "point to" in the wording covers both real and leaning, so we never claim more than the verdict does
const ROUNDS = [
  { measure: "summer_dry_spell", question: "do summer dry spells go on longer", ask: "In two towns, summer dry spells point longer. One clearly went the other way. Which?", noun: "days, longest dry spell", places: ["Bournemouth", "Exeter", "Southampton"] }, // south coast
  { measure: "summer_dry_spell", question: "do summer dry spells go on longer", ask: "In two places, summer dry spells point longer. One clearly went the other way. Which?", noun: "days, longest dry spell", places: ["Oxford", "Bournemouth", "Cardiff"] }, // south, with cardiff over the water
  { measure: "wettest_day", question: "are downpours heavier", ask: "In two towns, the wettest day points wetter. One clearly went the other way. Which?", noun: "mm on the wettest day", places: ["Inverness", "Fort William", "Dundee"] }, // highlands
  { measure: "wettest_day", question: "are downpours heavier", ask: "In two cities, the wettest day points wetter. One clearly went the other way. Which?", noun: "mm on the wettest day", places: ["Madrid", "Lisbon", "Marrakech"] }, // iberia and morocco
  { measure: "windy_days", question: "are there more windy days", ask: "In two cities, windy days point more common. One clearly went the other way. Which?", noun: "windy days a year", places: ["Athens", "Rome", "Cairo"], showCaveat: true }, // mediterranean, model wind is shaky so we say so
];

// verdict wording, same as hunches.js, copied so this file doesn't depend on load order
const VERDICT_LABELS = { real: "Yes, it’s real", leaning: "Leaning that way", not_backed: "Not backed by the data", opposite: "It’s actually the opposite" };

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; // people who asked for less movement get no count-up

// small helper to make an element with a class and some text
function el(tag, cls, text) {
  const e = document.createElement(tag); // the element
  if (cls) e.className = cls; // its class, if any
  if (text != null) e.textContent = text; // its text, if any
  return e; // hand it back
}

// a section pane shaped like the rest of the page, with an icon and heading
function section(id, title, iconPaths) {
  const s = el("section", "step about"); // same glass pane as every other step
  s.id = id; // so the nav can link to it
  s.setAttribute("aria-labelledby", id + "-h"); // the heading names the section
  const h = el("h2"); // the heading
  h.id = id + "-h"; // id for aria
  h.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${iconPaths}</svg>`; // line icon drawn inline, icons.svg is T2's file
  h.append(title); // then the words
  s.append(h); // heading goes in first
  return s; // caller fills the rest
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
    const eased = 1 - Math.pow(1 - t, 3); // eases out so it settles gently
    node.textContent = fmt(target * eased); // show the in-between value
    if (t < 1) requestAnimationFrame(tick); // keep going till the end
  }
  requestAnimationFrame(tick); // kick it off
  setTimeout(() => { node.textContent = fmt(target); }, dur + 50); // safety net: land on the real number even if frames get paused
}

// shuffle a copy of a list so the odd one isn't always in the same spot
function shuffled(list) {
  const a = list.slice(); // copy so we don't mess up the original
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } // fisher-yates
  return a; // shuffled copy
}

// ---------- 1. odd one out ----------

function buildOddOneOut(data) {
  // self-check: exactly one place is "opposite", the other two are "real" or "leaning", straight from the data
  const rounds = ROUNDS.filter(r => {
    const rows = r.places.map(p => data.rows[p] && data.rows[p][r.measure]); // each place's numbers
    const verdicts = rows.map(row => row && row.verdict); // their verdicts
    const ok = rows.every(Boolean) && verdicts.filter(v => v === "opposite").length === 1 && verdicts.every(v => ["opposite", "real", "leaning"].includes(v)); // one opposite, rest real or leaning
    console.assert(ok, "odd one out round doesn't match its verdict rule:", r.measure, r.places, verdicts); // shout in the console if the data changed
    return ok; // drop broken rounds rather than show a wrong answer
  });
  if (!rounds.length) return null; // nothing usable, skip the section

  const s = section("odd-one-out", "Odd one out", '<circle cx="6" cy="12" r="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M18 9.5v5M15.5 12h5"/>'); // three dots, one different
  s.append(el("p", "note", "Three nearby places, one hunch. Spot the one that clearly went the other way.")); // how to play

  const hunch = el("p", "odd-hunch"); // the hunch, small, ties back to the site title
  const q = el("p", "odd-q"); // the actual question, big
  const cards = el("div", "odd-cards"); // the three town cards
  const foot = el("div", "odd-foot"); // feedback and next button
  const msg = el("p", "odd-msg"); // "nice" or "not quite"
  msg.setAttribute("aria-live", "polite"); // read out the result
  const next = el("button", "pill pill-primary odd-next", "Next round"); // go on
  next.type = "button"; // not a form submit
  const progress = el("p", "odd-progress"); // round 2 of 5, and score
  foot.append(next, msg); // button first so it never moves, message underneath
  const caveat = el("p", "note odd-caveat"); // the data's own warning, only on rounds that need it
  s.append(progress, hunch, q, cards, caveat, foot); // put it together

  let round = 0; // which round we're on
  let score = 0; // how many right

  // draw one round
  function show() {
    const r = rounds[round]; // this round
    progress.textContent = `Round ${round + 1} of ${rounds.length}`; // where we are
    hunch.textContent = `Is it just me, or ${r.question}?`; // the hunch, worded like the title
    q.textContent = r.ask; // what to look for, said straight
    const oddPlace = r.places.find(p => data.rows[p][r.measure].verdict === "opposite"); // the answer
    caveat.textContent = r.showCaveat ? data.rows[oddPlace][r.measure].caveat : ""; // live caveat from data.json, empty otherwise
    caveat.hidden = !r.showCaveat; // no empty gap on the other rounds
    cards.replaceChildren(); // clear last round's cards
    msg.textContent = ""; // no result yet
    next.classList.add("is-waiting"); // no next till they pick (invisible, but keeps its spot)
    shuffled(r.places).forEach(place => {
      const row = data.rows[place][r.measure]; // this town's numbers
      const odd = place === oddPlace; // is this the one
      const b = el("button", "odd-card"); // the whole card is the button
      b.type = "button"; // not a form submit
      b.dataset.odd = odd; // remember the answer for the reveal
      const up = row.late > row.early; // which way this town actually went
      const result = el("span", "odd-result"); // the reveal, hidden till they pick
      result.innerHTML = `<svg class="icon odd-dir" viewBox="0 0 24 24" aria-hidden="true"><path d="${up ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M5 12l7 7 7-7"}"/></svg>` + // big arrow, up or down
        `<span class="odd-word" data-verdict="${row.verdict}">${VERDICT_LABELS[row.verdict]}</span>` + // the site's own verdict for this place
        `<span class="odd-nums"><span class="odd-then"></span><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg><span class="odd-now"></span></span>` + // then -> now
        `<span class="odd-noun">${r.noun}</span>`; // what the numbers mean
      result.dataset.then = row.early; // 1981-1990 average
      result.dataset.now = row.late; // 2016-2025 average
      b.append(el("span", "odd-place", place), result); // town on top, answer underneath
      b.addEventListener("click", () => pick(b)); // their pick
      cards.append(b); // into the row
    });
  }

  // they picked a card: reveal all three
  function pick(chosen) {
    const right = chosen.dataset.odd === "true"; // did they find it
    if (right) score++; // keep score
    cards.querySelectorAll(".odd-card").forEach(c => {
      c.disabled = true; // one go per round
      c.classList.add("revealed"); // show the numbers
      if (c.dataset.odd === "true") c.classList.add("is-right"); // the real odd one always goes green
      else if (c === chosen) c.classList.add("is-wrong"); // a wrong pick goes red
      const res = c.querySelector(".odd-result"); // the hidden answer
      countUp(res.querySelector(".odd-then"), +res.dataset.then); // count up then
      countUp(res.querySelector(".odd-now"), +res.dataset.now); // and now
    });
    msg.textContent = right ? "Right answer!" : "Not quite. Even nearby places can disagree."; // short feedback
    if (typeof window.recordGuess === "function") window.recordGuess(right); // tell the gut score bar, if it's on the page
    const last = round === rounds.length - 1; // was that the final round
    next.textContent = last ? "Play again" : "Next round"; // button wording
    next.classList.remove("is-waiting"); // show it
    if (last) msg.textContent += ` You spotted ${score} of ${rounds.length}.`; // final score
  }

  // next round, or start over after the last one
  next.addEventListener("click", () => {
    if (round === rounds.length - 1) { round = 0; score = 0; } // start again
    else round++; // move on
    show(); // draw it
    cards.querySelector(".odd-card").focus(); // keep keyboard people in the game
  });

  show(); // first round
  return s; // hand the section back
}

// ---------- 2. real, error or quirk? ----------

// six odd-looking things from the data. answers and figures come from naveen's checks
// (data-generation/data/clean/data_checks.csv) and the Limitations part of data-generation/README.md
// figure can be a function, so it reads the live number from data.json
const QUIZ = [
  { icon: "thermometer", where: "London, 19 July 2022", figure: d => fmtUnit(Math.max(...d.rows.London.hottest_day.values), " °C"), claim: "London’s hottest day in our data. Weather stations recorded about 40 °C that day.", answer: "quirk", why: "Our numbers are averages over a 50 km square, parks and fields included, so peaks read low. The trends still hold." }, // live from data.json
  { icon: "wind", where: "London, 18 Feb 2022", figure: "20.5 m/s", claim: "Strongest wind that day. A normal top-1% windy day here is 15.2 m/s.", answer: "real", why: "That was Storm Eunice, one of the worst storms in southern England in decades." }, // data_checks.csv: 20.48 vs 99th percentile 15.2
  { icon: "snow", where: "London, December 2010", figure: "−0.3 °C", claim: "The month’s average. The coldest December in all 45 years.", answer: "real", why: "The big freeze of 2010: snow and ice across the UK for weeks." }, // data_checks.csv
  { icon: "droplet", where: "Singapore, 2025", figure: "7,465 mm", claim: "Rain that year. Singapore usually gets about 2,400 mm.", answer: "error", why: "No rain gauge there shows it. NASA’s rain data for Singapore breaks in January 2021, so we cut it off there and use 1981 to 2020." }, // README limitations
  { icon: "moon", where: "Toronto", figure: "1.0 °C", claim: "How fast nights seemed to warm per decade, in sudden jumps. Squares nearby: 0.3 to 0.4 °C.", answer: "error", why: "Toronto’s grid square is mostly Lake Ontario, and the lake threw the numbers off. We moved it to a land square 39 km north." }, // README, one place per grid square
  { icon: "mountain", where: "Mexico City", figure: "3 °C", claim: "How much colder our data reads than the city itself.", answer: "quirk", why: "Its grid square sits about 400 m higher than the city, and higher ground is cooler. The trends still hold." }, // README limitations
];
const QUIZ_CHOICES = [["real", "Real"], ["error", "Error"], ["quirk", "Quirk"]]; // value and button word
const QUIZ_SAY = { real: "Real.", error: "Data error.", quirk: "Quirk." }; // how the answer is said on reveal

// a number with its unit, one decimal
function fmtUnit(n, unit) {
  return n.toFixed(1) + unit; // e.g. 34.5 °C
}

function buildQuiz(data) {
  const s = section("real-error-quirk", "Real, error or quirk?", '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M11 8v3M11 14h.01"/>'); // magnifier with a !
  s.append(el("p", "note", "Every dataset has surprises. Real means it really happened. Error means the data went wrong. Quirk means the data is right but measures something a bit different. Which is which?")); // the three words explained once

  const grid = el("div", "quiz-grid"); // the six cards
  const score = el("p", "quiz-score"); // shows up when all six are done
  score.setAttribute("aria-live", "polite"); // read out the final score
  s.append(grid, score); // put it together
  let done = 0, right = 0; // progress

  QUIZ.forEach((item, i) => {
    const card = el("div", "quiz-card"); // one surprise
    const figure = typeof item.figure === "function" ? item.figure(data) : item.figure; // live number or the written one
    const where = el("p", "quiz-where"); // place and date, with a small icon
    where.innerHTML = icon(item.icon); // what kind of weather it is
    where.append(item.where); // then the words
    card.append(where, el("p", "quiz-figure", figure), el("p", "quiz-claim", item.claim)); // place, big number, what it is
    const choices = el("div", "quiz-choices"); // the three buttons
    choices.setAttribute("role", "group"); // they belong together
    choices.setAttribute("aria-label", `Real, error or quirk: ${item.where}`); // what the group is for
    const reveal = el("p", "quiz-reveal"); // the answer, filled on pick
    reveal.setAttribute("aria-live", "polite"); // read it out
    QUIZ_CHOICES.forEach(([value, word]) => {
      const b = el("button", "pill quiz-choice", word); // same pill as everywhere else
      b.type = "button"; // not a form submit
      b.addEventListener("click", () => {
        const ok = value === item.answer; // did they get it
        choices.querySelectorAll("button").forEach(x => {
          x.disabled = true; // one go per card
          if (x === b) x.classList.add(ok ? "is-right" : "is-wrong"); // their pick, green or red
          if (!ok && x.textContent === QUIZ_CHOICES.find(c => c[0] === item.answer)[1]) x.classList.add("is-answer"); // show the right one if they missed
        });
        reveal.innerHTML = `<strong>${QUIZ_SAY[item.answer]}</strong> ${item.why}`; // answer then why
        card.classList.add("revealed"); // lets the css fade the answer in
        done++; if (ok) right++; // keep count
        if (typeof window.recordGuess === "function") window.recordGuess(ok); // tell the gut score bar, if it's on the page
        if (done === QUIZ.length) score.textContent = `You got ${right} of ${QUIZ.length}.`; // all done
      });
      choices.append(b); // into the row
    });
    card.append(choices, reveal); // buttons then answer
    grid.append(card); // into the grid
  });
  return s; // hand the section back
}

// ---------- shared bits for sections 3 to 8 ----------

// small line icons, drawn inline so we don't touch icons.svg (T2's file). 24x24, stroke only
const ICONS = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
  lightbulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  thermometer: '<path d="M14 4v10.5a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  snow: '<path d="M20 15.5A4.5 4.5 0 0 0 17.5 7h-1.3A7 7 0 1 0 4 13.3"/><path d="M8 16h.01M8 20h.01M12 18h.01M12 22h.01M16 16h.01M16 20h.01"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h.01M16 16h.01M12 12h.01"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
  slides: '<path d="M3 4h18M4 4v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4M12 16v5M8 21h8"/>',
  arrow: '<path d="M7 17 17 7M8 7h9v9"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  wind: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
  droplet: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  mountain: '<path d="m3 20 6-10 4 6 2-3 6 7z"/>',
};

// one icon as svg markup
function icon(name, cls) {
  return `<svg class="icon${cls ? " " + cls : ""}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`; // hidden from screen readers, the words carry it
}

// a grid of small tiles: icon, title, one line. a tile with href becomes a link
function tiles(items) {
  const grid = el("div", "tiles"); // the grid
  items.forEach(it => {
    const t = el(it.href ? "a" : "div", "tile"); // link or plain tile
    if (it.href) t.href = it.href; // jump to that part of the page
    t.innerHTML = icon(it.icon, "tile-icon") + (it.tag ? `<span class="tile-tag">${it.tag}</span>` : ""); // icon, plus a small tag like "Next"
    t.append(el("span", "tile-title", it.title), el("span", "tile-text", it.text)); // title and one line, as text so nothing gets injected
    grid.append(t); // into the grid
  });
  return grid; // hand it back
}

// ---------- 3. what you can do ----------

function buildWhatYouCanDo() {
  const s = section("what-you-can-do", "What you can do", ICONS.compass); // heading
  s.append(tiles([
    { icon: "lightbulb", title: "Check a hunch", text: "Pick a place and a hunch, guess, then see 45 years of data.", href: "#where" }, // main flow
    { icon: "message", title: "Say it your way", text: "Type a hunch in your own words and we find the right test.", href: "#chat" }, // chat box
    { icon: "map", title: "Compare places", text: "See every town and city coloured by its verdict.", href: "#map" }, // map
    { icon: "history", title: "Watch it change", text: "Slide through the years and watch each place drift from normal.", href: "#timeline" }, // timeline
    { icon: "target", title: "Test your gut", text: "Play odd one out and real, error or quirk.", href: "#odd-one-out" }, // games above
    { icon: "share", title: "Share your score", text: "Your gut score sits in the corner after your first guess." }, // gut bar, no anchor
  ]));
  return s; // hand it back
}

// ---------- 4. why we built it ----------

function buildWhy(data) {
  const all = Object.values(data.rows).flatMap(p => Object.values(p)); // every place and measure
  const count = v => all.filter(r => r.verdict === v).length; // how many have a verdict
  const n = x => x.toLocaleString("en-GB"); // 1,142 not 1142
  const s = section("why", "Why we built it", ICONS.heart); // heading
  s.append(tiles([
    { icon: "thermometer", title: "Everyone has a hunch", text: "Summers feel longer, nights feel warmer. But memory makes a poor thermometer." }, // the problem
    { icon: "database", title: "The answers are public", text: "NASA has 45 years of daily weather for anywhere on Earth. It just comes as raw tables." }, // the gap
    { icon: "target", title: "So we made it a guess", text: "You commit first, then see the data, so you notice when your gut was off." }, // the idea
  ]));
  const facts = el("p", "why-facts"); // the headline numbers, read live
  facts.innerHTML = `We tested <strong>${n(all.length)}</strong> trends in <strong>${Object.keys(data.places).length}</strong> places. <strong>${n(count("real"))}</strong> are real. <strong>${n(count("opposite"))}</strong> went the other way.`; // numbers only, from data.json
  s.append(facts); // under the tiles
  return s; // hand it back
}

// ---------- 5. roadmap ----------

function buildRoadmap() {
  const s = section("roadmap", "Where it could go next", ICONS.flag); // heading
  s.append(el("p", "note", "Ideas, not promises.")); // honest
  s.append(tiles([
    { icon: "pin", tag: "Next", title: "Any town you type", text: "Fetch NASA data for a new place on the spot, not just our 75." }, // more places
    { icon: "thermometer", tag: "Next", title: "Check against stations", text: "Compare our trends with Met Office station records where they exist." }, // validation
    { icon: "snow", tag: "Later", title: "Snow, fog and storms", text: "Cover the weather we can’t test yet." }, // gaps
    { icon: "help", tag: "Later", title: "Why, not just what", text: "Point to likely causes, like towns heating up as they grow." }, // causes
  ]));
  return s; // hand it back
}

// ---------- 6. meet the team ----------

const TEAM = [
  { name: "Bathila Jayasiri", initials: "BJ", role: "App, visuals and data expansion", where: "Kent, UK" }, // bathila
  { name: "Naveen Herath", initials: "NH", role: "Data pipeline and stats", where: "London, UK" }, // naveen
];

function buildTeam() {
  const s = section("team", "Meet the team", ICONS.users); // heading
  s.append(el("p", "note", "Mostly Significant, NASA Space Apps 2026, London.")); // who we are
  const grid = el("div", "team-grid"); // two cards
  TEAM.forEach(p => {
    const card = el("div", "team-card"); // one person
    const badge = el("span", "team-badge", p.initials); // initials in a circle
    badge.setAttribute("aria-hidden", "true"); // the name below says it already
    const info = el("div", "team-info"); // name, role, place
    info.append(el("p", "team-name", p.name), el("p", "team-role", p.role)); // name and what they did
    const where = el("p", "team-where"); // location with a pin
    where.innerHTML = icon("pin"); // the pin
    where.append(p.where); // then the place
    info.append(where); // under the role
    card.append(badge, info); // badge left, words right
    grid.append(card); // into the grid
  });
  s.append(grid); // under the note
  return s; // hand it back
}

// ---------- 7. faq ----------

const FAQ = [
  { icon: "database", q: "Where does the data come from?", a: "NASA POWER, built on MERRA-2: satellite and ground observations combined in a weather model. Each place is a square about 50 km wide, with daily values from 1981 to 2025." },
  { icon: "thermometer", q: "Why doesn’t London show 40 °C in 2022?", a: "A 50 km square averages parks, fields and rivers with the city, so peaks read low. Our London shows 34.5 °C that day. The trends still hold." },
  { icon: "check", q: "What makes a trend “real”?", a: "A Mann-Kendall test (with the Hamed-Rao fix, since one year tends to be like the next) says it’s very unlikely to be chance, and it goes the way the hunch says. Sen’s slope gives the change per decade." },
  { icon: "dice", q: "What is the luck test?", a: "We shuffle the 45 years into random order 1,000 times and count how often a trend this strong shows up anyway. Fewer means less likely to be luck." },
  { icon: "trend", q: "What does “leaning” mean?", a: "It points the way the hunch says, but we can’t rule out luck yet. Rain often lands here because it jumps around a lot." },
  { icon: "help", q: "Does this prove climate change?", a: "It shows what changed in each place, not why. It’s a fact-check for hunches, not an attribution study." },
  { icon: "code", q: "Can I see how it works?", a: "Yes, all the code and data steps are on GitHub.", link: "https://github.com/NaveenHerath/Mostly-Significant" },
];

function buildFaq() {
  const s = section("faq", "Questions", ICONS.help); // heading
  const list = el("div", "faq-list"); // the questions
  FAQ.forEach(f => {
    const d = el("details", "faq-item"); // native open and close, works without js tricks and with keyboards
    const sum = el("summary"); // the question row
    sum.innerHTML = icon(f.icon, "faq-icon"); // icon first
    sum.append(el("span", "faq-q", f.q)); // the question
    sum.insertAdjacentHTML("beforeend", icon("chevron", "faq-chevron")); // turns when open
    const a = el("p", "faq-a", f.a); // the answer
    if (f.link) { const l = el("a", null, " Open the repo"); l.href = f.link; l.target = "_blank"; l.rel = "noopener"; a.append(l); } // repo link, new tab
    d.append(sum, a); // question then answer
    list.append(d); // into the list
  });
  s.append(list); // under the heading
  return s; // hand it back
}

// ---------- 8. demo video and slides ----------

function buildMedia() {
  const s = section("watch", "Demo and slides", ICONS.play); // heading
  const grid = el("div", "media-grid"); // two cards
  [
    { url: VIDEO_URL, icon: "play", title: "Demo video", text: "A quick walk through the site.", cta: "Watch" }, // video
    { url: SLIDES_URL, icon: "slides", title: "Slides", text: "The pitch: the problem, the data and what we found.", cta: "Open slides" }, // slides
  ].forEach(m => {
    const card = el(m.url ? "a" : "div", "media-card" + (m.url ? "" : " is-soon")); // a link once there's a url, a plain card till then
    if (m.url) { card.href = m.url; card.target = "_blank"; card.rel = "noopener"; } // opens in a new tab
    card.innerHTML = icon(m.icon, "media-icon"); // big icon
    card.append(el("span", "media-title", m.title), el("span", "media-text", m.text)); // what it is
    const foot = el("span", "media-cta", m.url ? m.cta : "Coming soon"); // call to action or placeholder
    if (m.url) foot.insertAdjacentHTML("beforeend", icon("arrow")); // little arrow on real links
    card.append(foot); // at the bottom
    grid.append(card); // into the grid
  });
  s.append(grid); // under the heading
  return s; // hand it back
}

// ---------- put it all on the page ----------

function buildAbout(data) {
  const root = document.getElementById("about-root"); // where it all goes
  if (!root) return; // page doesn't have the slot yet
  [buildOddOneOut, buildQuiz, buildWhatYouCanDo, buildWhy, buildRoadmap, buildTeam, buildFaq, buildMedia].forEach(build => { // one builder per section, in page order
    const s = build(data); // make the section
    if (s) root.append(s); // add it if it built
  });
}

fetch("data/data.json") // same file app.js uses, the browser caches it
  .then(r => r.json()) // read it as json
  .then(buildAbout) // draw everything
  .catch(err => console.error("about block couldn't load data", err)); // quiet fail, the rest of the page still works
})();
