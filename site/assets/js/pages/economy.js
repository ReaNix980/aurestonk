/* Economy: policy rate, inflation, USD/PKR, and whether the market beats inflation. */
"use strict";
(function () {
  const { h, fmt, data } = A;

  Pages.economy = async function (app) {
    app.append(UI.pageHead("Economy", "Interest rates, inflation and the rupee — the numbers that move the PSX.", null, [["Overview", "#/"], "Economy"]));
    const ld = UI.loading(2);
    app.append(ld);
    const [man, econ, idx] = await Promise.all([data.config("economy-manual"), data.economy(), data.history("KSE100")]);
    ld.remove();
    const usd = econ.usdpkrDaily || [];
    const usdLast = usd[usd.length - 1], usdYearAgo = usd.find((r) => r[0] >= new Date(Date.parse(usdLast?.[0] || 0) - 365 * 86400e3).toISOString().slice(0, 10));
    const st = F.historyStats(idx.d) || {};
    const infl = econ.inflationAnnual || [];
    const avgInfl = (n) => { const a = infl.slice(-n); return a.length ? a.reduce((x, y) => x + y[1], 0) / a.length : null; };
    const real10 = st.y10 !== null && st.y10 !== undefined && avgInfl(10) !== null ? ((1 + st.y10 / 100) / (1 + avgInfl(10) / 100) - 1) * 100 : null;

    app.append(h("div", { class: "grid g4" },
      UI.stat("SBP policy rate", man.policyRate.value.toFixed(2) + "%", "since " + fmt.date(man.policyRate.since), "hero-stat"),
      UI.stat("Inflation (CPI, yearly)", man.cpi.value.toFixed(2) + "%", `${monthName(man.cpi.month)} · target ${man.inflationTarget}`),
      UI.stat("USD / PKR", usdLast ? fmt.num(usdLast[1], 2) : "—", usdYearAgo ? h("span", {}, "1 year change ", h("b", { class: usdLast[1] > usdYearAgo[1] ? "down" : "up" }, fmt.pct((usdLast[1] / usdYearAgo[1] - 1) * 100, 1))) : ""),
      UI.stat("Real interest rate", (man.policyRate.value - man.cpi.value).toFixed(2) + "%", "policy rate minus inflation")));

    app.append(h("div", { class: "card", style: { marginTop: "16px" } }, h("h2", {}, "Is the stock market beating inflation?"),
      h("div", { class: "grid g3" },
        UI.stat("KSE-100, 10-year average", fmt.pct(st.y10, 1), "price growth per year (dividends extra)"),
        UI.stat("Inflation, 10-year average", avgInfl(10) !== null ? avgInfl(10).toFixed(1) + "%" : "—", "per year (World Bank)"),
        UI.stat("Real growth per year", h("span", { class: fmt.cls(real10) }, fmt.pct(real10, 1)), "after inflation, before dividends")),
      h("p", { class: "muted small", style: { marginBottom: 0 } }, "Dividends usually add several percent a year on top. The Planner lets you include both.")));

    const cpiBox = h("div", {}), fxBox = h("div", {}), usdBox = h("div", {}), gdpBox = h("div", {});
    app.append(h("div", { class: "grid g2", style: { marginTop: "16px" } },
      h("div", { class: "card" }, h("h2", {}, "Inflation by year"), cpiBox),
      h("div", { class: "card" }, h("h2", {}, "Recent monthly inflation"), h("div", { id: "cpiM" }))));
    app.append(h("div", { class: "grid g2", style: { marginTop: "16px" } },
      h("div", { class: "card" }, h("h2", {}, "USD / PKR (daily)"), usdBox),
      h("div", { class: "card" }, h("h2", {}, "Economic growth (GDP) by year"), gdpBox)));
    app.append(h("div", { class: "card", style: { marginTop: "16px" } }, h("h2", {}, "Rupee per dollar, yearly average"), fxBox));
    const l15 = infl.slice(-15);
    Charts.bars(cpiBox, { labels: l15.map((x) => String(x[0])), series: [{ name: "Inflation", values: l15.map((x) => x[1]), color: (v) => (v > 10 ? "#e76f51" : "#c9a227") }], yFmt: (v) => v + "%", height: 240 });
    const cm = man.cpiMonthly || [];
    Charts.bars(document.getElementById("cpiM"), { labels: cm.map((x) => monthName(x[0], true)), series: [{ name: "CPI yearly change", values: cm.map((x) => x[1]), color: "#c9a227" }], yFmt: (v) => v + "%", height: 240 });
    if (usd.length > 1) Charts.line(usdBox, { height: 240, series: [{ name: "USD/PKR", data: window.thinSeries(usd), color: "#1f7a63", area: true }], yFmt: (v) => v.toFixed(0) });
    else usdBox.append(h("p", { class: "muted" }, "Daily rates start collecting with the first update."));
    const g = (econ.gdpGrowth || []).slice(-15);
    Charts.bars(gdpBox, { labels: g.map((x) => String(x[0])), series: [{ name: "GDP growth", values: g.map((x) => x[1]), color: (v) => (v >= 0 ? "var(--up)" : "var(--down)") }], yFmt: (v) => v + "%", height: 240 });
    const fx = (econ.usdpkrAnnual || []).slice(-20);
    Charts.line(fxBox, { x: "num", height: 240, xFmt: (v) => String(Math.round(v)), tipX: (v) => String(v), series: [{ name: "PKR per USD", data: fx, color: "#c9a227", area: true }], yFmt: (v) => v.toFixed(0) });
    app.append(h("p", { class: "help", style: { marginTop: "14px" } }, `Sources: State Bank of Pakistan and Pakistan Bureau of Statistics (latest figures, updated by hand), World Bank (yearly data), open exchange-rate data (daily USD/PKR).`));
  };
  function monthName(ym, short) { const [y, m] = ym.split("-"); return A.fmt.MONTHS[+m - 1] + (short ? " " + y.slice(2) : " " + y); }
})();
