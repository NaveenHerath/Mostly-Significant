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
  return measuresFor(place, topic).length > 0; // world cities only have heat
}

function renderRegions() { // the uk / world switch
  fill($("regions"), ["UK", "World"].map((r) => // two options
    pill(r, state.region === r, () => setRegion(r)) // pressed if it's the current one
  ));
}

function renderPlaces() { // the place pills
  fill($("places"), placesIn(state.region).map((p) => // one pill per place in the region
    pill(p, state.place === p, () => setPlace(p)) // pressed if picked
  ));
  const note = PLACE_NOTES[state.place]; // any warning for this place
  $("place-note").hidden = !note; // only show if there is one
  $("place-note").textContent = note || ""; // the words
}

function renderTopics() { // the topic switch
  fill($("topics"), TOPICS.map((t) => // one per topic
    pill(t.label, state.topic === t.id, () => setTopic(t.id), !topicHasData(state.place, t.id)) // disabled if no data
  ));
  $("topic-note").hidden = state.region === "UK"; // only explain the greyed ones for world
}

function renderHunches() { // the hunch sentence pills
  fill($("hunches"), measuresFor(state.place, state.topic).map((m) => // only hunches this place has
    pill(HUNCHES[m].text, state.measure === m, () => setMeasure(m)) // pressed if picked
  ));
}

function renderGuess() { // the claim line and the three guess buttons
  $("claim").textContent = `${HUNCHES[state.measure].text} in ${state.place}.`; // e.g. "Summers are getting hotter in London."
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
  $("rate").textContent = fmtRate(r.rate, unit); // change per decade
  $("luck-short").textContent = fmtLuck(r.share, r.shuffles); // e.g. "692 of 1,000"
  $("caveat").textContent = r.caveat; // honest limitation
  $("report-place").textContent = state.place; // heading for the report card
}

// ---------- chart (step 5) ----------

function renderChart() { // yearly values, the trend line and the two decade averages
  const box = $("chart-box"); // where the chart goes
  const r = row(); // current data row
  const unit = DATA.measures[state.measure].unit; // its unit
  const date = isDate(unit); // date measures get date labels on the side
  const end = r.start + r.values.length - 1; // last year (2025)
  const series = r.values.map((v, i) => ({ year: r.start + i, value: v ?? NaN })); // one point per year, NaN makes a gap (plot reads null as 0)
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
      Plot.link([0], { x1: r.start, y1: trendAt(r.start), x2: end, y2: trendAt(end), className: "trend", strokeWidth: 2.5 }), // the trend, straight from sen's slope
      Plot.tip(series.filter((d) => !isNaN(d.value)), Plot.pointerX({ x: "year", y: "value", title: (d) => `${d.year}: ${fmt(d.value)}` })), // hover or tap a year
    ],
  });
  box.replaceChildren(chart); // swap in the new chart

  const gaps = r.values.some((v) => v === null); // any missing years?
  $("chart-note").textContent = "Dots are single years. The coloured line is the trend, the dashed lines are the averages." + (gaps ? " Gaps are years when it didn’t happen." : ""); // short key
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

// ---------- report card (step 8) ----------

function renderReport() { // every hunch for this place, grouped by topic, with its verdict
  const groups = TOPICS.filter((t) => topicHasData(state.place, t.id)).map((t) => { // only topics this place has
    const sec = document.createElement("div"); // one group
    sec.className = "report-group"; // styled in css
    const h = document.createElement("h3"); // topic name
    h.textContent = t.label; // e.g. "Heat"
    const list = document.createElement("ul"); // the rows
    for (const m of measuresFor(state.place, t.id)) { // each hunch in the topic
      const r = DATA.rows[state.place][m]; // its data
      const unit = DATA.measures[m].unit; // its unit
      const li = document.createElement("li"); // list item
      const b = document.createElement("button"); // the row is a button so it works with a keyboard
      b.type = "button"; // not a form submit
      b.className = "report-row"; // styled in css
      b.dataset.verdict = r.verdict; // css colours the verdict
      if (m === state.measure) b.setAttribute("aria-current", "true"); // marks the one you just checked
      b.innerHTML = `<span class="report-text"><span class="report-hunch"></span><span class="report-nums"></span></span><span class="report-verdict"></span>`; // empty slots, filled safely below
      b.querySelector(".report-hunch").textContent = HUNCHES[m].text; // the hunch sentence
      b.querySelector(".report-nums").textContent = `${fmtValue(r.early, unit)} → ${fmtValue(r.late, unit)} ${HUNCHES[m].noun}`; // then vs now, small
      b.querySelector(".report-verdict").textContent = VERDICTS[r.verdict].label; // verdict words
      b.addEventListener("click", () => { // tap a row
        state.topic = t.id; // switch to its topic
        setMeasure(m); // pick the hunch (hides the answer for a fresh guess)
        $("guess").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" }); // take them back up to guess
      });
      li.appendChild(b); // button into the list item
      list.appendChild(li); // list item into the list
    }
    sec.append(h, list); // heading then rows
    return sec; // hand the group back
  });
  fill($("report-list"), groups); // swap them in
}

let resizeTimer = null; // so we don't redraw the chart on every pixel of a resize
window.addEventListener("resize", () => { // window changed size
  clearTimeout(resizeTimer); // cancel the last one
  resizeTimer = setTimeout(() => { if (!$("reveal").hidden) renderChart(); }, 150); // redraw once things settle
});

function render() { // redraws everything from the current state
  document.body.dataset.topic = state.topic; // css swaps the accent colour off this
  renderRegions(); // uk / world
  renderPlaces(); // place pills
  renderTopics(); // topic switch
  renderHunches(); // hunch pills
  renderGuess(); // claim and guess buttons
  const show = state.guess !== null && !!row(); // only reveal after a guess
  $("reveal").hidden = !show; // hide or show the results
  if (show) { // answer is showing
    renderResult(); // the card
    renderChart(); // year by year
    renderLuck(); // the 1,000 dots
    renderMap(); // every place
    renderReport(); // every hunch for this place
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

function setGuess(g) { // tapping a guess button
  const first = state.guess === null; // was the answer hidden until now?
  state.guess = g; // remember it
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
