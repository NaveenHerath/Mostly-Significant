// The "Watch it change" section: every place on a map with a year slider, and beside it the
// chart of one place, or of two places set side by side. Nothing here does statistics: every number is looked up in
// data/timeline.json, which data/make_timeline.py builds from the analysis files.
// It reuses the small helpers in app.js ($, pill, fill, fmtNum, state, DATA, setPlace,
// reduceMotion), so it is loaded after app.js. Everything else stays inside this function.

(() => {
  const section = $("timeline");
  if (!section) return;

  // How each variable is worded, which colour pair it uses (timeline.css) and how far from
  // normal its colour scale runs: degrees for temperatures, percent for rain and sunshine.
  const WORDS = {
    avg_temp: { label: "Temperature", kind: "temp", more: "warmer", less: "cooler", subject: "the average temperature has", scale: 1.5, digits: 1, rateDigits: 2 },
    day_temp: { label: "Daytime highs", kind: "temp", more: "warmer", less: "cooler", subject: "daytime highs have", scale: 1.5, digits: 1, rateDigits: 2 },
    night_temp: { label: "Night-time lows", kind: "temp", more: "warmer", less: "cooler", subject: "night-time lows have", scale: 1.5, digits: 1, rateDigits: 2 },
    rain_total: { label: "Rain", kind: "rain", more: "wetter", less: "drier", subject: "yearly rain has", scale: 40, digits: 0, rateDigits: 0 },
    sunshine: { label: "Sunshine", kind: "sun", more: "sunnier", less: "duller", subject: "sunshine has", scale: 8, digits: 1, rateDigits: 2 },
  };
  const MODES = [{ id: "year", label: "Single year" }, { id: "decade", label: "10-year average" }];
  const STEP_MS = 550; // how long each year stays up while playing

  let T = null; // the whole timeline.json once it has loaded
  const tl = { variable: "avg_temp", mode: "year", year: 2025, place: "London", other: "", view: "UK", playing: false }; // other: the place compared with, "" for none
  let map = null; // the leaflet map, made once
  const pins = {}; // place name -> its pin
  const pinned = {}; // place name -> whether its label is currently always shown
  let timer = null; // the play interval
  let onScreen = false, started = false;

  // ---------- looking things up ----------

  const info = () => T.variables[tl.variable]; // name, unit and definition of the current variable
  const words = () => WORDS[tl.variable];
  const rowFor = (place) => T.rows[place]?.[tl.variable]; // undefined when a place lacks the variable

  // The figure and its gap from normal for one year, as a single year or as the 10-year average.
  function at(r, year) {
    if (!r) return { value: null, vs: null };
    const i = year - T.first_year;
    const [value, vs] = tl.mode === "year" ? [r.value[i], r.vs[i]] : [r.value10[i], r.vs10[i]];
    return { value: value ?? null, vs: vs ?? null };
  }

  // The first year with a figure anywhere: 1990 for a 10-year average, later for sunshine.
  function firstYear() {
    const key = tl.mode === "year" ? "value" : "value10";
    let first = T.last_year;
    for (const place in T.rows) {
      const i = rowFor(place) ? rowFor(place)[key].findIndex((v) => v !== null) : -1;
      if (i >= 0) first = Math.min(first, T.first_year + i);
    }
    return first;
  }

  // ---------- wording ----------

  const fmt = (value) => `${fmtNum(value, words().digits)} ${info().unit}`; // "11.6 °C", "627 mm"
  const period = (year) => (tl.mode === "year" ? `${year}` : `${year - T.window + 1} to ${year}`);

  // "1.6 °C warmer than normal", "12% drier than normal".
  function gapText(vs) {
    const percent = info().compare === "percent";
    const n = fmtNum(Math.abs(vs), percent ? 0 : 1);
    if (Number(n) === 0) return "the same as normal";
    return `${n}${percent ? "%" : " °C"} ${vs > 0 ? words().more : words().less} than normal`;
  }

  // The pin colour: a mix from the neutral grey towards one of the two end colours, further
  // the further the year is from normal. The browser does the mixing from the css colours.
  function colour(vs) {
    const t = Math.max(-1, Math.min(1, vs / words().scale));
    return `color-mix(in oklab, var(${t >= 0 ? "--tl-hi" : "--tl-lo"}) ${Math.round(Math.abs(t) * 100)}%, var(--tl-mid))`;
  }

  // ---------- the controls ----------

  function renderControls() {
    fill($("tl-vars"), Object.keys(T.variables).map((v) => pill(WORDS[v].label, tl.variable === v, () => setVariable(v))));
    fill($("tl-modes"), MODES.map((m) => pill(m.label, tl.mode === m.id, () => setMode(m.id))));
    fill($("tl-views"), ["UK", "World"].map((v) => pill(v, tl.view === v, () => setView(v))));
    section.dataset.tlKind = words().kind; // the css swaps the colour pair on this
    $("tl-definition").textContent = info().definition;
    $("tl-place").value = tl.place;
    $("tl-other").value = tl.other;

    // The two ends of the colour scale, in words.
    const end = `${words().scale}${info().compare === "percent" ? "%" : " °C"}`;
    $("tl-legend-lo").textContent = `${end} ${words().less}, or more`;
    $("tl-legend-hi").textContent = `${end} ${words().more}, or more`;
  }

  // The place menu is filled once: UK towns, then world cities, in the usual order.
  function fillPlaces() {
    const groups = ["UK", "World"].map((region) => {
      const group = document.createElement("optgroup");
      group.label = region;
      for (const p in T.places) if (T.places[p].region === region) group.append(new Option(p, p));
      return group;
    });
    fill($("tl-place"), groups);
    // The second menu holds the same places under a first entry that means "no comparison".
    fill($("tl-other"), [new Option("Compare with…", ""), ...groups.map((g) => g.cloneNode(true))]);
  }

  // ---------- the map ----------

  function startMap() {
    // Same settings as the verdict map: no scroll hijack, no drag trap on phones.
    map = L.map("tl-map", { scrollWheelZoom: false, dragging: !L.Browser.mobile, zoomSnap: 0.25, maxZoom: 7, minZoom: 1 });
    map.createPane("land").style.zIndex = 250;
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    map.attributionControl.addAttribution('Borders: <a href="https://www.naturalearthdata.com/">Natural Earth</a>');
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json")
      .then((res) => res.json())
      .then((world) => L.geoJSON(topojson.feature(world, world.objects.countries), { pane: "land", className: "land", interactive: false }).addTo(map))
      .catch(() => {}); // without the outlines the pins still work on a plain background

    // One pin per place, made once. Later updates only change its colour, size and label.
    for (const [place, where] of Object.entries(T.places)) {
      pins[place] = L.circleMarker([where.lat, where.lon], { radius: 7, className: "pin tl-pin" }).addTo(map);
      pins[place].on("click", () => pickPlace(place));
    }
  }

  function fitView() { // zooms to the UK towns or to the world cities
    const points = Object.values(T.places).filter((w) => w.region === tl.view).map((w) => [w.lat, w.lon]);
    map.fitBounds(points, { padding: [32, 32], maxZoom: 6 });
  }

  function renderPins() {
    let missing = false; // any hollow pin in the current view?
    for (const [place, pin] of Object.entries(pins)) {
      const now = at(rowFor(place), tl.year);
      const has = now.value !== null;
      const current = place === tl.place || place === tl.other; // the followed place, and the one compared with it
      const inView = T.places[place].region === tl.view;
      const el = pin.getElement();
      el.style.fill = has ? colour(now.vs) : ""; // hollow (from the css) when there is no figure
      el.classList.toggle("tl-pin--none", !has);
      el.classList.toggle("pin--current", current);
      pin.setRadius(current ? 10 : inView ? 7 : 4); // places outside the view stay small
      if (current) pin.bringToFront();
      if (!has && inView) missing = true;

      // Hovering a pin gives the figure and its gap; the followed place keeps a short label up.
      const text = !has ? `${place}: no figure for ${period(tl.year)}`
        : current ? `${place}: ${fmt(now.value)}` : `${place}: ${fmt(now.value)}, ${gapText(now.vs)}`;
      if (pinned[place] !== current) { // leaflet needs a fresh tooltip to switch between hover and always-on
        pin.unbindTooltip().bindTooltip(text, { direction: "top", offset: [0, -8], permanent: current });
        pinned[place] = current;
      } else pin.setTooltipContent(text);
    }
    $("tl-legend-none").hidden = !missing;
  }

  // ---------- the slider ----------

  function renderScrub() {
    const slider = $("tl-year");
    slider.min = firstYear();
    slider.max = T.last_year;
    slider.value = tl.year;
    slider.setAttribute("aria-valuetext", tl.mode === "year" ? `${tl.year}` : `${period(tl.year)} average`);
    $("tl-year-label").textContent = period(tl.year);
    $("tl-year-sub").textContent = tl.mode === "year" ? "single year" : "10-year average";
    $("tl-play").setAttribute("aria-pressed", tl.playing ? "true" : "false");
    $("tl-play-label").textContent = tl.playing ? "Pause" : "Play through the years";
  }

  function stop() { // ends the playback without redrawing; the caller redraws
    tl.playing = false;
    clearInterval(timer);
  }

  function play(on) {
    stop();
    tl.playing = on;
    if (on) {
      if (tl.year >= T.last_year) tl.year = firstYear(); // at the end, it starts again from the beginning
      timer = setInterval(() => {
        if (tl.year >= T.last_year) return play(false);
        tl.year += 1;
        renderYear();
      }, STEP_MS);
    }
    renderYear();
  }

  // ---------- the panel for one place ----------

  function renderPanel() {
    const comparing = tl.other !== "";
    $("tl-single").hidden = comparing;
    $("tl-pair").hidden = !comparing;
    $("tl-hunch-place").textContent = tl.place;
    if (comparing) return renderPair();
    $("tl-chart-note").textContent = "Dots are single years, the bold line is the 10-year average and the dashed line is normal. Click the chart to jump to a year.";
    const r = rowFor(tl.place);
    const now = at(r, tl.year);
    const has = now.value !== null;
    $("tl-when").textContent = tl.mode === "year" ? `${tl.place} in ${tl.year}` : `${tl.place}, ${period(tl.year)} average`;
    $("tl-figure").textContent = has ? fmt(now.value) : "No figure";
    $("tl-swatch").style.background = has ? colour(now.vs) : "";
    $("tl-swatch").hidden = !has;

    // The gap from normal in words, or the reason there is nothing to show.
    let gap;
    if (has) {
      const said = gapText(now.vs);
      gap = `${said[0].toUpperCase()}${said.slice(1)}. Normal here is ${fmt(r.normal)}, the 1981 to 2010 average.`;
    } else if (!r) gap = `There are no ${words().label.toLowerCase()} figures for ${tl.place}.`;
    else {
      // A record can start late (sunshine, 1984) or stop early (a faulty stretch removed from the data).
      const starts = T.first_year + r.value.findIndex((v) => v !== null);
      const stops = T.first_year + r.value.findLastIndex((v) => v !== null);
      if (tl.year > stops) gap = `This record stops in ${stops}. NASA’s data for ${tl.place} is faulty after that, so it is left out.`;
      else if (tl.year < starts) gap = `This record starts in ${starts}.`;
      else gap = "A 10-year average needs ten years of data first.";
    }
    $("tl-gap-text").textContent = gap;

    // The tested trend, worded from the "change" column: rising, falling or no clear change.
    let trend = "";
    if (r && r.change === "no_clear_change") trend = `Across ${r.n_years} years there is no clear trend here. The ups and downs could be chance.`;
    else if (r) trend = `Across ${r.n_years} years ${words().subject} ${r.change === "rising" ? "risen" : "fallen"} by ${fmtNum(Math.abs(r.rate), words().rateDigits)} ${info().unit} per decade here, and that is very unlikely to be chance.`;
    $("tl-trend").textContent = trend;
    renderChart(r, now);
  }

  // The place's whole record: single years, the 10-year average, normal, and the slider's year.
  function renderChart(r, now) {
    const box = $("tl-chart");
    $("tl-chart-note").hidden = box.hidden = !r; // a place without this variable has no chart to show
    if (!r) return box.replaceChildren();
    const first = T.first_year, last = T.last_year;
    const points = r.value.map((v, i) => ({ year: first + i, value: v ?? NaN, average: r.value10[i] ?? NaN })); // NaN leaves a gap
    const width = box.clientWidth || 420;
    const small = width < 420;

    const chart = Plot.plot({
      width,
      height: small ? 220 : 260,
      marginLeft: 44, marginRight: 12, marginTop: 22, marginBottom: 28,
      style: { background: "transparent", fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--color-muted)", overflow: "visible" },
      ariaLabel: `${info().name} in ${tl.place}, ${first} to ${last}`,
      x: { label: null, tickFormat: "d", ticks: small ? 4 : 6, domain: [first - 0.5, last + 0.5] },
      y: { label: null, grid: true, ticks: 5 },
      marks: [
        // In 10-year mode the band marks the ten years being averaged.
        tl.mode === "decade" ? Plot.rect([0], { x1: tl.year - T.window + 0.5, x2: tl.year + 0.5, className: "tl-window" }) : null,
        Plot.ruleY([r.normal], { className: "avg", strokeDasharray: "4 4", strokeWidth: 1 }),
        Plot.lineY(points, { x: "year", y: "value", className: "yearly", strokeWidth: 1 }),
        Plot.dot(points, { x: "year", y: "value", r: 2, className: "yearly-dot" }),
        Plot.lineY(points, { x: "year", y: "average", className: "tl-average", strokeWidth: 2.5 }),
        Plot.ruleX([tl.year], { className: "tl-now-rule" }),
        now.value !== null ? Plot.dot([{ year: tl.year, value: now.value }], { x: "year", y: "value", r: 5.5, className: "tl-now-dot" }) : null,
        Plot.tip(points.filter((d) => !isNaN(d.value)), Plot.pointerX({ x: "year", y: "value", title: (d) => `${d.year}: ${fmt(d.value)}` })),
      ],
    });
    // The marker takes the same colour as the place's pin on the map.
    if (now.value !== null) chart.querySelector(".tl-now-dot")?.style.setProperty("fill", colour(now.vs));
    // Clicking the chart moves the slider to that year.
    chart.addEventListener("click", (e) => {
      const year = Math.round(chart.scale("x").invert(e.clientX - chart.getBoundingClientRect().left));
      stop();
      setYear(Math.max(firstYear(), Math.min(last, year)));
    });
    box.replaceChildren(chart);
  }

  // ---------- two places side by side ----------

  // Two places are compared by their gap from their own normal, never by the raw figure:
  // Dubai is always hotter than Aberdeen, so the fair question is which has changed more.
  const signed = (vs) => { // "+1.2 °C", "−8%"
    const percent = info().compare === "percent";
    const n = fmtNum(Math.abs(vs), percent ? 0 : 1);
    return `${Number(n) === 0 ? "" : vs > 0 ? "+" : "−"}${n}${percent ? "%" : " °C"}`;
  };
  const rateText = (r) => `${fmtNum(Math.abs(r.rate), words().rateDigits)} ${info().unit} per decade`;

  // The tested trends of the two places in one or two sentences, straight from their "change" columns.
  function pairTrend(a, b) {
    const [A, B] = [tl.place, tl.other];
    if (!a || !b) return "";
    const moved = (r) => (r.change === "rising" ? "rising" : "falling");
    if (a.change === "no_clear_change" && b.change === "no_clear_change") return `Neither ${A} nor ${B} shows a clear trend. The ups and downs could be chance.`;
    if (a.change === "no_clear_change") return `${B} is ${moved(b)} by ${rateText(b)}, and that is very unlikely to be chance. ${A} shows no clear trend.`;
    if (b.change === "no_clear_change") return `${A} is ${moved(a)} by ${rateText(a)}, and that is very unlikely to be chance. ${B} shows no clear trend.`;
    if (a.change !== b.change) return `Same test, opposite answers: ${A} is ${moved(a)} by ${rateText(a)} and ${B} is ${moved(b)} by ${rateText(b)}. Neither is likely to be chance.`;
    return `Both are ${moved(a)}, and neither is likely to be chance: ${A} by ${rateText(a)}, ${B} by ${rateText(b)}.`;
  }

  // One small card per place: its line colour, its figure for the year and its gap from normal.
  function pairCard(place, r, now, key) {
    const card = document.createElement("div");
    card.className = "tl-card";
    card.innerHTML = `<p class="tl-card-name"><span class="tl-line-key" data-key="${key}" aria-hidden="true"></span><span></span></p><p class="tl-card-figure figure"></p><p class="tl-card-gap"></p>`;
    card.querySelector(".tl-card-name span:last-child").textContent = place;
    card.querySelector(".tl-card-figure").textContent = now.value !== null ? fmt(now.value) : "No figure";
    card.querySelector(".tl-card-gap").textContent = now.value !== null ? gapText(now.vs) : !r ? "not in this data" : "no figure for this year";
    return card;
  }

  function renderPair() {
    const a = rowFor(tl.place), b = rowFor(tl.other);
    const nowA = at(a, tl.year), nowB = at(b, tl.year);
    $("tl-pair-when").textContent = tl.mode === "year" ? `In ${tl.year}` : `${period(tl.year)} average`;
    fill($("tl-pair-cards"), [pairCard(tl.place, a, nowA, "a"), pairCard(tl.other, b, nowB, "b")]);
    $("tl-trend").textContent = pairTrend(a, b);
    $("tl-chart-note").textContent = "Each bold line is a place’s 10-year average, shown as its gap from its own normal (the dashed line). Thin lines are single years. Click the chart to jump to a year.";

    // One chart, one axis: both places as their gap from normal, so they share a scale.
    const box = $("tl-chart");
    $("tl-chart-note").hidden = box.hidden = false;
    const first = T.first_year, last = T.last_year;
    const series = [[tl.place, a, "a", nowA], [tl.other, b, "b", nowB]].filter(([, r]) => r);
    const points = (r) => r.vs.map((v, i) => ({ year: first + i, vs: v ?? NaN, vs10: r.vs10[i] ?? NaN })); // NaN leaves a gap
    const width = box.clientWidth || 420;
    const small = width < 420;
    const ends = series.map(([place, r]) => { // where each bold line stops, for its name label
      const i = r.vs10.findLastIndex((v) => v !== null);
      return { place, year: first + i, vs10: r.vs10[i] };
    }).filter((d) => d.vs10 !== undefined);

    const chart = Plot.plot({
      width,
      height: small ? 230 : 280,
      marginLeft: 48, marginRight: small ? 12 : 76, marginTop: 22, marginBottom: 28,
      style: { background: "transparent", fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--color-muted)", overflow: "visible" },
      ariaLabel: `${info().name} in ${tl.place} and ${tl.other}, gap from normal, ${first} to ${last}`,
      x: { label: null, tickFormat: "d", ticks: small ? 4 : 6, domain: [first - 0.5, last + 0.5] },
      y: { label: null, grid: true, ticks: 5, tickFormat: signed },
      marks: [
        tl.mode === "decade" ? Plot.rect([0], { x1: tl.year - T.window + 0.5, x2: tl.year + 0.5, className: "tl-window" }) : null,
        Plot.ruleY([0], { className: "avg", strokeDasharray: "4 4", strokeWidth: 1 }),
        ...series.map(([, r, key]) => Plot.lineY(points(r), { x: "year", y: "vs", className: `tl-thin-${key}`, strokeWidth: 1 })),
        ...series.map(([, r, key]) => Plot.lineY(points(r), { x: "year", y: "vs10", className: `tl-line-${key}`, strokeWidth: 2.5 })),
        Plot.ruleX([tl.year], { className: "tl-now-rule" }),
        ...series.filter(([, , , now]) => now.value !== null).map(([, , key, now]) => Plot.dot([{ year: tl.year, vs: now.vs }], { x: "year", y: "vs", r: 5.5, className: `tl-dot-${key}` })),
        small ? null : Plot.text(ends, { x: "year", y: "vs10", text: "place", dx: 8, textAnchor: "start", className: "tl-end-label" }),
        Plot.tip(series.flatMap(([place, r]) => points(r).filter((d) => !isNaN(d.vs)).map((d) => ({ ...d, place }))),
          Plot.pointer({ x: "year", y: "vs", title: (d) => `${d.place}, ${d.year}: ${signed(d.vs)} from normal` })),
      ],
    });
    chart.addEventListener("click", (e) => {
      const year = Math.round(chart.scale("x").invert(e.clientX - chart.getBoundingClientRect().left));
      stop();
      setYear(Math.max(firstYear(), Math.min(last, year)));
    });
    box.replaceChildren(chart);
  }

  // ---------- changing the picks ----------

  function renderYear() { // everything that follows the slider
    renderPins();
    renderScrub();
    renderPanel();
  }

  function renderAll() {
    renderControls();
    renderYear();
  }

  function clampYear() { // a 10-year average or the sunshine record cannot start in 1981
    tl.year = Math.max(tl.year, firstYear());
  }

  function setVariable(v) { tl.variable = v; clampYear(); renderAll(); }
  function setMode(m) { tl.mode = m; clampYear(); renderAll(); }
  function setYear(year) { tl.year = year; renderYear(); }
  function setView(view) { tl.view = view; renderAll(); fitView(); }

  function pickPlace(place) { // following a place also brings its region into view
    if (place === tl.other) tl.other = ""; // a place is not compared with itself
    tl.place = place;
    const region = T.places[place].region;
    if (region !== tl.view) { tl.view = region; fitView(); }
    renderAll();
  }

  $("tl-year").addEventListener("input", (e) => { stop(); setYear(Number(e.target.value)); });
  $("tl-play").addEventListener("click", () => play(!tl.playing));
  $("tl-place").addEventListener("change", (e) => pickPlace(e.target.value));
  $("tl-other").addEventListener("change", (e) => {
    tl.other = e.target.value === tl.place ? "" : e.target.value;
    // Two places in different regions need the world view to be seen together.
    if (tl.other && T.places[tl.other].region !== T.places[tl.place].region && tl.view !== "World") { tl.view = "World"; fitView(); }
    renderAll();
  });

  // "Test a hunch here" hands the place to the hunch pickers at the top of the page.
  $("tl-hunch").addEventListener("click", () => {
    if (!DATA?.places[tl.place]) return;
    play(false);
    state.region = DATA.places[tl.place].region;
    setPlace(tl.place);
    $("hunch").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
  });

  // The other way round: picking a place in the hunch pickers moves this section to it too.
  for (const id of ["places", "regions"]) {
    $(id).addEventListener("click", () => setTimeout(() => {
      if (started && T.places[state.place] && state.place !== tl.place) pickPlace(state.place);
    }));
  }

  let resizeTimer = null; // the chart and map are redrawn once a resize settles
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (started) { map.invalidateSize(); renderPanel(); } }, 150);
  });

  // ---------- start ----------

  // The map is only built once the section is near the screen and the data has arrived.
  function start() {
    if (started || !T || !onScreen) return;
    started = true;
    if (T.places[state.place]) { tl.place = state.place; tl.view = T.places[state.place].region; } // same place as the hunch
    $("tl-status").hidden = true;
    $("tl-body").hidden = false;
    fillPlaces();
    startMap();
    fitView();
    renderAll();
  }

  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    if (onScreen) start();
    else if (tl.playing) play(false); // no point playing when scrolled away
  }, { rootMargin: "300px 0px" }).observe(section);

  fetch("data/timeline.json")
    .then((res) => res.json())
    .then((data) => { T = data; start(); })
    .catch(() => { $("tl-status").textContent = "Couldn’t load the map data. Try refreshing the page."; });
})();
