// the logic for the page: load the data, handle the picks, show the answer
// nothing here does stats, it only looks things up in data.json and formats them

const $ = (id) => document.getElementById(id); // short way to grab an element by id

let DATA = null; // the whole data.json once it's loaded

// what the user has picked so far
const state = {
  region: "UK", // uk or world
  place: "London", // starting place (never delhi, per naveen)
  topic: "heat", // starting topic
  measure: "heatwave_days", // starting hunch: "summers are getting hotter"
  guess: null, // null until they guess, then yes / no / unsure
};

// ---------- formatting helpers ----------

const isDate = (unit) => unit === "day of year"; // date measures need showing as e.g. 14 Jun

function doyToDate(doy) { // turns a day of year into "14 Jun"
  const d = new Date(Date.UTC(2001, 0, 1) + (Math.round(doy) - 1) * 86400000); // 2001 isn't a leap year, so day 1 = 1 jan
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }); // e.g. "14 Jun"
}

function fmtNum(v, digits) { // tidy number: one decimal, but whole numbers once it's in the thousands
  const max = digits ?? (Math.abs(v) >= 1000 ? 0 : 1); // use the decimals we're told, or pick sensibly
  return v.toLocaleString("en-GB", { minimumFractionDigits: digits ?? 0, maximumFractionDigits: max }); // 7.2, 107.7, 2,431
}

function decimalsOf(v) { // how many decimals fmtNum shows for this number
  return (fmtNum(v).split(".")[1] || "").length; // "18.7" -> 1, "4,198" -> 0
}

function fmtValue(v, unit, digits) { // a value in its unit, dates as dates
  return isDate(unit) ? doyToDate(v) : fmtNum(v, digits); // dates read better than "day 202"
}

const SINGULAR = { days: "day", nights: "night", heatwaves: "heatwave" }; // units that need a singular form

function unitFor(numText, unit) { // "1 day" not "1 days"
  return numText === "1" && SINGULAR[unit] ? SINGULAR[unit] : unit; // only swap when it shows as exactly 1
}

// measures where sen's slope is 0 everywhere (most years are 0, so the middle slope is flat).
// for these we show the 1980s-to-now change instead of a per-decade rate, and skip the trend line
const NO_RATE = new Set(["dry_soil_days"]); // add more ids here if another measure does the same

function fmtRate(rate, unit) { // the change per decade, in words
  if (isDate(unit)) { // dates: say earlier or later
    const n = fmtNum(Math.abs(rate)); // size of the shift, formatted
    const word = rate < 0 ? "earlier" : "later"; // negative means getting earlier
    return `About ${n} ${unitFor(n, "days")} ${word}`; // e.g. "About 8 days earlier", "About 1 day later"
  }
  const sign = rate > 0 ? "+" : rate < 0 ? "−" : ""; // proper minus sign, not a hyphen
  const n = fmtNum(Math.abs(rate)); // the number without its sign
  return `${sign}${n} ${unitFor(n, unit)}`; // e.g. "+2.8 days", "+1 night", "−0.4 °C"
}

function luckCount(share, shuffles) { // share of shuffles as a count out of 1,000
  return Math.round(share * shuffles); // 0.002 -> 2
}

function fmtLuck(share, shuffles) { // "2 of 1,000" or "None of 1,000"
  const n = luckCount(share, shuffles); // how many shuffles did as well or better than the real trend
  const total = shuffles.toLocaleString("en-GB"); // "1,000"
  return n === 0 ? `None of ${total}` : `${n.toLocaleString("en-GB")} of ${total}`; // the two ways to say it
}

// ---------- count-up ----------

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)"); // does the user want less motion?
let countFrame = null; // the running animation frame, so a new one can cancel it
let countSafety = null; // backup timer that makes sure we land on the real number

function countUp(el, from, to, unit) { // ticks a number from the 80s value to the recent one
  cancelAnimationFrame(countFrame); // stop any count still going
  clearTimeout(countSafety); // and its backup timer
  const digits = isDate(unit) ? 0 : decimalsOf(to); // keep decimals steady so the digits don't jump around
  const land = () => { cancelAnimationFrame(countFrame); el.textContent = fmtValue(to, unit, digits); }; // jump to the final number
  if (reduceMotion.matches || from === to) { // no motion wanted, or nothing to count
    land(); // just show the final number
    return; // done
  }
  countSafety = setTimeout(land, 800); // browsers pause animation frames in background tabs, this makes sure we still finish
  const start = performance.now(); // when we started
  const tick = (now) => { // runs every frame
    const t = Math.min((now - start) / 700, 1); // 0 to 1 over 700ms
    const eased = 1 - Math.pow(1 - t, 3); // ease out, fast then settling
    el.textContent = fmtValue(from + (to - from) * eased, unit, digits); // in-between value, formatted
    if (t < 1) countFrame = requestAnimationFrame(tick); // keep going until we land
  };
  countFrame = requestAnimationFrame(tick); // kick it off
}

// ---------- small dom helpers ----------

function pill(label, pressed, onClick, disabled = false) { // makes one pill button
  const b = document.createElement("button"); // real button, so keyboard works for free
  b.type = "button"; // not a form submit
  b.className = "pill"; // styled in style.css
  b.textContent = label; // the words on it
  b.setAttribute("aria-pressed", pressed ? "true" : "false"); // tells screen readers it's selected
  b.disabled = disabled; // greyed out when it doesn't apply
  b.addEventListener("click", onClick); // what happens on tap
  return b; // hand it back
}

function fill(container, nodes) { // swaps out a container's contents
  container.replaceChildren(...nodes); // clears and adds in one go
}

// ---------- the bits that change ----------

function row() { // the data row for the current place and hunch
  return DATA.rows[state.place]?.[state.measure]; // undefined if this place doesn't have it
}

function placesIn(region) { // all place names in a region, in the order naveen listed them
  return Object.keys(DATA.places).filter((p) => DATA.places[p].region === region); // keeps csv order
}

function measuresFor(place, topic) { // hunches available for a place and topic
  return Object.keys(HUNCHES).filter((m) => HUNCHES[m].topic === topic && DATA.rows[place]?.[m]); // only ones with data
}

function topicHasData(place, topic) { // does this place have anything in this topic?
  return measuresFor(place, topic).length > 0; // world cities have no season hunches
}

function renderRegions() { // the uk / world switch
  fill($("regions"), ["UK", "World"].map((r) => // two options
    pill(r, state.region === r, () => setRegion(r)) // pressed if it's the current one
  ));
}

function renderPlaces() { // the place pills
  fill($("places"), placesIn(state.region).map((p) => // one pill per place in the region
    withFlag(pill(p, state.place === p, () => setPlace(p)), p) // pressed if picked, plus a flag for world cities
  ));
  const note = PLACE_NOTES[state.place]; // any warning for this place
  $("place-note").hidden = !note; // only show if there is one
  $("place-note").textContent = note || ""; // the words
}

function withFlag(b, place) { // puts a small country flag in front of a place name, if it has one
  const code = PLACE_FLAGS[place]; // e.g. "fr" for paris
  if (!code) return b; // uk towns have no flag, leave the pill as it is
  const f = document.createElement("span"); // flag-icons draws the flag as this span's background
  f.className = `fi fi-${code} flag`; // which flag, plus our own sizing class
  f.setAttribute("aria-hidden", "true"); // decoration only, the name already says where it is
  b.prepend(f); // flag before the name
  return b; // hand it back
}

function iconSvg(name) { // a small line icon from icons.svg
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); // svg element
  svg.setAttribute("class", "icon"); // styled in css (size, stroke)
  svg.setAttribute("aria-hidden", "true"); // decoration only, the label says it
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use"); // points at the symbol
  use.setAttribute("href", `icons.svg#${name}`); // which icon
  svg.appendChild(use); // put it inside
  return svg; // hand it back
}

function renderTopics() { // the topic switch
  fill($("topics"), TOPICS.map((t) => { // one per topic
    const b = pill(t.label, state.topic === t.id, () => setTopic(t.id), !topicHasData(state.place, t.id)); // disabled if no data
    b.dataset.tab = t.id; // css gives each tab its own highlight colour
    b.prepend(iconSvg(t.icon)); // icon before the word
    return b; // hand it back
  }));
  $("topic-note").hidden = state.region === "UK"; // only explain the greyed ones for world
}

let pressedPill = { measure: null, i: 0 }; // which wording of a hunch was tapped (0 = the main sentence, 1+ = a preset)
let showPresets = false; // the extra everyday wordings stay folded away until "more ways to say it" is tapped

function renderHunches() { // the hunch sentence pills: every main sentence first, then the extra everyday presets behind a toggle
  const ms = measuresFor(state.place, state.topic); // only hunches this place has
  const isPressed = (m, i) => state.measure === m && (pressedPill.measure === m ? pressedPill.i === i : i === 0); // only the tapped wording looks picked, the main one if picked some other way
  const make = (m, label, i) => pill(label, isPressed(m, i), () => { pressedPill = { measure: m, i }; setMeasure(m); }); // every wording picks the same hunch
  const presets = ms.flatMap((m) => (HUNCHES[m].presets || []).map((p, j) => make(m, p, j + 1))); // all the extra wordings
  const open = showPresets || presets.some((b) => b.getAttribute("aria-pressed") === "true"); // never hide the one that's picked
  const toggle = document.createElement("button"); // the "more ways to say it" switch
  toggle.type = "button"; // not a form submit
  toggle.className = "pill pill-more"; // quieter than the hunch pills
  toggle.textContent = open ? "Fewer" : "More ways to say it"; // says what tapping does
  toggle.setAttribute("aria-expanded", open ? "true" : "false"); // tells screen readers whether the extras are showing
  toggle.addEventListener("click", () => { showPresets = !open; renderHunches(); $("hunches").querySelector(".pill-more").focus(); }); // flip it, redraw, keep keyboard focus on the switch
  fill($("hunches"), [...ms.map((m) => make(m, HUNCHES[m].text, 0)), ...(open ? presets : []), ...(presets.length ? [toggle] : [])]); // main sentences, extras if open, switch last
}

function renderGuess() { // the claim line and the three guess buttons
  $("claim").textContent = `Is it just me, or ${HUNCHES[state.measure].question} in ${state.place}?`; // e.g. "Is it just me, or are downpours heavier in London?"
  fill($("guesses"), GUESSES.map((g) => // three buttons
    pill(g.label, state.guess === g.id, () => setGuess(g.id)) // pressed once chosen
  ));
}

function renderResult() { // fills the result card (styling comes later)
  const r = row(); // current data row
  const unit = DATA.measures[state.measure].unit; // its unit
  const v = VERDICTS[r.verdict]; // verdict wording

  $("result").dataset.verdict = r.verdict; // lets css colour the card by verdict
  $("verdict").textContent = v.label; // e.g. "Yes, it's real"
  $("verdict-line").textContent = v.line; // e.g. "The data backs your hunch."
  $("gut").textContent = GUT[state.guess][r.verdict]; // e.g. "Your gut was right."
  $("then").textContent = fmtValue(r.early, unit); // 1980s average
  countUp($("now"), r.early, r.late, unit); // recent average, ticking up (or down) from the 80s number
  $("noun").textContent = HUNCHES[state.measure].noun; // what the numbers mean
  const noRate = NO_RATE.has(state.measure); // dry soil days and the like have no usable rate
  $("rate-label").textContent = noRate ? "Change since the 1980s" : "Change per decade"; // say which kind of change it is
  $("rate").textContent = fmtRate(noRate ? r.late - r.early : r.rate, unit); // recent minus 1980s, or sen's slope per decade
  $("luck-short").textContent = fmtLuck(r.share, r.shuffles); // e.g. "692 of 1,000"
  $("caveat").textContent = r.caveat; // honest limitation
}

// ---------- chart (step 5) ----------

function renderChart() { // yearly values, the trend line and the two decade averages
  const box = $("chart-box"); // where the chart goes
  const r = row(); // current data row
  const unit = DATA.measures[state.measure].unit; // its unit
  const date = isDate(unit); // date measures get date labels on the side
  const end = r.start + r.values.length - 1; // last year (2025)
  const series = r.values.map((v, i) => ({ year: r.start + i, value: v ?? NaN })); // one point per year, NaN makes a gap (plot reads null as 0)
  const noRate = NO_RATE.has(state.measure); // no trend line for these, it would just sit flat at 0
  const slope = r.rate / 10; // sen's slope per year
  const trendAt = (y) => r.intercept + slope * y; // trend line height for a year (intercept came from make_data.py)
  const width = box.clientWidth || 680; // fill the box
  const small = width < 560; // phones get fewer ticks and a shorter chart
  const fmt = (v) => fmtValue(v, unit); // same formatting as the card

  const chart = Plot.plot({ // build the svg
    width, // full width of the box
    height: small ? 260 : 340, // shorter on phones
    marginLeft: date ? 56 : 44, // room for the side labels (dates are wider)
    marginRight: 12, marginTop: 24, marginBottom: 28, // a bit of room round the edges
    style: { background: "transparent", fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--color-muted)", overflow: "visible" }, // match the page
    ariaLabel: `${DATA.measures[state.measure].name} in ${state.place}, ${r.start} to ${end}`, // for screen readers
    x: { label: null, tickFormat: "d", ticks: small ? 4 : 8 }, // plain years, no "1,990"
    y: { label: null, grid: true, ticks: small ? 4 : 6, tickFormat: date ? doyToDate : undefined }, // faint grid, dates where needed
    marks: [
      Plot.lineY(series, { x: "year", y: "value", className: "yearly", strokeWidth: 1 }), // thin line joining the years, breaks at gaps
      Plot.dot(series, { x: "year", y: "value", r: 2.5, className: "yearly-dot" }), // one dot per year
      Plot.ruleY([r.early], { x1: r.start, x2: 1990, className: "avg", strokeDasharray: "4 4", strokeWidth: 1.5 }), // 1980s average, dashed
      Plot.ruleY([r.late], { x1: 2016, x2: end, className: "avg", strokeDasharray: "4 4", strokeWidth: 1.5 }), // recent average, dashed
      Plot.text([r.early], { x: r.start, y: (d) => d, text: () => `1980s: ${fmt(r.early)}`, dy: -9, textAnchor: "start", className: "avg-label" }), // label it
      Plot.text([r.late], { x: end, y: (d) => d, text: () => `Recent: ${fmt(r.late)}`, dy: -9, textAnchor: "end", className: "avg-label" }), // label it
      noRate ? null : Plot.link([0], { x1: r.start, y1: trendAt(r.start), x2: end, y2: trendAt(end), className: "trend", strokeWidth: 2.5 }), // the trend, straight from sen's slope (none when the slope is meaningless)
      Plot.tip(series.filter((d) => !isNaN(d.value)), Plot.pointerX({ x: "year", y: "value", title: (d) => `${d.year}: ${fmt(d.value)}` })), // hover or tap a year
    ],
  });
  box.replaceChildren(chart); // swap in the new chart

  const gaps = r.values.some((v) => v === null); // any missing years?
  $("chart-note").textContent = (noRate ? "Dots are single years, the dashed lines are the averages." : "Dots are single years. The coloured line is the trend, the dashed lines are the averages.") + (gaps ? " Gaps are years when it didn’t happen." : ""); // short key
}

// ---------- luck dots (step 6) ----------

const SVG_NS = "http://www.w3.org/2000/svg"; // needed to make svg elements from js

function renderLuck() { // 1,000 dots, the lit ones are shuffles that matched the real trend
  const r = row(); // current data row
  const n = luckCount(r.share, r.shuffles); // how many shuffles did as well
  const cols = 40, rows = Math.ceil(r.shuffles / cols), gap = 10; // 40 across, 25 down, 10 units apart
  const svg = document.createElementNS(SVG_NS, "svg"); // the grid
  svg.setAttribute("viewBox", `0 0 ${cols * gap} ${rows * gap}`); // scales to fit the box
  svg.setAttribute("role", "img"); // treat it as one picture
  svg.setAttribute("aria-label", `${fmtLuck(r.share, r.shuffles)} shuffles matched the real trend`); // what it shows, in words
  for (let i = 0; i < r.shuffles; i++) { // one circle per shuffle
    const c = document.createElementNS(SVG_NS, "circle"); // a dot
    c.setAttribute("cx", (i % cols) * gap + gap / 2); // column
    c.setAttribute("cy", Math.floor(i / cols) * gap + gap / 2); // row
    c.setAttribute("r", 3.2); // dot size
    c.setAttribute("class", i < n ? "dot hit" : "dot"); // first n are lit, reading order so it's easy to see the share
    svg.appendChild(c); // add it
  }
  $("dots").replaceChildren(svg); // swap in the new grid

  const line = n === 0 ? "Not one shuffle matched it. Luck can’t explain this." // none at all
    : n < 10 ? `Only ${n} of ${r.shuffles.toLocaleString("en-GB")} matched it. Luck hardly ever does this.` // very rare
    : n < 50 ? `${n} of ${r.shuffles.toLocaleString("en-GB")} matched it. Luck rarely does this.` // rare
    : n < 200 ? `${n} of ${r.shuffles.toLocaleString("en-GB")} matched it. Luck does this now and then.` // sometimes
    : `${n} of ${r.shuffles.toLocaleString("en-GB")} matched it. Luck does this a lot, so it could just be chance.`; // often
  $("luck-line").textContent = line; // show it
}

// ---------- map (step 7) ----------

let map = null; // the leaflet map, made once
let pins = null; // layer holding the pins, cleared each time

function renderMap() { // every place coloured by its verdict for the current hunch
  if (!map) { // first time only
    map = L.map("map-box", { scrollWheelZoom: false, dragging: !L.Browser.mobile, zoomSnap: 0.25, maxZoom: 7, minZoom: 1 }); // no scroll hijack, no drag trap on phones
    map.createPane("land").style.zIndex = 250; // own layer for the land so it always sits under the pins
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>'); // plain text credit, without leaflet's default flag icon
    map.attributionControl.addAttribution('Borders: <a href="https://www.naturalearthdata.com/">Natural Earth</a>'); // credit for the outlines
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json") // country outlines, no api key needed (carto tiles want one now)
      .then((res) => res.json()) // turn it into an object
      .then((world) => { // once it's here
        const land = topojson.feature(world, world.objects.countries); // unpack into normal geojson
        L.geoJSON(land, { pane: "land", className: "land", interactive: false }).addTo(map); // draw it, css does the colours
      })
      .catch(() => {}); // if the outlines don't load, the pins still work on a plain background
    pins = L.layerGroup().addTo(map); // somewhere to keep the pins
  }
  map.invalidateSize(); // the box was hidden until now, so tell leaflet its real size

  pins.clearLayers(); // remove the old pins
  const here = []; // pins in the current region, for zooming
  const counts = {}; // how many places got each verdict
  for (const [p, info] of Object.entries(DATA.places)) { // every place
    const r = DATA.rows[p][state.measure]; // its row for this hunch
    if (!r) continue; // world cities don't have every hunch
    counts[r.verdict] = (counts[r.verdict] || 0) + 1; // tally it
    const current = p === state.place; // is this the place they picked?
    const pin = L.circleMarker([info.lat, info.lon], { // a round pin
      radius: current ? 10 : 7, // picked place is bigger
      className: `pin pin--${r.verdict}${current ? " pin--current" : ""}`, // css colours it by verdict
    });
    pin.bindTooltip(`${p}: ${VERDICTS[r.verdict].label}`, { direction: "top", offset: [0, -8], permanent: current }); // name and verdict, always shown for the picked place
    pin.addTo(pins); // put it on the map
    if (info.region === state.region) here.push([info.lat, info.lon]); // remember it for zooming
  }
  map.fitBounds(here, { padding: [32, 32], maxZoom: 6 }); // zoom to the uk or the world

  fill($("legend"), Object.keys(VERDICTS).filter((v) => counts[v]).map((v) => { // one legend row per verdict that turns up
    const li = document.createElement("li"); // list item
    li.dataset.verdict = v; // css colours the swatch
    li.textContent = `${VERDICTS[v].label} (${counts[v]})`; // e.g. "Yes, it's real (11)"
    return li; // hand it back
  }));
  $("map-note").textContent = `Every place we have, coloured by its verdict for “${HUNCHES[state.measure].text}”.`; // which hunch the colours are for
}

let resizeTimer = null; // so we don't redraw the chart on every pixel of a resize
window.addEventListener("resize", () => { // window changed size
  clearTimeout(resizeTimer); // cancel the last one
  resizeTimer = setTimeout(() => { if (!$("reveal").hidden) renderChart(); }, 150); // redraw once things settle
});

function render() { // redraws everything from the current state
  document.body.dataset.accent = HUNCHES[state.measure].accent; // css swaps the accent colour to this hunch's
  renderRegions(); // uk / world
  renderPlaces(); // place pills
  renderTopics(); // topic switch
  renderHunches(); // hunch pills
  renderGuess(); // claim and guess buttons
  updateExamples(); // hero examples that fit this place
  const show = state.guess !== null && !!row(); // only reveal after a guess
  $("reveal").hidden = !show; // hide or show the results
  document.querySelectorAll(".needs-answer").forEach((a) => { a.hidden = !show; }); // bar link to the map only once there's an answer
  if (show) { // answer is showing
    renderResult(); // the card
    renderChart(); // year by year
    renderLuck(); // the 1,000 dots
    renderMap(); // every place
  }
  saveToUrl(); // keep the address bar in sync
}

// ---------- changing the picks ----------

function setRegion(region) { // switching uk / world
  if (region === state.region) return; // nothing to do
  state.region = region; // remember it
  state.place = placesIn(region)[0]; // jump to the first place there (london or new york)
  fixTopicAndMeasure(); // make sure the hunch still exists there
  state.guess = null; // new question, so hide the answer again
  render(); // redraw
}

function setPlace(place) { // tapping a place
  state.place = place; // remember it
  fixTopicAndMeasure(); // world cities don't have every hunch
  state.guess = null; // hide the answer until they guess again
  render(); // redraw
}

function setTopic(topic) { // tapping a topic
  state.topic = topic; // remember it
  state.measure = measuresFor(state.place, topic)[0]; // pick the first hunch in it
  state.guess = null; // new question
  render(); // redraw
}

function setMeasure(m) { // tapping a hunch
  state.measure = m; // remember it
  state.guess = null; // new question
  render(); // redraw
}

// ---------- gut score (the bar in the corner) ----------

const gutScore = { right: 0, total: 0 }; // this visit only, resets on refresh

function gutRight(guess, verdict) { // was this guess right? true / false, or null for "no idea"
  if (guess === "unsure") return null; // no guess, doesn't count
  return (guess === "yes") === (verdict === "real" || verdict === "leaning"); // "true" wins on real or leaning, "not so" wins on the other two
}

function recordGuess(correct) { // add one guess to the score. the chat and the games at the bottom call this too
  if (typeof correct !== "boolean") return; // ignore "no idea" and anything odd
  gutScore.total += 1; // one more guess
  if (correct) gutScore.right += 1; // and one more right
  $("gut-score").textContent = `${gutScore.right} of ${gutScore.total} right`; // e.g. "3 of 4 right"
  $("gutbar").hidden = false; // show the bar (first time it fades up)
}
window.recordGuess = recordGuess; // so about.js can call window.recordGuess(true)

$("gut-share").addEventListener("click", async () => { // share the score
  const btn = $("gut-share"); // the button
  const text = `My gut was right ${gutScore.right} of ${gutScore.total} times on Is it just me?`; // what gets shared
  const url = location.origin + location.pathname; // the site, without whatever hunch is in the address
  if (navigator.share) { // phones (and some laptops) have a share sheet
    try { await navigator.share({ text, url }); } catch { /* they closed it, fine */ } // open it
    return; // done
  }
  try { await navigator.clipboard.writeText(`${text} ${url}`); btn.textContent = "Copied"; } // no share sheet: copy it instead
  catch { btn.textContent = "Couldn’t copy"; } // clipboard blocked
  setTimeout(() => { btn.textContent = "Share"; }, 1600); // back to normal after a moment
});

// ---------- stats strip count-up (in how it works) ----------

const statsBox = document.querySelector(".stats"); // the four numbers
if (statsBox && !reduceMotion.matches && "IntersectionObserver" in window) { // skip it when motion is turned down, the real numbers are already in the html
  const seen = new IntersectionObserver((entries) => { // fires when the strip comes on screen
    if (!entries[0].isIntersecting) return; // not yet
    seen.disconnect(); // only ever once
    statsBox.querySelectorAll("strong").forEach((el) => { // each number
      const to = Number(el.textContent.replace(/,/g, "")); // e.g. 1142
      const start = performance.now(); // when it started
      const tick = (now) => { // every frame
        const t = Math.min((now - start) / 700, 1); // 0 to 1 over 700ms, same as the result card
        el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3))).toLocaleString("en-GB"); // ease out, with the comma
        if (t < 1) requestAnimationFrame(tick); // keep going until it lands
      };
      requestAnimationFrame(tick); // go
    });
  }, { threshold: 0.6 }); // most of it has to be showing
  seen.observe(statsBox); // start watching
}

function setGuess(g) { // tapping a guess button
  const first = state.guess === null; // was the answer hidden until now?
  state.guess = g; // remember it
  if (first && row()) recordGuess(gutRight(g, row().verdict)); // only the first guess on a question counts, changing your mind doesn't
  render(); // redraw, which reveals the answer
  if (first) $("result").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" }); // bring the answer into view
}

function fixTopicAndMeasure() { // keeps topic and hunch valid for the current place
  if (!topicHasData(state.place, state.topic)) state.topic = "heat"; // fall back to heat (everyone has it)
  const ok = measuresFor(state.place, state.topic); // hunches available now
  if (!ok.includes(state.measure)) state.measure = ok[0]; // keep the hunch if we can, else the first one
}

// ---------- the address bar ----------

function saveToUrl() { // puts the picks in the url so links can be shared
  const q = new URLSearchParams({ place: state.place, hunch: state.measure }); // always save these
  if (state.guess) q.set("guess", state.guess); // only save the guess once there is one
  history.replaceState(null, "", `?${q}`); // update the address without reloading
}

function loadFromUrl() { // reads the picks back from a shared link
  const q = new URLSearchParams(location.search); // the bit after the ?
  const place = q.get("place"); // e.g. "Plymouth"
  if (place && DATA.places[place]) { // only if it's a real place
    state.place = place; // use it
    state.region = DATA.places[place].region; // and its region
  }
  const m = q.get("hunch"); // e.g. "summer_dry_spell"
  if (m && HUNCHES[m] && DATA.rows[state.place][m]) { // only if this place has it
    state.measure = m; // use it
    state.topic = HUNCHES[m].topic; // and its topic
  }
  fixTopicAndMeasure(); // just in case something didn't line up
  const g = q.get("guess"); // yes / no / unsure
  if (GUT[g] && state.measure === m) state.guess = g; // only keep the guess if we landed on the hunch the link asked for
}

// ---------- top bar ----------

const menuBtn = document.querySelector(".menu-btn"); // the phone menu button
const siteNav = $("site-nav"); // the links

function setMenu(open) { // opens or closes the phone menu
  menuBtn.setAttribute("aria-expanded", open ? "true" : "false"); // tells screen readers, css shows the panel off this
}
menuBtn.addEventListener("click", () => setMenu(menuBtn.getAttribute("aria-expanded") !== "true")); // tap toggles it
siteNav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); }); // picking a link closes it
document.addEventListener("keydown", (e) => { // escape closes it
  if (e.key === "Escape" && menuBtn.getAttribute("aria-expanded") === "true") { setMenu(false); menuBtn.focus(); } // and puts focus back on the button
});

const visible = new Map(); // which sections are in the middle band of the screen right now
const watcher = new IntersectionObserver((entries) => { // the browser tells us when sections cross the band
  for (const e of entries) visible.set(e.target, e.isIntersecting); // remember each one
  const current = [...visible].find(([el, on]) => on && el.offsetParent !== null)?.[0]; // first visible one that isn't hidden
  const key = current?.dataset.nav; // which bar link it belongs to
  siteNav.querySelectorAll("a").forEach((a) => { // every bar link
    if (a.dataset.nav === key) a.setAttribute("aria-current", "true"); // highlight the matching one
    else a.removeAttribute("aria-current"); // and clear the rest
  });
}, { rootMargin: "-45% 0px -50% 0px" }); // a thin band just above the middle of the screen
document.querySelectorAll("main [data-nav]").forEach((s) => watcher.observe(s)); // watch every section that has a bar link

function watchNavTargets() { // sections made later by about.js (test your gut, about) get watched too, once they exist
  siteNav.querySelectorAll("a[data-nav]").forEach((a) => { // every bar link
    const target = document.querySelector(a.getAttribute("href")); // the section it jumps to
    if (!target || target.dataset.nav) return; // not there yet, or already watched
    target.dataset.nav = a.dataset.nav; // tie it to the link
    watcher.observe(target); // and watch it
  });
}
watchNavTargets(); // anything already on the page
const aboutRoot = $("about-root"); // T1's block fills this after the page loads
if (aboutRoot) new MutationObserver(watchNavTargets).observe(aboutRoot, { childList: true, subtree: true }); // catch its sections as they arrive

// ---------- hero video ----------

const heroVideo = document.querySelector(".hero-video"); // the background timelapse
const heroToggle = document.querySelector(".hero-toggle"); // its pause / play button
const phoneScreen = window.matchMedia("(max-width: 40rem)"); // same breakpoint as the css
let heroPausedByUser = false; // remembers if they hit pause, so we never restart it behind their back
let heroOnScreen = true; // is the hero in view, no point playing it when scrolled away

function heroAllowed() { // should the video run at all?
  const saveData = navigator.connection && navigator.connection.saveData; // data saver turned on
  return !reduceMotion.matches && !saveData; // not for reduced motion or data saver, they keep the still frame
}

function updateHeroVideo() { // starts, pauses or unloads the video to match the situation
  if (!heroVideo) return; // page without a hero
  if (!heroAllowed()) { // motion not wanted
    heroVideo.pause(); // stop it
    heroVideo.classList.remove("is-playing"); // back to the still frame
    heroToggle.hidden = true; // nothing to pause
    return; // done
  }
  const src = phoneScreen.matches ? heroVideo.dataset.srcPhone : heroVideo.dataset.srcWide; // the right size file for this screen
  if (heroVideo.getAttribute("src") !== src) heroVideo.setAttribute("src", src); // only swap when it changes, so it doesn't restart
  if (heroPausedByUser || !heroOnScreen) heroVideo.pause(); // paused by them, or scrolled away
  else heroVideo.play().catch(() => {}); // play, and quietly keep the still frame if the browser refuses
}

if (heroVideo) { // wire it all up
  heroVideo.addEventListener("playing", () => { // first frame is actually moving
    heroVideo.classList.add("is-playing"); // fade the video in over the still frame
    heroToggle.hidden = false; // now there's something to pause
  });
  heroToggle.addEventListener("click", () => { // pause / play
    heroPausedByUser = !heroPausedByUser; // flip it
    heroToggle.setAttribute("aria-pressed", heroPausedByUser ? "true" : "false"); // css swaps the glyph off this
    heroToggle.querySelector(".visually-hidden").textContent = heroPausedByUser ? "Play background video" : "Pause background video"; // label says what a tap will do
    updateHeroVideo(); // apply it
  });
  new IntersectionObserver(([e]) => { heroOnScreen = e.isIntersecting; updateHeroVideo(); }).observe(heroVideo); // pause when scrolled out of view, saves battery
  reduceMotion.addEventListener("change", updateHeroVideo); // follow the setting if it changes while the page is open
  phoneScreen.addEventListener("change", updateHeroVideo); // switch file if the window crosses the phone size
}

// ---------- rotating hero example ----------

const ask = $("ask"); // the "is it just me, or ..." button in the hero
const askQ = $("ask-q"); // the part of it that changes
const ASK_HOLD = 3500; // how long each example stays up, in ms
const ASK_FADE = 260; // how long the fade out takes, matches the css
let askList = []; // the examples that work for the current place
let askIndex = 0; // which one is showing
let askTimer = null; // the next swap, so we can cancel it
let askPaused = false; // true while the mouse is over it or it has keyboard focus

function examplesFor(place) { // the examples this place actually has data for
  return EXAMPLES.filter((m) => DATA.rows[place]?.[m]); // world cities only keep the ones they have
}

function showExample() { // puts the current example into the line
  const m = askList[askIndex]; // its measure id
  ask.dataset.measure = m; // remember which one a tap should pick
  askQ.textContent = `${HUNCHES[m].question}?`; // e.g. "are downpours heavier?"
}

function queueNext() { // waits, then fades to the next example
  clearTimeout(askTimer); // never two timers at once
  if (reduceMotion.matches || askList.length < 2) return; // reduced motion (or only one example): it just stays put
  askTimer = setTimeout(() => { // after the hold
    if (askPaused) return queueNext(); // they're hovering or focused, try again later
    askQ.classList.add("is-out"); // fade it out
    askTimer = setTimeout(() => { // once it's gone
      askIndex = (askIndex + 1) % askList.length; // next one, back to the start after the last
      showExample(); // swap the words while it's invisible
      askQ.classList.replace("is-out", "is-below"); // jump it just below its spot, no transition
      void askQ.offsetWidth; // makes the browser take that position in before we move it
      askQ.classList.remove("is-below"); // now it rises and fades in
      queueNext(); // and go again
    }, ASK_FADE);
  }, ASK_HOLD);
}

function updateExamples() { // refreshes the list when the place changes
  const list = examplesFor(state.place); // what this place has
  if (list.join() === askList.join()) return; // same list, leave the rotation alone
  askList = list; // use the new list
  askIndex = 0; // from the top
  askQ.classList.remove("is-out"); // make sure it's visible
  showExample(); // show the first one
  ask.hidden = false; // now there's something to show
  queueNext(); // start rotating
}

ask.addEventListener("click", () => { // tapping the example tries that hunch
  const m = ask.dataset.measure; // which one is showing
  state.topic = HUNCHES[m].topic; // switch to its topic
  setMeasure(m); // pick it, for the current place
  $("guess").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" }); // straight to the guess
});
ask.addEventListener("pointerenter", () => { askPaused = true; }); // hold still while the mouse is on it
ask.addEventListener("pointerleave", () => { askPaused = false; }); // carry on when it leaves
ask.addEventListener("focus", () => { askPaused = true; }); // hold still while it has keyboard focus
ask.addEventListener("blur", () => { askPaused = false; }); // carry on when focus moves away
reduceMotion.addEventListener("change", queueNext); // stop or start rotating if the setting changes

// ---------- start ----------

fetch("data/data.json") // grab the data
  .then((res) => res.json()) // turn it into an object
  .then((data) => { // once it's here
    DATA = data; // keep it
    loadFromUrl(); // pick up a shared link if there is one
    render(); // draw the page
  })
  .catch(() => { // something went wrong loading
    $("claim").textContent = "Couldn’t load the data. Try refreshing the page."; // tell the user plainly
  });
