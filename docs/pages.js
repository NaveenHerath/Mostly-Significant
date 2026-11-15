// Turns the one long page into separate pages: home, check a hunch, watch it change, test your
// gut, how it works and about. Every top-level block in <main> carries data-page, and pages.css
// shows only the blocks of the current page. The address bar holds the page (#check, #how...),
// so links, the back button and shared links all work, and every other script stays as it was.

(() => {
  const PAGES = ["home", "check", "change", "games", "how", "about"];
  const TITLES = { // the browser tab for each page
    home: "Is it just me? Weather hunches, fact-checked",
    check: "Check a hunch · Is it just me?",
    change: "Watch it change · Is it just me?",
    games: "Test your gut · Is it just me?",
    how: "How it works · Is it just me?",
    about: "About · Is it just me?",
  };

  // The page a link points at: a page name itself, or the page of the element with that id
  // (old links such as #where or #cant still land on the right page). Anything else is home.
  function pageFor(id) {
    if (PAGES.includes(id)) return id;
    const el = id ? document.getElementById(id) : null;
    const owner = el?.closest("[data-page]");
    return owner ? owner.dataset.page : "home";
  }

  // Shows a page, then scrolls to the element asked for, or to the top of a newly opened page.
  function show(page, targetId) {
    const changed = document.body.dataset.page !== page;
    document.body.dataset.page = page;
    document.title = TITLES[page];
    document.querySelectorAll("#site-nav a").forEach((a) => { // the bar link of this page gets the pill
      if (a.dataset.nav === page) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (changed) {
      // The page's blocks are numbered in order, so pages.css can bring them in one after another.
      let n = 0;
      document.querySelectorAll(`main > [data-page="${page}"]`).forEach((el) => { el.style.setProperty("--stagger", n++); });
      window.scrollTo({ top: 0, behavior: "instant" });
      // Maps and charts drawn while their page was hidden measure themselves again now.
      window.dispatchEvent(new Event("resize"));
      if (page === "check" && typeof renderMap === "function" && typeof DATA !== "undefined" && DATA && !$("reveal").hidden) renderMap();
    }
    const target = targetId && !PAGES.includes(targetId) ? document.getElementById(targetId) : null;
    if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: changed || reduceMotion.matches ? "instant" : "smooth", block: "start" }));
  }

  function fromAddress() { // reads the page from the address bar
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) return show(pageFor(id), id);
    // A shared link with a guess in it opens straight on the answer; anything else opens home.
    show(new URLSearchParams(location.search).has("guess") ? "check" : "home");
  }

  // Other scripts call this to move to a section that may sit on another page
  // (the hero example, "see the full case" in the chat, "test a hunch here" on the map).
  window.goToSection = (id) => {
    const page = pageFor(id);
    if (location.hash.slice(1) !== page) history.pushState(null, "", `${location.search}#${page}`);
    show(page, id);
  };

  window.addEventListener("hashchange", fromAddress);
  window.addEventListener("popstate", fromAddress);
  fromAddress();
})();
