/* Stock page: same layout for every stock — price, chart, key numbers, dividends, "what if", peers. */
"use strict";
(function () {
  const { h, fmt, data } = A;

  Pages.stock = async function (app, params) {
    const sym = (params[0] || "").toUpperCase();
    const ld = UI.loading(3);
    app.append(ld);
    const [{ stocks, asOf }, hist, taxes] = await Promise.all([data.stocks(), data.history(sym).catch(() => null), data.config("taxes")]);
    ld.remove();
    const s = stocks.find((x) => x.s === sym);
    if (!s) {
      app.append(h("div", { class: "empty-state" }, h("div", { html: Icon("search", 34) }), h("h2", {}, `We couldn't find “${sym}”`),
        h("p", {}, "Aurestonk currently covers KSE-100 stocks."), h("button", { class: "btn primary", onclick: () => window.openSearch() }, "Search stocks")));
      return;
    }
    const stats = hist ? F.historyStats(hist.d, hist.div) : null;
    // header
    app.append(
      h("div", { class: "quote-head" },
        h("div", {}, h("div", { class: "crumb" }, h("a", { href: "#/stocks" }, "Stocks"), h("span", {}, "/"), h("span", {}, s.sec || "")),
          h("h1", { style: { marginBottom: 0 } }, h("span", { style: { fontFamily: "var(--mono)" } }, s.s), " ", h("span", { class: "name", style: { fontSize: "18px" } }, s.n)),
          h("div", { class: "tag-row" }, h("span", { class: "badge" }, s.sec || "—"), s.kse100 ? h("span", { class: "badge" }, "KSE-100") : null,
            s.kmi30 ? h("span", { class: "badge green" }, "Shariah · KMI-30") : null, s.divYield >= 6 ? h("span", { class: "badge gold" }, "High yield") : null)),
        h("div", { style: { textAlign: "right" } },
          h("div", { class: "price" }, fmt.pkr(s.price)),
          h("div", { class: fmt.cls(s.chg), style: { fontFamily: "var(--mono)" } }, `${s.chg >= 0 ? "+" : ""}${fmt.num(s.chg, 2)}  ${fmt.pct(s.chgPct)}`),
          h("div", { class: "muted small" }, "Close on " + fmt.date(asOf)),
          h("div", { class: "row", style: { justifyContent: "flex-end", marginTop: "8px" } },
            UI.ibtn("plus", "Add to portfolio", { class: "btn sm primary", onclick: () => window.addToPortfolio?.(s.s, s.price) }),
            UI.ibtn("columns", "Compare", { class: "btn sm", href: `#/calculators/compare?s=${s.s}` })))));

    const chart = h("div", { class: "card" });
    const rangeNote = h("div", { class: "small muted", style: { marginTop: "6px" } });
    UI.priceChart(chart, sym, { onRange: (rows, r) => {
      const ch = (rows[rows.length - 1][4] / rows[0][1] - 1) * 100;
      rangeNote.innerHTML = `${r === "ALL" ? "All time" : r} change: <b class="${fmt.cls(ch)}">${fmt.pct(ch)}</b>`;
    } });
    chart.append(rangeNote);
    app.append(chart);

    // key numbers
    const pos52 = s.high52 > s.low52 ? ((s.price - s.low52) / (s.high52 - s.low52)) * 100 : 50;
    app.append(h("div", { class: "grid g2", style: { marginTop: "16px" } },
      h("div", { class: "card" }, h("h2", {}, "Key numbers"),
        h("div", { class: "kv" },
          kvc("Market cap", fmt.rsc(s.mcap), "Total value of all shares"),
          kvc("P/E ratio", s.pe > 0 ? s.pe.toFixed(1) : "—", "Price ÷ yearly earnings per share"),
          kvc("EPS", s.eps ? fmt.pkr(s.eps) : "—", "Earnings per share"),
          kvc("Dividend yield", s.divYield ? s.divYield.toFixed(2) + "%" : "—", "Last 12 months"),
          kvc("Dividends (12m)", s.dps12m ? fmt.pkr(s.dps12m) : "—", "Per share"),
          kvc("Volume", fmt.compact(s.vol, 1), "Shares traded last session"),
          kvc("Day range", `${fmt.px(s.low)} – ${fmt.px(s.high)}`),
          kvc("Shares", s.shares ? fmt.compact(s.shares, 2) : "—")),
        h("div", { style: { marginTop: "14px" } },
          h("div", { class: "row small", style: { justifyContent: "space-between" } }, h("span", {}, "52-week low ", h("b", {}, fmt.px(s.low52))), h("span", {}, "high ", h("b", {}, fmt.px(s.high52)))),
          h("div", { class: "progress", style: { marginTop: "6px", position: "relative" } }, h("i", { style: { width: Math.max(2, Math.min(100, pos52)) + "%" } })),
          h("div", { class: "help" }, `Price is ${pos52.toFixed(0)}% of the way from its 1-year low to its 1-year high.`))),
      h("div", { class: "card" }, h("h2", {}, "Performance"),
        h("div", { class: "kv" },
          kvc("1 month", ret(s.r1m)), kvc("6 months", ret(s.r6m)), kvc("1 year", ret(s.r1y)),
          kvc("3 years (total)", ret(s.r3y)), kvc("5 years (total)", ret(s.r5y)),
          kvc("10-yr avg / year", ret(stats?.y10)),
          kvc("Volatility", stats ? stats.vol.toFixed(1) + "%" : "—", "Yearly price swings — higher = bumpier"),
          kvc("Worst fall from peak", ret(stats?.maxDrawdown))),
        h("p", { class: "help", style: { marginTop: "10px" } }, "Price change only. Dividends are on top of this — see the “what if” calculator below for the full picture."))));

    // dividends
    const divs = (hist?.div || []).slice().reverse();
    const divBox = h("div", {});
    app.append(h("div", { class: "card", style: { marginTop: "16px" } },
      h("div", { class: "card-h" }, h("h2", {}, "Dividend history"), h("a", { class: "link", href: "#/dividends" }, "Upcoming payouts")), divBox));
    if (!divs.length) divBox.append(h("p", { class: "muted" }, "No cash dividends on record for this company."));
    else {
      const byYear = {};
      for (const [d, a] of divs) byYear[d.slice(0, 4)] = (byYear[d.slice(0, 4)] || 0) + a;
      const years = Object.keys(byYear).sort().slice(-10);
      const chartEl = h("div", {});
      divBox.append(h("div", { class: "grid g2" }, h("div", {}, h("h3", {}, "Per share, by year"), chartEl),
        h("div", {}, h("h3", {}, "Recent payouts"), UI.table([
          { key: "0", label: "Date", render: (r) => fmt.date(r[0]) },
          { key: "1", label: "Per share", num: true, render: (r) => fmt.pkr(r[1]) },
          { key: "y", label: "Yield then", num: true, render: (r) => { const p = hist.d.find((x) => x[0] >= r[0]); return p ? (r[1] / p[4] * 100).toFixed(2) + "%" : "—"; }, sortable: false },
        ], divs.slice(0, 12), { compact: true }).el)));
      Charts.bars(chartEl, { labels: years, series: [{ name: "Dividend per share", values: years.map((y) => +fmt.conv(byYear[y]).toFixed(4)), color: "#c9a227" }], yFmt: (v) => fmt.sym() + " " + v, height: 220 });
    }

    // what if
    if (hist) app.append(whatIf(s, hist, taxes));

    // peers
    const peers = stocks.filter((x) => x.sec === s.sec && x.s !== s.s).sort((a, b) => (b.mcap || 0) - (a.mcap || 0)).slice(0, 8);
    if (peers.length) app.append(h("div", { class: "card", style: { marginTop: "16px" } }, h("h2", {}, `Other ${s.sec} companies`),
      UI.table([
        { key: "s", label: "Stock", render: UI.symCell },
        { key: "price", label: "Price", num: true, render: (x) => fmt.px(x.price) },
        { key: "chgPct", label: "Today", num: true, render: (x) => UI.chgCell(x.chgPct) },
        { key: "pe", label: "P/E", num: true, render: (x) => (x.pe > 0 ? x.pe.toFixed(1) : "—") },
        { key: "divYield", label: "Div. yield", num: true, render: (x) => (x.divYield ? x.divYield.toFixed(2) + "%" : "—") },
        { key: "r1y", label: "1Y", num: true, render: (x) => ret(x.r1y) },
      ], [s, ...peers], { compact: true, sort: "mcap", onRow: (x) => (location.hash = "#/stock/" + x.s) }).el));
  };

  function whatIf(s, hist, taxes) {
    const first = hist.d[0][0];
    const defStart = new Date(Date.parse(hist.d[hist.d.length - 1][0]) - 5 * 365.25 * 86400e3).toISOString().slice(0, 10);
    const start = UI.textField("Start date", defStart > first ? defStart : first, { type: "date" });
    const monthly = UI.numField("Invest every month", 10000, { pre: "Rs" });
    const initial = UI.numField("Plus a starting amount", 0, { pre: "Rs" });
    const reinvest = UI.checkField("Reinvest dividends", true);
    const filer = UI.checkField("I'm a tax filer (lower dividend tax)", true);
    const out = h("div", {});
    const chartEl = h("div", {});
    const run = () => {
      const r = F.backtest(hist, { start: start.get() || first, monthly: monthly.get(), initial: initial.get(), reinvest: reinvest.get(),
        divTax: filer.get() ? taxes.dividendTax.filer : taxes.dividendTax.nonFiler, feePct: taxes.brokerage.commissionPct });
      out.innerHTML = "";
      chartEl.innerHTML = "";
      if (!r) { out.append(h("p", { class: "muted" }, "Pick a start date inside the price history.")); return; }
      const sav = F.savingsCurve(r.series, 10);
      out.append(h("div", { class: "grid g3" },
        UI.stat("You would have", fmt.rsc(r.value), `from ${fmt.rsc(r.invested)} invested`, "hero-stat"),
        UI.stat("Profit", h("span", { class: fmt.cls(r.gain) }, fmt.rsc(r.gain)), `${fmt.pct(r.invested ? (r.gain / r.invested) * 100 : 0, 1)} total`),
        UI.stat("Yearly return (XIRR)", h("span", { class: fmt.cls(r.xirr) }, fmt.pct(r.xirr, 1)), `Dividends received: ${fmt.rsc(r.dividends)}`)));
      Charts.line(chartEl, { height: 260, yFmt: (v) => fmt.compact(v, 1), series: [
        { name: `${s.s} portfolio`, data: thin(r.series.map((x) => [x[0], x[1]])), area: true, color: "#c9a227" },
        { name: "Money invested", data: thin(r.series.map((x) => [x[0], x[2]])), color: "#64748b", dash: true },
        { name: "Savings account at 10%", data: thin(sav), color: "#3b82f6" }] });
    };
    [start, monthly, initial, reinvest, filer].forEach((f) => f.input.addEventListener("input", A.debounce(run, 250)));
    [reinvest, filer].forEach((f) => f.input.addEventListener("change", run));
    setTimeout(run, 0);
    return h("div", { class: "card", style: { marginTop: "16px" } },
      h("h2", {}, `What if I had invested in ${s.s}?`),
      h("p", { class: "muted small", style: { marginTop: 0 } }, "Uses real past prices and dividends (after tax and broker fees). The past doesn't guarantee the future."),
      h("div", { class: "side-layout" }, h("div", {}, start.el, monthly.el, initial.el, reinvest.el, filer.el), h("div", {}, out, h("div", { style: { marginTop: "14px" } }, chartEl))));
  }

  const thin = (arr, n = 400) => (arr.length <= n ? arr : arr.filter((_, i) => i % Math.ceil(arr.length / n) === 0 || i === arr.length - 1));
  const ret = (v) => h("span", { class: fmt.cls(v) }, fmt.pct(v, 1));
  const kvc = (k, v, title) => h("div", { title: title || "" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v));
  window.thinSeries = thin;
})();
