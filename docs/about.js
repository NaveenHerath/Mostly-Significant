// the bottom block: odd one out game, quiz, team and the rest
// it draws itself into <div id="about-root"></div> and reads its numbers from data.json

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
  { where: "London, 19 July 2022", figure: d => fmtUnit(Math.max(...d.rows.London.hottest_day.values), " °C"), claim: "London’s hottest day in our data. Weather stations recorded about 40 °C that day.", answer: "quirk", why: "Our numbers are averages over a 50 km square, parks and fields included, so peaks read low. The trends still hold." }, // live from data.json
  { where: "London, 18 Feb 2022", figure: "20.5 m/s", claim: "Strongest wind that day. A normal top-1% windy day here is 15.2 m/s.", answer: "real", why: "That was Storm Eunice, one of the worst storms in southern England in decades." }, // data_checks.csv: 20.48 vs 99th percentile 15.2
  { where: "London, December 2010", figure: "−0.3 °C", claim: "The month’s average. The coldest December in all 45 years.", answer: "real", why: "The big freeze of 2010: snow and ice across the UK for weeks." }, // data_checks.csv
  { where: "Singapore, 2025", figure: "7,465 mm", claim: "Rain that year. Singapore usually gets about 2,400 mm.", answer: "error", why: "No rain gauge there shows it. NASA’s rain data for Singapore breaks in January 2021, so we cut it off there and use 1981 to 2020." }, // README limitations
  { where: "Toronto", figure: "1.0 °C", claim: "How fast nights seemed to warm per decade, in sudden jumps. Squares nearby: 0.3 to 0.4 °C.", answer: "error", why: "Toronto’s grid square is mostly Lake Ontario, and the lake threw the numbers off. We moved it to a land square 39 km north." }, // README, one place per grid square
  { where: "Mexico City", figure: "3 °C", claim: "How much colder our data reads than the city itself.", answer: "quirk", why: "Its grid square sits about 400 m higher than the city, and higher ground is cooler. The trends still hold." }, // README limitations
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
    card.append(el("p", "quiz-where", item.where), el("p", "quiz-figure", figure), el("p", "quiz-claim", item.claim)); // place, big number, what it is
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

// ---------- put it all on the page ----------

function buildAbout(data) {
  const root = document.getElementById("about-root"); // where it all goes
  if (!root) return; // page doesn't have the slot yet
  [buildOddOneOut, buildQuiz].forEach(build => { // one builder per section, in page order
    const s = build(data); // make the section
    if (s) root.append(s); // add it if it built
  });
}

fetch("data/data.json") // same file app.js uses, the browser caches it
  .then(r => r.json()) // read it as json
  .then(buildAbout) // draw everything
  .catch(err => console.error("about block couldn't load data", err)); // quiet fail, the rest of the page still works
