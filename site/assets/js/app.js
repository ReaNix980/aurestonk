/* Aurestonk app shell: routing, search palette, header buttons, footer, data banner. */
"use strict";
(function () {
  const { h, $, $$, store, settings, fmt, data, esc } = A;
  const app = $("#app");

  /* ---------------- routing: #/page/param?query */
  const ROUTES = {
    "": "home", home: "home", market: "market", stocks: "stocks", stock: "stock", dividends: "dividends",
    portfolio: "portfolio", planner: "planner", calculators: "calculators", economy: "economy", about: "about",
  };
  let current = null;
  function parse() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [path, q] = raw.split("?");
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    return { page: ROUTES[parts[0] || ""] || "notfound", params: parts.slice(1), query: Object.fromEntries(new URLSearchParams(q || "")) };
  }
  async function route() {
    const r = parse();
    if (current && current.page === r.page && current.params.join("/") === r.params.join("/") && r.page !== "stocks" && r.page !== "calculators") {
      current = r;
      return; // query-only change on pages that handle it themselves
    }
    current = r;
    $$("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === (r.page === "stock" ? "stocks" : r.page)));
    app.innerHTML = "";
    window.scrollTo(0, 0);
    const P = window.Pages[r.page];
    const titles = { home: "", market: "Market", stocks: "Stocks", stock: r.params[0] || "Stock", dividends: "Dividends", portfolio: "Portfolio",
      planner: "Projection", calculators: "Tools", economy: "Economy", about: "About" };
    document.title = (titles[r.page] ? titles[r.page] + " · " : "") + "Aurestonk";
    if (!P) { app.append(h("div", { class: "empty-state" }, h("div", { html: Icon("compass", 34) }), h("h2", {}, "Page not found"), h("a", { class: "btn", href: "#/" }, "Back to overview"))); return; }
    try { await P(app, r.params, r.query); } catch (e) { console.error(e); app.append(UI.errorBox(e)); }
  }
  window.Pages = window.Pages || {};
  window.addEventListener("hashchange", route);

  /* ---------------- header: currency + theme */
  const curSel = $("#curSel");
  A.CURRENCIES.forEach(([c, , name]) => curSel.append(h("option", { value: c, title: name, selected: c === settings.currency }, c)));
  curSel.addEventListener("change", () => {
    settings.currency = curSel.value;
    store.set("currency", settings.currency);
    if (settings.currency !== "PKR") A.toast(`Amounts shown in ${settings.currency} at today's rate. Share prices stay in PKR.`, 3600);
    current = null; route();
  });
  const paintTheme = () => ($("#themeBtn").innerHTML = Icon(document.documentElement.dataset.theme === "dark" ? "bulb" : "moon", 16));
  $("#themeBtn").addEventListener("click", () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    store.set("theme", t);
    paintTheme();
    current = null; route();
  });
  paintTheme();
  $("#searchBtn").insertAdjacentHTML("afterbegin", Icon("search", 15));

  /* ---------------- search palette (Ctrl+K or /) */
  const PAGES = [
    ["Market", "#/market", "chart", "KSE-100 chart, movers, sectors"],
    ["Stocks", "#/stocks", "list", "All KSE-100 stocks, sortable"],
    ["Dividends", "#/dividends", "coins", "Upcoming payouts, top dividend stocks"],
    ["Portfolio", "#/portfolio", "wallet", "Track holdings, profit and dividends"],
    ["Projection", "#/planner", "target", "Long-term projection with every factor combined"],
    ["Tools", "#/calculators", "calc", "SIP, CAGR, ROI, DCF, tax, Zakat, loans"],
    ["Economy", "#/economy", "bank", "Inflation, policy rate, exchange rates"],
    ["About", "#/about", "info", "Data sources and disclaimer"],
  ];
  function openPalette() {
    if ($(".palette-bg")) return;
    const input = h("input", { type: "text", placeholder: "Search stocks, screens, tools — e.g. LUCK, dividend, SIP", "aria-label": "Search" });
    const results = h("div", { class: "results" });
    const bg = h("div", { class: "palette-bg" }, h("div", { class: "palette" }, h("div", { class: "pin", html: Icon("search", 17) }, input), results,
      h("div", { class: "foot" }, h("span", {}, "↑↓ to move"), h("span", {}, "Enter to open"), h("span", {}, "Esc to close"))));
    document.body.append(bg);
    input.focus();
    let stocks = [], items = [], sel = 0;
    data.stocks().then((d) => { stocks = d.stocks; draw(); }).catch(() => draw());
    const calcs = (window.CALCS || []).map((c) => [c.name, "#/calculators/" + c.id, c.icon, c.desc]);
    const lists = UI.QUICK.map((q) => [q.label, "#/stocks?list=" + q.id, q.icon, q.desc]);
    function score(text, q) { text = text.toLowerCase(); const i = text.indexOf(q); return i < 0 ? -1 : i === 0 ? 3 : text.includes(" " + q) ? 2 : 1; }
    function draw() {
      const q = input.value.trim().toLowerCase();
      const groups = [];
      const st = stocks.map((s) => [s, q ? Math.max(score(s.s, q) * 2, score(s.n, q)) : -1]).filter((x) => !q || x[1] > 0)
        .sort((a, b) => b[1] - a[1]).slice(0, q ? 8 : 0).map(([s]) => [s.s + " · " + s.n, "#/stock/" + s.s, "@" + s.s.slice(0, 4), `${fmt.pkr(s.price)}  ${fmt.pct(s.chgPct)}  ·  ${s.sec}`]);
      const f = (arr) => arr.filter((x) => !q || score(x[0] + " " + x[3], q) > 0);
      if (st.length) groups.push(["Stocks", st]);
      const ql = f(lists); if (ql.length) groups.push(["Quick lists", q ? ql : ql.slice(0, 5)]);
      const pg = f(PAGES); if (pg.length) groups.push(["Pages", pg]);
      const cc = f(calcs); if (cc.length) groups.push(["Calculators", q ? cc : cc.slice(0, 4)]);
      results.innerHTML = "";
      items = [];
      for (const [g, arr] of groups) {
        results.append(h("div", { class: "grp" }, g));
        for (const [t, href, ic, sub] of arr) {
          const icEl = h("span", { class: "ic" });
          if (ic && ic.startsWith("@")) icEl.textContent = ic.slice(1); else icEl.innerHTML = Icon(ic || "dot", 15);
          const it = h("a", { class: "it", href }, icEl, h("span", { class: "t" }, t, h("small", {}, sub)));
          it.addEventListener("click", close);
          items.push(it);
          results.append(it);
        }
      }
      if (!items.length) results.append(h("div", { class: "empty-state" }, "No matches. Try a symbol such as OGDC, or a word such as dividend."));
      sel = 0;
      paint();
    }
    const paint = () => items.forEach((x, i) => x.classList.toggle("on", i === sel));
    function close() { bg.remove(); document.removeEventListener("keydown", key); }
    function key(e) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); paint(); items[sel]?.scrollIntoView({ block: "nearest" }); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); items[sel]?.scrollIntoView({ block: "nearest" }); }
      else if (e.key === "Enter" && items[sel]) { location.hash = items[sel].getAttribute("href"); close(); }
    }
    input.addEventListener("input", draw);
    document.addEventListener("keydown", key);
    bg.addEventListener("mousedown", (e) => { if (e.target === bg) close(); });
    draw();
  }
  window.openSearch = openPalette;
  $("#searchBtn").addEventListener("click", openPalette);
  document.addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
    else if (e.key === "/" && !typing) { e.preventDefault(); openPalette(); }
  });

  /* ---------------- footer */
  async function footer() {
    let cfg = { siteName: "Aurestonk", owner: "", email: "", phone: "", social: {} };
    try { cfg = await data.config("settings"); } catch { /* defaults */ }
    const f = $("#footer");
    const social = (k, label) => h("a", { href: cfg.social?.[k] || "#", target: cfg.social?.[k] ? "_blank" : null, rel: "noopener", title: cfg.social?.[k] ? label : label + " — link coming soon",
      onclick: (e) => { if (!cfg.social?.[k]) { e.preventDefault(); A.toast(label + " link coming soon"); } } }, label);
    f.innerHTML = "";
    f.append(
      h("div", { class: "foot-in" },
        h("div", {},
          h("a", { class: "brand", href: "#/", style: { marginBottom: "12px", display: "inline-flex" } }, h("span", { class: "wordmark" }, "Aurestonk")),
          h("p", { class: "muted small", style: { margin: "0 0 6px", maxWidth: "330px" } }, cfg.tagline || "Market data, portfolio tracking and long-term planning for PSX investors."),
          h("p", { class: "muted small", style: { margin: 0 } }, "No account required. Portfolio data stays in your browser.")),
        h("div", {}, h("h4", {}, "Markets"), ...[["Market", "#/market"], ["Stocks", "#/stocks"], ["Dividends", "#/dividends"], ["Economy", "#/economy"]].map(([t, u]) => h("a", { href: u }, t))),
        h("div", {}, h("h4", {}, "Tools"), ...[["Portfolio", "#/portfolio"], ["Projection", "#/planner"], ["Calculators", "#/calculators"], ["Top 20 dividend stocks", "#/stocks?list=top-dividend"], ["About & disclaimer", "#/about"]].map(([t, u]) => h("a", { href: u }, t))),
        h("div", {}, h("h4", {}, "Contact"),
          cfg.owner ? h("div", { style: { fontWeight: 600, marginBottom: "6px" } }, cfg.owner) : null,
          cfg.email ? h("a", { class: "ci", href: "mailto:" + cfg.email, html: Icon("mail", 15) + esc(cfg.email) }) : null,
          cfg.phone ? h("a", { class: "ci", href: "tel:" + cfg.phone.replace(/[^\d+]/g, ""), html: Icon("phone", 15) + esc(cfg.phone) }) : null,
          h("div", { class: "socials" }, social("instagram", "Instagram"), social("x", "X"), social("linkedin", "LinkedIn")))),
      h("div", { class: "foot-bottom" },
        h("span", {}, `© ${new Date().getFullYear()} ${cfg.siteName}${cfg.owner ? " · " + cfg.owner : ""}`),
        h("span", { id: "dataStamp" }),
        h("span", {}, "For information only. Not investment advice.")));
  }

  /* ---------------- ticker tape */
  async function ticker() {
    try {
      const [{ stocks }, m] = await Promise.all([data.stocks(), data.market()]);
      const ix = m.index;
      const items = [[`KSE-100`, fmt.num(ix.value, 2), ix.chgPct, "#/market"],
        ...stocks.slice().sort((a, b) => (b.mcap || 0) - (a.mcap || 0)).slice(0, 40).map((s) => [s.s, fmt.num(s.price, 2), s.chgPct, "#/stock/" + s.s])];
      const one = () => items.map(([n, p, c, u]) => h("a", { href: u }, h("b", {}, n), h("span", {}, p), h("span", { class: fmt.cls(c) }, fmt.pct(c))));
      const track = h("div", { class: "ticker-track" }, one(), one());
      $("#ticker").append(track);
      track.style.animationDuration = Math.max(60, items.length * 3.2) + "s";
    } catch { /* no data yet */ }
  }

  /* ---------------- data banner (sample data / stale data) */
  async function banner() {
    try {
      const m = await data.meta();
      const stamp = $("#dataStamp");
      if (stamp) stamp.textContent = m.asOf ? `Prices as of ${fmt.date(m.asOf)}` : "";
      if (m.sample) {
        $("#banner").append(h("div", { class: "sample-banner", html: Icon("alert", 14) + "<span>Preview with <b>sample data</b>. Real PSX prices appear after the first daily update.</span>" }));
      } else if (m.asOf && (Date.now() - Date.parse(m.asOf)) / 86400e3 > 6) {
        $("#banner").append(h("div", { class: "sample-banner" }, `Data was last updated on ${fmt.date(m.asOf)}. The daily update may be paused.`));
      }
    } catch { /* no meta yet */ }
  }

  footer().then(banner);
  ticker();
  data.fx().then((fx) => { settings.rates = fx.rates || { PKR: 1 }; settings.fxDate = fx.date; settings.fxSample = fx.sample; route(); });
})();
