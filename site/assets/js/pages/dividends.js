/* Dividends: upcoming payouts, top payers, recent payouts, income target calculator. */
"use strict";
(function () {
  const { h, fmt, data, todayISO } = A;

  Pages.dividends = async function (app) {
    app.append(UI.pageHead("Dividends", "Announced payouts, book-closure dates and the KSE-100's highest-yielding companies.", null, [["Overview", "#/"], "Dividends"]));
    const ld = UI.loading(2);
    app.append(ld);
    const [pay, { stocks }, taxes] = await Promise.all([data.payouts(), data.stocks(), data.config("taxes")]);
    ld.remove();
    const bySym = Object.fromEntries(stocks.map((s) => [s.s, s]));
    const today = todayISO();
    const upcoming = (pay.upcoming || []).filter((p) => (p.bookClosureFrom || "") >= today);
    const top = stocks.filter((s) => s.divYield > 0).sort((a, b) => b.divYield - a.divYield).slice(0, 20);
    const avgYield = top.length ? top.reduce((a, b) => a + b.divYield, 0) / top.length : 0;

    app.append(h("div", { class: "grid g4" },
      UI.stat("Upcoming payouts", String(upcoming.length), "announced, book closure ahead", "hero-stat"),
      UI.stat("Highest yield", top[0] ? top[0].divYield.toFixed(2) + "%" : "—", top[0] ? top[0].s + " · " + top[0].n : ""),
      UI.stat("Top-20 average yield", avgYield.toFixed(2) + "%", "last 12 months, before tax"),
      UI.stat("Dividend tax", `${taxes.dividendTax.filer * 100}% / ${taxes.dividendTax.nonFiler * 100}%`, "filer / non-filer · deducted at source")));

    // upcoming
    const upBox = h("div", {});
    app.append(h("div", { class: "card", style: { marginTop: "16px" } },
      h("div", { class: "card-h" }, h("h2", {}, "Upcoming payouts"), h("span", { class: "muted small" }, "Shares must be held before book closure begins (settlement is T+2).")), upBox));
    upBox.append(UI.table([
      { key: "s", label: "Company", render: (p) => UI.symCell({ s: p.s, n: p.n }) },
      { key: "type", label: "Type", render: (p) => h("span", {}, p.type, p.period ? h("span", { class: "muted small" }, " · " + p.period) : null) },
      { key: "amount", label: "Per share", num: true, render: (p) => (p.amount ? "Rs " + p.amount.toFixed(2) : p.pct ? p.pct + "%" : "—") },
      { key: "yield", label: "Yield", num: true, sortVal: (p) => (p.amount && bySym[p.s] ? p.amount / bySym[p.s].price : null),
        render: (p) => (p.amount && bySym[p.s] ? (p.amount / bySym[p.s].price * 100).toFixed(2) + "%" : "—"), title: "This payout ÷ current price" },
      { key: "bookClosureFrom", label: "Book closure", render: (p) => p.bookClosureFrom ? `${fmt.date(p.bookClosureFrom, false)} – ${fmt.date(p.bookClosureTo || p.bookClosureFrom)}` : "—", ascFirst: true },
      { key: "days", label: "Buy before", num: true, sortVal: (p) => p.bookClosureFrom, render: (p) => daysLeft(p.bookClosureFrom) },
    ], upcoming, { compact: true, sort: "bookClosureFrom", asc: true, empty: "No upcoming payouts announced right now." }).el);

    // top 20 + calendar
    const topBox = h("div", {});
    const calBox = h("div", {});
    app.append(h("div", { class: "grid g2", style: { marginTop: "16px", alignItems: "start" } },
      h("div", { class: "card" }, h("div", { class: "card-h" }, h("h2", {}, "Top 20 dividend stocks"), h("a", { class: "link", href: "#/stocks?list=top-dividend" }, "Full table")), topBox),
      h("div", {},
        h("div", { class: "card" }, h("h2", {}, "Payout calendar"), h("p", { class: "muted small", style: { marginTop: 0 } }, "Upcoming book closures by week."), calBox),
        incomeCalc(taxes, avgYield))));
    topBox.append(UI.table([
      { key: "rank", label: "#", sortable: false, render: (s) => top.indexOf(s) + 1 },
      { key: "s", label: "Stock", render: UI.symCell },
      { key: "divYield", label: "Yield", num: true, render: (s) => h("b", {}, s.divYield.toFixed(2) + "%") },
      { key: "dps12m", label: "Paid (12m)", num: true, render: (s) => "Rs " + s.dps12m.toFixed(2) },
      { key: "price", label: "Price", num: true, render: (s) => fmt.num(s.price, 2) },
    ], top, { compact: true, sort: "divYield", onRow: (s) => (location.hash = "#/stock/" + s.s) }).el);

    const weeks = {};
    for (const p of upcoming) {
      const d = new Date(p.bookClosureFrom + "T00:00:00Z");
      const monday = new Date(d - ((d.getUTCDay() + 6) % 7) * 86400e3).toISOString().slice(0, 10);
      (weeks[monday] = weeks[monday] || []).push(p);
    }
    const wk = Object.keys(weeks).sort().slice(0, 8);
    if (!wk.length) calBox.append(h("p", { class: "muted" }, "Nothing scheduled yet."));
    for (const w of wk) calBox.append(h("div", { style: { padding: "8px 0", borderBottom: "1px solid var(--line)" } },
      h("div", { class: "small muted", style: { fontWeight: 650 } }, "Week of " + fmt.date(w)),
      h("div", { class: "chips", style: { marginTop: "6px" } }, weeks[w].map((p) => h("a", { class: "chip", href: "#/stock/" + p.s, title: p.n },
        h("b", {}, p.s), p.amount ? " Rs " + p.amount.toFixed(2) : "")))));

    // recent
    const recent = (pay.recent || []).slice(0, 30);
    if (recent.length) app.append(h("div", { class: "card", style: { marginTop: "16px" } }, h("h2", {}, "Recent payouts"),
      UI.table([
        { key: "s", label: "Company", render: (p) => UI.symCell({ s: p.s, n: p.n }) },
        { key: "amount", label: "Per share", num: true, render: (p) => (p.amount ? "Rs " + p.amount.toFixed(2) : "—") },
        { key: "pct", label: "% of face value", num: true, render: (p) => (p.pct ? p.pct + "%" : "—") },
        { key: "exDate", label: "Date", render: (p) => fmt.date(p.exDate || p.bookClosureFrom) },
      ], recent, { compact: true, sort: "exDate" }).el));
  };

  function daysLeft(iso) {
    if (!iso) return "—";
    const d = Math.ceil((Date.parse(iso) - Date.parse(todayISO())) / 86400e3);
    // PSX settles T+2: buy at least 2 working days before book closure
    const label = d <= 0 ? "closing" : d === 1 ? "tomorrow" : `${d} days`;
    return h("span", { class: d <= 3 ? "pill down" : "pill flat", title: "Settlement is T+2: buy at least two working days before book closure starts." }, label);
  }

  function incomeCalc(taxes, avgYield) {
    const target = UI.numField("Monthly dividend income I want", 50000, { pre: "Rs" });
    const yld = UI.numField("Average dividend yield", +avgYield.toFixed(1) || 8, { unit: "%", help: "Prefilled with the top-20 average." });
    const filer = UI.checkField("I'm a tax filer", true);
    const out = h("div", { style: { marginTop: "8px" } });
    const run = () => {
      const tax = filer.get() ? taxes.dividendTax.filer : taxes.dividendTax.nonFiler;
      const need = (target.get() * 12) / (1 - tax) / (yld.get() / 100 || 1);
      out.innerHTML = "";
      out.append(h("div", { class: "muted small" }, "You'd need to invest about"), h("div", { class: "result-big" }, fmt.rsc(need)),
        h("div", { class: "muted small" }, `Gross dividends ${fmt.rs(target.get() * 12 / (1 - tax))} / yr, minus ${tax * 100}% tax.`),
        h("a", { class: "btn sm", href: `#/calculators/goal?target=${Math.round(need)}`, style: { marginTop: "10px" } }, "Plan how to get there"));
    };
    [target, yld].forEach((f) => f.input.addEventListener("input", run));
    filer.input.addEventListener("change", run);
    run();
    return h("div", { class: "card" }, h("h2", {}, "Dividend income goal"), target.el, yld.el, filer.el, out);
  }
})();
