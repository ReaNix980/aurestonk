/* Stocks: all KSE-100 stocks, quick lists, search, sector & Shariah filters, column views, CSV export. */
"use strict";
(function () {
  const { h, fmt, data, store } = A;

  const VIEWS = {
    overview: ["price", "chgPct", "vol", "mcap", "pe", "divYield", "r1y"],
    returns: ["price", "r1m", "r6m", "r1y", "r3y", "r5y"],
    dividends: ["price", "dps12m", "divYield", "pe", "eps"],
    valuation: ["price", "mcap", "pe", "eps", "high52", "low52"],
  };
  const COLS = {
    price: { label: "Price", render: (s) => fmt.num(s.price, 2) },
    chgPct: { label: "Today", render: (s) => UI.chgCell(s.chgPct) },
    vol: { label: "Volume", render: (s) => fmt.compact(s.vol, 1) },
    mcap: { label: "Market cap", render: (s) => fmt.rsc(s.mcap) },
    pe: { label: "P/E", render: (s) => (s.pe > 0 ? s.pe.toFixed(1) : "—"), sortVal: (s) => (s.pe > 0 ? s.pe : null), ascFirst: true, title: "Price ÷ earnings per share. Lower can mean cheaper." },
    eps: { label: "EPS", render: (s) => fmt.num(s.eps, 2), title: "Earnings per share" },
    divYield: { label: "Div. yield", render: (s) => (s.divYield ? s.divYield.toFixed(2) + "%" : "—"), title: "Cash dividends paid in the last 12 months ÷ price" },
    dps12m: { label: "Dividends (12m)", render: (s) => (s.dps12m ? "Rs " + s.dps12m.toFixed(2) : "—"), title: "Cash dividend per share, last 12 months" },
    r1m: { label: "1M", render: (s) => ret(s.r1m) }, r6m: { label: "6M", render: (s) => ret(s.r6m) },
    r1y: { label: "1Y", render: (s) => ret(s.r1y) }, r3y: { label: "3Y", render: (s) => ret(s.r3y) }, r5y: { label: "5Y", render: (s) => ret(s.r5y) },
    high52: { label: "52w high", render: (s) => fmt.num(s.high52, 2) }, low52: { label: "52w low", render: (s) => fmt.num(s.low52, 2) },
  };
  const ret = (v) => h("span", { class: fmt.cls(v) }, fmt.pct(v, 1));

  Pages.stocks = async function (app, params, query) {
    app.append(UI.pageHead("Stocks", "Every KSE-100 company. Choose a screen, filter, or sort any column.", null, [["Overview", "#/"], "Stocks"]));
    const ld = UI.loading(2);
    app.append(ld);
    const { stocks, asOf } = await data.stocks();
    ld.remove();
    const sectors = [...new Set(stocks.map((s) => s.sec).filter(Boolean))].sort();
    const st = { list: query.list || "", q: query.q || "", sector: query.sector || "", shariah: query.shariah === "1", view: store.get("stocksView", "overview") };

    const chips = h("div", { class: "chips", style: { marginBottom: "14px" } });
    const search = h("input", { class: "inp", type: "search", placeholder: "Filter by symbol or name…", value: st.q, style: { maxWidth: "260px" } });
    const secSel = h("select", { class: "inp", style: { maxWidth: "220px" } }, h("option", { value: "" }, "All sectors"), sectors.map((s) => h("option", { value: s, selected: s === st.sector }, s)));
    const shariah = h("label", { class: "check", style: { margin: 0 } }, h("input", { type: "checkbox", checked: st.shariah }), "Shariah-compliant only");
    const info = h("div", { class: "muted small" });
    const heading = h("div", {});
    const tableBox = h("div", {});
    const viewTabs = UI.tabs([["overview", "Overview"], ["returns", "Returns"], ["dividends", "Dividends"], ["valuation", "Valuation"]], st.view, (v) => { st.view = v; store.set("stocksView", v); draw(); });
    app.append(chips,
      h("div", { class: "card" },
        heading,
        h("div", { class: "row", style: { marginBottom: "12px" } }, search, secSel, shariah, h("span", { class: "spacer" }), viewTabs,
          UI.ibtn("download", "CSV", { class: "btn sm", onclick: exportCSV, title: "Download this table" })),
        tableBox, h("div", { class: "row", style: { marginTop: "10px" } }, info)));

    const allChip = h("a", { class: "chip", href: "#/stocks" }, "All stocks");
    chips.append(allChip, ...UI.QUICK.map((q) => h("a", { class: "chip", href: "#/stocks?list=" + q.id, "data-id": q.id }, q.label)));

    let currentRows = [];
    function draw() {
      A.$$(".chip", chips).forEach((c) => c.classList.toggle("on", (c.dataset.id || "") === st.list));
      const q = UI.QUICK.find((x) => x.id === st.list);
      let rows = q ? q.pick(stocks) : stocks.slice();
      const term = st.q.trim().toUpperCase();
      if (term) rows = rows.filter((s) => s.s.includes(term) || s.n.toUpperCase().includes(term));
      if (st.sector) rows = rows.filter((s) => s.sec === st.sector);
      if (st.shariah) rows = rows.filter((s) => s.kmi30);
      currentRows = rows;
      heading.innerHTML = "";
      heading.append(h("div", { class: "card-h" }, h("div", {}, h("h2", { style: { margin: 0 } }, q ? q.label : "All KSE-100 stocks"),
        h("div", { class: "muted small" }, q ? q.desc : "Sort by any column. Select a row to open the stock."))));
      let view = VIEWS[st.view];
      if (q && q.sort && !view.includes(q.sort)) view = [...view.slice(0, 2), q.sort, ...view.slice(2)];
      const cols = [{ key: "s", label: "Stock", render: UI.symCell, sortVal: (s) => s.s, ascFirst: true },
        { key: "sec", label: "Sector", render: (s) => h("span", { class: "muted small" }, s.sec, s.kmi30 ? h("span", { class: "badge green", style: { marginLeft: "6px" }, title: "KMI-30 (Shariah)" }, "S") : null) },
        ...view.map((k) => Object.assign({ key: k, num: true }, COLS[k]))];
      tableBox.innerHTML = "";
      tableBox.append(UI.table(cols, rows, { sort: q ? q.sort : "mcap", asc: q ? !!q.asc : false, onRow: (s) => (location.hash = "#/stock/" + s.s),
        empty: "No stocks match these filters." }).el);
      info.textContent = `${rows.length} stock${rows.length === 1 ? "" : "s"} · prices as of ${fmt.date(asOf)}`;
    }
    const sync = () => {
      const p = new URLSearchParams();
      if (st.list) p.set("list", st.list);
      if (st.q) p.set("q", st.q);
      if (st.sector) p.set("sector", st.sector);
      if (st.shariah) p.set("shariah", "1");
      history.replaceState(null, "", "#/stocks" + (p.toString() ? "?" + p : ""));
    };
    search.addEventListener("input", A.debounce(() => { st.q = search.value; sync(); draw(); }, 120));
    secSel.addEventListener("change", () => { st.sector = secSel.value; sync(); draw(); });
    shariah.querySelector("input").addEventListener("change", (e) => { st.shariah = e.target.checked; sync(); draw(); });
    function exportCSV() {
      const keys = ["s", "n", "sec", "price", "chgPct", "vol", "mcap", "pe", "eps", "dps12m", "divYield", "r1y", "r3y", "r5y", "high52", "low52", "kmi30"];
      A.download(`aurestonk-stocks-${asOf}.csv`, A.csv([keys, ...currentRows.map((s) => keys.map((k) => s[k]))]), "text/csv");
    }
    draw();
  };
})();
