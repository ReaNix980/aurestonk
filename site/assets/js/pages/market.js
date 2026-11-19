/* Market: KSE-100 chart (hourly for short ranges), stats, breadth, movers, sectors, yearly returns. */
"use strict";
(function () {
  const { h, fmt, data } = A;

  Pages.market = async function (app) {
    app.append(UI.pageHead("Market", "The KSE-100 index — the benchmark of the 100 largest companies listed on the Pakistan Stock Exchange.", null, [["Overview", "#/"], "Market"]));
    const ld = UI.loading(3);
    app.append(ld);
    const [market, stocks, hist] = await Promise.all([data.market(), data.stocks(), data.history("KSE100")]);
    ld.remove();
    const ix = market.index;
    const st = F.historyStats(hist.d);
    app.append(h("div", { class: "grid g4" },
      UI.stat("KSE-100", fmt.num(ix.value, 2), h("span", { class: fmt.cls(ix.chg) }, `${fmt.num(ix.chg, 2)} (${fmt.pct(ix.chgPct)})`), "hero-stat"),
      UI.stat("Day range", `${fmt.num(ix.low, 0)} – ${fmt.num(ix.high, 0)}`, "Open " + fmt.num(ix.open, 0)),
      UI.stat("Advancers / decliners", h("span", {}, h("span", { class: "up" }, String(market.breadth.up)), " / ", h("span", { class: "down" }, String(market.breadth.down))), `${market.breadth.flat} unchanged`),
      UI.stat("1-year change", h("span", { class: fmt.cls(st?.y1) }, fmt.pct(st?.y1)), `5-yr average: ${fmt.pct(st?.y5)} / yr`)));

    const chartCard = h("div", { class: "card", style: { marginTop: "16px" } }, h("div", { class: "card-h" }, h("h2", {}, "KSE-100 chart")));
    const perf = h("div", { class: "small muted", style: { marginTop: "6px" } });
    app.append(chartCard);
    UI.priceChart(chartCard, "KSE100", { onRange: (rows, r) => {
      const ch = (rows[rows.length - 1][4] / rows[0][1] - 1) * 100;
      perf.innerHTML = `${r === "ALL" ? "All time" : r}: <b class="${fmt.cls(ch)}">${fmt.pct(ch)}</b>`;
    } });
    chartCard.append(perf);

    const list = stocks.stocks;
    const tblFor = (rows, extra) => UI.table([
      { key: "s", label: "Stock", render: UI.symCell, sortable: false },
      { key: "price", label: "Price", num: true, render: (s) => fmt.px(s.price) },
      extra === "vol" ? { key: "vol", label: "Volume", num: true, render: (s) => fmt.compact(s.vol, 1) } : null,
      { key: "chgPct", label: "Change", num: true, render: (s) => UI.chgCell(s.chgPct) },
    ].filter(Boolean), rows, { compact: true, sort: extra === "vol" ? "vol" : "chgPct", asc: extra === "down" }).el;
    let tabSel = "gainers";
    const moversBox = h("div", {});
    const drawMovers = () => {
      moversBox.innerHTML = "";
      const m = { gainers: list.slice().sort((a, b) => b.chgPct - a.chgPct).slice(0, 10), losers: list.slice().sort((a, b) => a.chgPct - b.chgPct).slice(0, 10), active: list.slice().sort((a, b) => b.vol - a.vol).slice(0, 10) };
      moversBox.append(tblFor(m[tabSel], tabSel === "active" ? "vol" : tabSel === "losers" ? "down" : ""));
    };
    drawMovers();
    const secBox = h("div", {});
    app.append(h("div", { class: "grid g2", style: { marginTop: "16px" } },
      h("div", { class: "card" }, h("div", { class: "card-h" }, h("h2", {}, "Movers"),
        UI.tabs([["gainers", "Gainers"], ["losers", "Losers"], ["active", "Most active"]], tabSel, (v) => { tabSel = v; drawMovers(); })),
        moversBox, h("a", { class: "link", href: "#/stocks", style: { marginTop: "12px" } }, "All stocks")),
      h("div", { class: "card" }, h("div", { class: "card-h" }, h("h2", {}, "Sectors today"), h("span", { class: "muted small" }, "weighted by market value")), secBox)));
    Charts.hbars(secBox, { items: market.sectors.slice(0, 14).map((s) => ({ label: s.name, value: s.chgPct })), fmt: (v) => fmt.pct(v) });

    // performance & risk
    const yrBox = h("div", {});
    app.append(h("div", { class: "grid g2", style: { marginTop: "16px" } },
      h("div", { class: "card" }, h("h2", {}, "Long-term performance"),
        h("p", { class: "muted small", style: { marginTop: 0 } }, "Average yearly growth of the index price (dividends not included)."),
        h("div", { class: "kv" },
          kv("1 year", fmt.pct(st?.y1)), kv("3 years (per yr)", fmt.pct(st?.y3)), kv("5 years (per yr)", fmt.pct(st?.y5)),
          kv("10 years (per yr)", fmt.pct(st?.y10)), kv("Volatility (yearly)", fmt.pct(st?.vol, 1, false)), kv("Worst fall from a peak", fmt.pct(st?.maxDrawdown, 1))),
        h("div", { class: "row", style: { marginTop: "14px" } },
          h("a", { class: "btn primary sm", href: `#/planner?ret=${(st?.y10 ?? st?.y5 ?? 15).toFixed(1)}` }, "Use in Projection"))),
      h("div", { class: "card" }, h("h2", {}, "Year by year"), yrBox)));
    const ann = (st?.annual || []).slice(-12);
    Charts.bars(yrBox, { labels: ann.map((a) => a[0]), series: [{ name: "Return", values: ann.map((a) => +a[1].toFixed(1)), color: (v) => (v >= 0 ? "var(--up)" : "var(--down)") }],
      yFmt: (v) => v + "%", height: 240 });
  };

  const kv = (k, v) => h("div", {}, h("div", { class: "k" }, k), h("div", { class: "v" }, v));
  window.kvCell = kv;
})();
