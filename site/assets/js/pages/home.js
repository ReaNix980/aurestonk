/* Overview: market-first landing page. */
"use strict";
(function () {
  const { h, fmt, data } = A;

  Pages.home = async function (app) {
    const ixPanel = h("div", { class: "ix-panel" }, h("div", { class: "skeleton", style: { height: "230px", border: 0 } }));
    app.append(h("section", { class: "ov-hero" },
      h("div", {},
        h("h1", {}, "The PSX, ", h("span", {}, "made clear.")),
        h("p", { class: "lead" }, "Market data, dividend research, portfolio tracking and long-term projections for KSE-100 investors — in one place, free."),
        h("div", { class: "hero-search", role: "button", tabindex: 0, onclick: () => window.openSearch(), onkeydown: (e) => { if (e.key === "Enter") window.openSearch(); } },
          h("span", { html: Icon("search", 17) }), h("span", { class: "hs-text" }, "Search a symbol, company or tool"), h("span", { class: "kbd" }, "Ctrl K")),
        h("div", { class: "hero-links" },
          ...[["Top 20 dividend stocks", "#/stocks?list=top-dividend"], ["Shariah-compliant", "#/stocks?list=shariah"], ["Upcoming payouts", "#/dividends"]]
            .map(([t, u]) => h("a", { href: u, html: `<span>${t}</span>` + Icon("arrow", 14) })))),
      ixPanel));

    const movers = h("div", {});
    const sectors = h("div", {});
    app.append(h("div", { class: "grid split" },
      h("div", { class: "card" }, movers),
      h("div", { class: "card" }, h("div", { class: "card-h" }, h("h2", {}, "Sectors"), h("span", { class: "muted small" }, "Today, weighted by market value")), sectors)));

    app.append(h("div", { class: "sec-h" }, h("h2", {}, "Screens"), h("a", { class: "link", href: "#/stocks", html: "All stocks " + Icon("arrow", 14) })),
      h("div", { class: "screens" }, UI.QUICK.map((q) => h("a", { class: "screen", href: "#/stocks?list=" + q.id, html:
        Icon(q.icon, 18) + `<div><b>${q.label}</b><small>${q.desc}</small></div><span class="go">${Icon("arrow", 15)}</span>` }))));

    app.append(h("div", { class: "sec-h" }, h("h2", {}, "Tools")),
      h("div", { class: "tools" },
        tool("#/portfolio", "wallet", "Portfolio", "Holdings, profit, dividends received and performance against the KSE-100. Stored privately in your browser."),
        tool("#/planner", "target", "Projection", "One projection combining market returns, dividends, inflation, salary growth, currency and tax — with a conservative-to-optimistic dial."),
        tool("#/dividends", "coins", "Dividends", "Announced payouts with book-closure dates, the highest-yielding stocks and each company's history."),
        tool("#/calculators", "calc", "Calculators", "SIP, CAGR, trade ROI, DCF, position sizing, salary tax, Zakat and loan calculators.")));

    try {
      const [market, hist, { stocks }] = await Promise.all([data.market(), data.history("KSE100"), data.stocks()]);
      const ix = market.index;
      const chartEl = h("div", {});
      let range = "1Y";
      const drawIx = () => {
        chartEl.innerHTML = "";
        const n = { "1M": 22, "6M": 126, "1Y": 250, "5Y": 1250 }[range];
        const rows = hist.d.slice(-n);
        const up = rows[rows.length - 1][4] >= rows[0][4];
        Charts.line(chartEl, { height: 200, legend: false, series: [{ name: "KSE-100", data: window.thinSeries(rows.map((r) => [r[0], r[4]]), 300), color: up ? "var(--up)" : "var(--down)", area: true }],
          yFmt: (v) => fmt.compact(v, 0), pad: { t: 8, r: 6, b: 22, l: 52 } });
      };
      ixPanel.innerHTML = "";
      ixPanel.append(
        h("div", { class: "ix-top" },
          h("div", {}, h("div", { class: "lbl3" }, "KSE-100 Index"), h("div", { class: "big" }, fmt.num(ix.value, 2)),
            h("div", { class: fmt.cls(ix.chg), style: { fontFamily: "var(--mono)", fontSize: "13.5px" } }, `${ix.chg >= 0 ? "+" : ""}${fmt.num(ix.chg, 2)}  ${fmt.pct(ix.chgPct)}`)),
          UI.tabs([["1M", "1M"], ["6M", "6M"], ["1Y", "1Y"], ["5Y", "5Y"]], range, (v) => { range = v; drawIx(); })),
        chartEl,
        h("div", { class: "ix-meta" },
          h("span", {}, "Open ", h("b", {}, fmt.num(ix.open, 0))), h("span", {}, "High ", h("b", {}, fmt.num(ix.high, 0))), h("span", {}, "Low ", h("b", {}, fmt.num(ix.low, 0))),
          h("span", {}, "Adv/Dec ", h("b", {}, `${market.breadth.up}/${market.breadth.down}`)), h("span", { style: { marginLeft: "auto" } }, fmt.date(market.asOf))));
      drawIx();

      let tab = "gainers";
      const body = h("div", {});
      const drawMovers = () => {
        body.innerHTML = "";
        const sorted = { gainers: stocks.slice().sort((a, b) => b.chgPct - a.chgPct), losers: stocks.slice().sort((a, b) => a.chgPct - b.chgPct), active: stocks.slice().sort((a, b) => b.vol - a.vol) }[tab].slice(0, 8);
        body.append(UI.table([
          { key: "s", label: "Symbol", render: UI.symCell, sortable: false },
          { key: "price", label: "Last", num: true, render: (s) => fmt.num(s.price, 2), sortable: false },
          { key: "chgPct", label: "Change", num: true, render: (s) => UI.chgCell(s.chgPct), sortable: false },
          { key: "vol", label: "Volume", num: true, render: (s) => fmt.compact(s.vol, 2), sortable: false },
        ], sorted, { compact: true, onRow: (s) => (location.hash = "#/stock/" + s.s) }).el);
      };
      movers.append(h("div", { class: "card-h" }, h("h2", {}, "Movers"), UI.tabs([["gainers", "Gainers"], ["losers", "Losers"], ["active", "Most active"]], tab, (v) => { tab = v; drawMovers(); })), body);
      drawMovers();
      Charts.hbars(sectors, { items: market.sectors.slice(0, 11).map((s) => ({ label: s.name, value: s.chgPct })), fmt: (v) => fmt.pct(v) });
    } catch (e) {
      ixPanel.innerHTML = "";
      ixPanel.append(h("p", { class: "muted" }, "Market data isn't available yet."));
    }
  };

  const tool = (href, icon, title, text) => h("a", { class: "tool", href, html: Icon(icon, 22) + `<b>${title}</b><span>${text}</span>` });
})();
