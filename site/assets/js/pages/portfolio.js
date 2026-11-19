/* Portfolio: private (saved in this browser), multiple portfolios, automatic dividends,
   P/L, XIRR, vs KSE-100, allocation, dividend income, CSV import/export, backup/restore. */
"use strict";
(function () {
  const { h, fmt, data, store, uid, todayISO } = A;
  const KEY = "portfolios.v1";

  /* ---------------- storage */
  function loadAll() {
    const v = store.get(KEY, null);
    if (v && Array.isArray(v.list) && v.list.length) return v;
    const p = { id: uid(), name: "My portfolio", created: todayISO(), settings: { filer: true, autoDiv: true }, tx: [] };
    return { active: p.id, list: [p], changedSinceBackup: 0 };
  }
  function saveAll(all) {
    all.changedSinceBackup = (all.changedSinceBackup || 0) + 1;
    if (!store.set(KEY, all)) A.toast("Couldn't save — your browser may block storage in private mode.");
  }
  const active = (all) => all.list.find((p) => p.id === all.active) || all.list[0];

  /* ---------------- calculations */
  async function compute(pf, taxes) {
    const tx = pf.tx.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.type === "buy" ? -1 : 1));
    const syms = [...new Set(tx.filter((t) => t.s).map((t) => t.s))];
    const [{ stocks, asOf }, ...hists] = await Promise.all([data.stocks(), ...syms.map((s) => data.history(s).catch(() => ({ d: [], div: [] })))]);
    const H = Object.fromEntries(syms.map((s, i) => [s, hists[i]]));
    const info = Object.fromEntries(stocks.map((s) => [s.s, s]));
    const divTax = pf.settings.filer ? taxes.dividendTax.filer : taxes.dividendTax.nonFiler;

    // dividend events (automatic from history + manual entries)
    const events = [];
    if (pf.settings.autoDiv) for (const s of syms) {
      const first = tx.find((t) => t.s === s)?.date;
      for (const [d, amt] of H[s].div || []) {
        if (d <= first || d > todayISO()) continue;
        const manual = tx.some((t) => t.type === "div" && t.s === s && Math.abs(Date.parse(t.date) - Date.parse(d)) < 20 * 86400e3);
        if (!manual) events.push({ date: d, s, perShare: amt, auto: true });
      }
    }
    const all = [...tx.map((t) => ({ ...t })), ...events.map((e) => ({ type: "autodiv", ...e }))]
      .sort((a, b) => a.date.localeCompare(b.date) || order(a) - order(b));

    const pos = {};
    const flows = [];
    let realized = 0, divTotal = 0, feesTotal = 0, netInvested = 0;
    const divByMonth = {};
    const divBySym = {};
    for (const t of all) {
      const p = (pos[t.s] = pos[t.s] || { s: t.s, qty: 0, cost: 0 });
      if (t.type === "buy") {
        const c = t.qty * t.price + (t.fee || 0);
        p.qty += t.qty; p.cost += c; feesTotal += t.fee || 0; netInvested += c;
        flows.push([t.date, -c]);
      } else if (t.type === "sell") {
        const avg = p.qty ? p.cost / p.qty : 0;
        const q = Math.min(t.qty, p.qty);
        const proceeds = q * t.price - (t.fee || 0);
        realized += proceeds - avg * q;
        p.qty -= q; p.cost -= avg * q; feesTotal += t.fee || 0; netInvested -= proceeds;
        flows.push([t.date, proceeds]);
      } else if (t.type === "bonus") {
        p.qty += t.qty; // bonus shares: cost unchanged, average falls
      } else if (t.type === "div" || t.type === "autodiv") {
        const qtyHeld = t.type === "autodiv" ? qtyBefore(all, t.s, t.date) : null;
        const net = t.type === "autodiv" ? qtyHeld * t.perShare * (1 - divTax) : t.amount || 0;
        if (net <= 0) continue;
        t.net = net; t.qtyHeld = qtyHeld;
        divTotal += net;
        const m = t.date.slice(0, 7);
        divByMonth[m] = (divByMonth[m] || 0) + net;
        divBySym[t.s] = (divBySym[t.s] || 0) + net;
        flows.push([t.date, net]);
      }
    }
    const holdings = Object.values(pos).filter((p) => p.qty > 0.0001).map((p) => {
      const st = info[p.s] || {};
      const hist = H[p.s]?.d || [];
      const price = st.price ?? hist[hist.length - 1]?.[4] ?? 0;
      const value = p.qty * price;
      return { ...p, n: st.n || p.s, sec: st.sec || "Other", price, value, avg: p.cost / p.qty, pl: value - p.cost,
        plPct: p.cost ? (value / p.cost - 1) * 100 : 0, dayChg: p.qty * (st.chg || 0), chgPct: st.chgPct || 0, divs: divBySym[p.s] || 0, yld: st.divYield || 0 };
    });
    const value = holdings.reduce((a, b) => a + b.value, 0);
    const cost = holdings.reduce((a, b) => a + b.cost, 0);
    const dayChg = holdings.reduce((a, b) => a + b.dayChg, 0);
    holdings.forEach((x) => (x.weight = value ? (x.value / value) * 100 : 0));
    const xirr = flows.length ? F.xirr([...flows.sort((a, b) => a[0].localeCompare(b[0])), [asOf, value]]) : null;
    return { holdings, value, cost, unrealized: value - cost, realized, divTotal, feesTotal, netInvested, dayChg, xirr, asOf,
      all, H, divByMonth, syms, totalReturn: value - cost + realized + divTotal };
  }
  const order = (t) => ({ buy: 0, bonus: 1, autodiv: 2, div: 2, sell: 3 }[t.type] ?? 4);
  function qtyBefore(all, s, date) {
    let q = 0;
    for (const t of all) {
      if (t.date >= date) break;
      if (t.s !== s) continue;
      if (t.type === "buy" || t.type === "bonus") q += t.qty;
      else if (t.type === "sell") q -= t.qty;
    }
    return Math.max(0, q);
  }

  /* daily value series + same cash flows invested in KSE-100 */
  async function timeline(res) {
    const idx = (await data.history("KSE100")).d;
    const buys = res.all.filter((t) => t.type === "buy" || t.type === "sell" || t.type === "bonus");
    if (!buys.length) return null;
    const start = buys[0].date;
    const dates = idx.filter((r) => r[0] >= start).map((r) => r[0]);
    const idxMap = Object.fromEntries(idx.map((r) => [r[0], r[4]]));
    const priceAt = {};
    const lastPx = {};
    for (const s of res.syms) priceAt[s] = Object.fromEntries((res.H[s].d || []).map((r) => [r[0], r[4]]));
    const qty = {};
    let ti = 0, units = 0, invested = 0, divCum = 0, lastIdx = idx.find((r) => r[0] >= start)?.[4];
    const out = [];
    const events = res.all;
    for (const d of dates) {
      lastIdx = idxMap[d] || lastIdx;
      while (ti < events.length && events[ti].date <= d) {
        const t = events[ti++];
        if (t.type === "buy") { qty[t.s] = (qty[t.s] || 0) + t.qty; const c = t.qty * t.price + (t.fee || 0); invested += c; units += c / lastIdx; }
        else if (t.type === "sell") { qty[t.s] = (qty[t.s] || 0) - t.qty; const pr = t.qty * t.price - (t.fee || 0); invested -= pr; units -= pr / lastIdx; }
        else if (t.type === "bonus") qty[t.s] = (qty[t.s] || 0) + t.qty;
        else if (t.net) divCum += t.net;
      }
      let v = 0;
      for (const s in qty) { if (priceAt[s]?.[d]) lastPx[s] = priceAt[s][d]; v += qty[s] * (lastPx[s] || 0); }
      out.push([d, v, invested, units * lastIdx, v + divCum]);
    }
    return out;
  }

  /* ---------------- page */
  Pages.portfolio = async function (app) {
    const taxes = await data.config("taxes");
    let all = loadAll();
    const root = h("div", {});
    app.append(root);
    const render = async () => {
      all = loadAll();
      const pf = active(all);
      root.innerHTML = "";
      root.append(header(all, pf, render));
      if (needsBackup(all, pf)) root.append(h("div", { class: "notice", style: { marginBottom: "14px" } }, h("span", { html: Icon("alert", 16) }),
        "Your portfolio is stored only in this browser. ", h("a", { href: "#", onclick: (e) => { e.preventDefault(); backup(all); render(); } }, "Download a backup"),
        " so you don't lose it if browser data is cleared."));
      if (!pf.tx.length) { root.append(emptyState(all, pf, render)); return; }
      const ld = UI.loading(2);
      root.append(ld);
      const res = await compute(pf, taxes);
      ld.remove();
      root.append(summary(res, pf));
      root.append(holdingsCard(res, pf, render));
      const tl = h("div", { class: "card", style: { marginTop: "16px" } }, h("div", { class: "card-h" }, h("h2", {}, "Value over time"),
        h("span", { class: "muted small" }, "Your holdings vs. the same money put into the KSE-100 on the same days")));
      const tlChart = h("div", {});
      tl.append(tlChart);
      root.append(tl);
      timeline(res).then((series) => {
        if (!series || series.length < 2) { tlChart.append(h("p", { class: "muted" }, "Add older transactions to see the history chart.")); return; }
        const th = window.thinSeries;
        Charts.line(tlChart, { height: 290, yFmt: (v) => fmt.compact(v, 1), series: [
          { name: "Portfolio + dividends", data: th(series.map((r) => [r[0], r[4]])), color: "#c9a227", area: true },
          { name: "Same money in KSE-100", data: th(series.map((r) => [r[0], r[3]])), color: "#3b82f6" },
          { name: "Net money invested", data: th(series.map((r) => [r[0], r[2]])), color: "#64748b", dash: true }] });
      });
      root.append(allocCards(res));
      root.append(dividendCard(res, pf));
      root.append(txCard(pf, all, render));
    };
    window.__pfRender = render;
    await render();
  };

  function needsBackup(all, pf) {
    if (!pf.tx.length) return false;
    const last = store.get("lastBackup", null);
    return (all.changedSinceBackup || 0) > 3 && (!last || (Date.now() - Date.parse(last)) / 86400e3 > 7);
  }

  function header(all, pf, render) {
    const sel = h("select", { class: "inp", style: { width: "auto", fontWeight: 650 } },
      all.list.map((p) => h("option", { value: p.id, selected: p.id === pf.id }, p.name)), h("option", { value: "__new" }, "New portfolio…"));
    sel.addEventListener("change", () => {
      if (sel.value === "__new") {
        const name = prompt("Name for the new portfolio:", "Portfolio " + (all.list.length + 1));
        if (!name) { sel.value = pf.id; return; }
        const p = { id: uid(), name: name.trim(), created: todayISO(), settings: { filer: true, autoDiv: true }, tx: [] };
        all.list.push(p); all.active = p.id;
      } else all.active = sel.value;
      saveAll(all); render();
    });
    const menu = h("details", { class: "pf-menu" }, h("summary", { class: "btn sm", html: Icon("more", 15) + "<span>More</span>" }),
      h("div", { class: "pf-menu-list" },
        mItem("edit", "Rename", () => { const n = prompt("Rename portfolio:", pf.name); if (n) { pf.name = n.trim(); saveAll(all); render(); } }),
        mItem("download", "Export transactions (CSV)", () => exportCSV(pf)),
        mItem("upload", "Import transactions (CSV)", () => importCSV(pf, all, render)),
        mItem("save", "Download full backup", () => { backup(all); render(); }),
        mItem("restore", "Restore from backup", () => restore(render)),
        mItem("settings", "Settings", () => settingsModal(pf, all, render)),
        mItem("trash", "Delete this portfolio", () => {
          if (!confirm(`Delete “${pf.name}” and all its transactions? This can't be undone.`)) return;
          all.list = all.list.filter((p) => p.id !== pf.id);
          if (!all.list.length) store.del(KEY); else { all.active = all.list[0].id; saveAll(all); }
          render();
        }, "danger")));
    return h("div", { class: "page-head" },
      h("div", {}, h("div", { class: "crumb" }, h("a", { href: "#/" }, "Overview"), h("span", {}, "/"), h("span", {}, "Portfolio · private to this browser")), h("h1", {}, "Portfolio"),
        h("p", {}, "Holdings, returns and dividend income. Nothing is uploaded.")),
      h("div", { class: "row" }, sel, UI.ibtn("plus", "Add transaction", { class: "btn primary", onclick: () => txModal(pf, all, render) }), menu));
  }
  const mItem = (icon, label, fn, cls = "") => h("button", { class: "pf-mi " + cls, html: Icon(icon, 15) + `<span>${label}</span>`, onclick: (e) => { e.target.closest("details").open = false; fn(); } });

  function emptyState(all, pf, render) {
    return h("div", { class: "card empty-state" },
      h("div", { html: Icon("wallet", 34) }), h("h2", {}, "Start tracking your investments"),
      h("p", { style: { maxWidth: "520px", margin: "0 auto 16px" } }, "Add the shares you've bought. Aurestonk adds dividends automatically, shows your profit after tax, and compares you with the KSE-100."),
      h("div", { class: "row", style: { justifyContent: "center" } },
        UI.ibtn("plus", "Add a purchase", { class: "btn primary", onclick: () => txModal(pf, all, render) }),
        UI.ibtn("upload", "Import CSV", { class: "btn", onclick: () => importCSV(pf, all, render) }),
        h("button", { class: "btn ghost", onclick: () => demo(pf, all, render) }, "Try an example portfolio")),
      h("p", { class: "help", style: { marginTop: "14px" } }, "Have a backup file? Use More, then Restore from backup."));
  }

  async function demo(pf, all, render) {
    const { stocks } = await data.stocks();
    const picks = stocks.filter((s) => s.divYield > 0).sort((a, b) => (b.mcap || 0) - (a.mcap || 0)).slice(0, 4);
    const taxes = await data.config("taxes");
    for (const [i, s] of picks.entries()) {
      const hist = await data.history(s.s);
      for (const back of [3, 2, 1]) {
        const target = new Date(Date.now() - (back * 365 - i * 20) * 86400e3).toISOString().slice(0, 10);
        const r = hist.d.find((x) => x[0] >= target);
        if (!r) continue;
        const qty = Math.max(1, Math.round(50000 / r[4]));
        pf.tx.push({ id: uid(), date: r[0], type: "buy", s: s.s, qty, price: r[4], fee: +(qty * r[4] * taxes.brokerage.commissionPct / 100).toFixed(2), note: "Example" });
      }
    }
    pf.name = pf.tx.length ? "Example portfolio" : pf.name;
    saveAll(all);
    render();
  }

  function summary(res, pf) {
    const totalPct = res.cost ? (res.totalReturn / (res.cost + Math.max(0, -res.realized))) * 100 : 0;
    return h("div", {},
      h("div", { class: "grid g4" },
        UI.stat("Current value", fmt.rs(res.value), h("span", { class: fmt.cls(res.dayChg) }, `${res.dayChg >= 0 ? "+" : ""}${fmt.rs(res.dayChg)} today`), "hero-stat"),
        UI.stat("Unrealised profit", h("span", { class: fmt.cls(res.unrealized) }, fmt.rs(res.unrealized)), `${fmt.pct(res.cost ? res.unrealized / res.cost * 100 : 0, 1)} on ${fmt.rsc(res.cost)} cost`),
        UI.stat("Dividends received", fmt.rs(res.divTotal), `after ${pf.settings.filer ? "filer" : "non-filer"} tax${pf.settings.autoDiv ? " · added automatically" : ""}`),
        UI.stat("Yearly return (XIRR)", h("span", { class: fmt.cls(res.xirr) }, fmt.pct(res.xirr, 1)), `Realised: ${fmt.rs(res.realized)} · fees: ${fmt.rs(res.feesTotal)}`)),
      h("div", { class: "row", style: { marginTop: "10px" } },
        h("span", { class: "muted small" }, `Total return (unrealised + realised + dividends): `, h("b", { class: fmt.cls(res.totalReturn) }, fmt.rs(res.totalReturn)), ` · prices as of ${fmt.date(res.asOf)}`),
        h("span", { class: "spacer" }),
        h("a", { class: "btn sm", href: `#/planner?initial=${Math.round(res.value)}&divYield=${res.value ? (res.holdings.reduce((a, x) => a + x.value * x.yld, 0) / res.value).toFixed(1) : 0}&from=portfolio` }, "Project this portfolio")));
  }

  function holdingsCard(res, pf, render) {
    return h("div", { class: "card", style: { marginTop: "16px" } }, h("div", { class: "card-h" }, h("h2", {}, "Holdings"), h("span", { class: "muted small" }, `${res.holdings.length} stocks`)),
      UI.table([
        { key: "s", label: "Stock", render: UI.symCell },
        { key: "qty", label: "Shares", num: true, render: (x) => fmt.num(x.qty, 0) },
        { key: "avg", label: "Avg cost", num: true, render: (x) => fmt.px(x.avg) },
        { key: "price", label: "Price", num: true, render: (x) => h("span", {}, fmt.px(x.price), h("div", { class: "small " + fmt.cls(x.chgPct) }, fmt.pct(x.chgPct))) },
        { key: "value", label: "Value", num: true, render: (x) => fmt.rs(x.value) },
        { key: "pl", label: "Profit / loss", num: true, render: (x) => h("span", { class: fmt.cls(x.pl) }, fmt.rs(x.pl), h("div", { class: "small" }, fmt.pct(x.plPct, 1))) },
        { key: "divs", label: "Dividends", num: true, render: (x) => (x.divs ? fmt.rs(x.divs) : "—") },
        { key: "weight", label: "Weight", num: true, render: (x) => x.weight.toFixed(1) + "%" },
        { key: "act", label: "", sortable: false, render: (x) => h("div", { class: "row", style: { justifyContent: "flex-end", flexWrap: "nowrap" } },
          h("button", { class: "btn sm", onclick: () => txModal(pf, loadAll(), render, { s: x.s, type: "buy" }) }, "Buy"),
          h("button", { class: "btn sm", onclick: () => txModal(pf, loadAll(), render, { s: x.s, type: "sell", qty: x.qty }) }, "Sell")) },
      ], res.holdings, { sort: "value", compact: true, empty: "No open positions." }).el);
  }

  function allocCards(res) {
    const byStock = h("div", {}), bySec = h("div", {});
    const items = res.holdings.slice().sort((a, b) => b.value - a.value);
    const top = items.slice(0, 9).map((x) => ({ label: x.s, value: x.value }));
    const rest = items.slice(9).reduce((a, b) => a + b.value, 0);
    if (rest) top.push({ label: "Others", value: rest, color: "#94a3b8" });
    const sec = {};
    for (const x of items) sec[x.sec] = (sec[x.sec] || 0) + x.value;
    setTimeout(() => {
      Charts.donut(byStock, { items: top, fmt: (v) => fmt.rsc(v), center: `<div><b>${items.length}</b>stocks</div>`, size: 190 });
      Charts.donut(bySec, { items: Object.entries(sec).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })), fmt: (v) => fmt.rsc(v),
        center: `<div><b>${Object.keys(sec).length}</b>sectors</div>`, size: 190 });
    });
    const biggest = items[0];
    return h("div", { class: "grid g2", style: { marginTop: "16px" } },
      h("div", { class: "card" }, h("h2", {}, "By stock"), byStock,
        biggest && biggest.weight > 35 ? h("div", { style: { marginTop: "12px" } }, UI.notice(`${biggest.s} is ${biggest.weight.toFixed(0)}% of this portfolio — a concentrated position.`, "alert", false)) : null),
      h("div", { class: "card" }, h("h2", {}, "By sector"), bySec));
  }

  function dividendCard(res, pf) {
    const months = [];
    const now = new Date(todayISO());
    for (let i = 23; i >= 0; i--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); months.push(d.toISOString().slice(0, 7)); }
    const chartEl = h("div", {});
    const upEl = h("div", {});
    const last12 = months.slice(-12).reduce((a, m) => a + (res.divByMonth[m] || 0), 0);
    setTimeout(() => Charts.bars(chartEl, { labels: months.map((m) => A.fmt.MONTHS[+m.slice(5) - 1] + (m.endsWith("-01") ? " " + m.slice(2, 4) : "")),
      tipLabels: months, series: [{ name: "Dividends (after tax)", values: months.map((m) => Math.round(res.divByMonth[m] || 0)), color: "#c9a227" }], yFmt: (v) => fmt.compact(v, 0), height: 220 }));
    data.payouts().then((p) => {
      const mine = (p.upcoming || []).filter((x) => res.holdings.some((hh) => hh.s === x.s) && x.bookClosureFrom >= todayISO());
      if (!mine.length) { upEl.append(h("p", { class: "muted small" }, "No upcoming payouts announced for your stocks.")); return; }
      upEl.append(h("table", { class: "mini-table" }, h("tbody", {}, mine.map((x) => {
        const hold = res.holdings.find((hh) => hh.s === x.s);
        const est = x.amount ? hold.qty * x.amount * (1 - (pf.settings.filer ? 0.15 : 0.3)) : null;
        return h("tr", {}, h("td", {}, h("b", {}, x.s), h("div", { class: "small muted" }, "Book closure " + fmt.date(x.bookClosureFrom))),
          h("td", { class: "n" }, est ? "≈ " + fmt.rs(est) : x.pct + "%"));
      }))));
    });
    return h("div", { class: "grid split", style: { marginTop: "16px" } },
      h("div", { class: "card" }, h("div", { class: "card-h" }, h("h2", {}, "Dividend income"), h("span", { class: "muted small" }, `Last 12 months: `, h("b", {}, fmt.rs(last12)), ` · ≈ ${fmt.rs(last12 / 12)}/month`)), chartEl),
      h("div", { class: "card" }, h("h2", {}, "Coming up for you"), upEl));
  }

  function txCard(pf, all, render) {
    const rows = pf.tx.slice().sort((a, b) => b.date.localeCompare(a.date));
    return h("div", { class: "card", style: { marginTop: "16px" } }, h("div", { class: "card-h" }, h("h2", {}, "Transactions"),
      h("span", { class: "muted small" }, "Automatic dividends aren't listed here — they're calculated from each company's payouts.")),
      UI.table([
        { key: "date", label: "Date", render: (t) => fmt.date(t.date) },
        { key: "type", label: "Type", render: (t) => h("span", { class: "badge " + (t.type === "buy" ? "green" : t.type === "div" ? "gold" : "") }, { buy: "Buy", sell: "Sell", div: "Dividend", bonus: "Bonus shares" }[t.type]) },
        { key: "s", label: "Stock", render: (t) => h("a", { class: "sym", href: "#/stock/" + t.s }, t.s) },
        { key: "qty", label: "Shares", num: true, render: (t) => (t.qty ? fmt.num(t.qty, 0) : "—") },
        { key: "price", label: "Price", num: true, render: (t) => (t.price ? fmt.px(t.price) : "—") },
        { key: "amt", label: "Amount", num: true, sortVal: (t) => t.amount || t.qty * t.price, render: (t) => fmt.rs(t.type === "div" ? t.amount : t.qty * t.price + (t.type === "buy" ? 1 : -1) * (t.fee || 0)) },
        { key: "note", label: "Note", render: (t) => h("span", { class: "muted small" }, t.note || "") },
        { key: "act", label: "", sortable: false, render: (t) => h("div", { class: "row", style: { flexWrap: "nowrap", justifyContent: "flex-end" } },
          h("button", { class: "btn sm", onclick: () => txModal(pf, all, render, t) }, "Edit"),
          h("button", { class: "btn sm danger", title: "Delete", html: Icon("x", 14), onclick: () => { if (confirm("Delete this transaction?")) { pf.tx = pf.tx.filter((x) => x.id !== t.id); saveAll(all); render(); } } })) },
      ], rows, { compact: true, sort: "date" }).el);
  }

  /* ---------------- add / edit transaction */
  async function txModal(pf, all, render, existing = {}) {
    const taxes = await data.config("taxes");
    const editing = !!existing.id;
    const type = UI.selField("Type", [["buy", "Buy"], ["sell", "Sell"], ["div", "Dividend received (manual)"], ["bonus", "Bonus shares received"]], existing.type || "buy");
    let sym = existing.s || "";
    const picker = UI.stockPicker("Stock", sym, (s) => { sym = s; autoPrice(); });
    const date = UI.textField("Date", existing.date || todayISO(), { type: "date" });
    const qty = UI.numField("Number of shares", existing.qty ?? "", { min: 0, step: 1 });
    const price = UI.numField("Price per share", existing.price ?? "", { pre: "Rs", min: 0, help: "Filled with that day's closing price — change it to your actual price." });
    const fee = UI.numField("Broker fee & charges", existing.fee ?? "", { pre: "Rs", min: 0, help: `Estimated at ${taxes.brokerage.commissionPct}% — edit if your broker charged differently.` });
    const amount = UI.numField("Amount received (after tax)", existing.amount ?? "", { pre: "Rs", min: 0 });
    const note = UI.textField("Note (optional)", existing.note || "");
    const total = h("div", { class: "notice info", style: { marginTop: "4px", display: "block" } });
    const err = h("div", { class: "error-box hidden", style: { marginTop: "10px" } });
    let feeTouched = editing;
    fee.input.addEventListener("input", () => (feeTouched = true));
    async function autoPrice() {
      if (!sym) return;
      try {
        const hst = await data.history(sym);
        const d = date.get();
        const r = hst.d.filter((x) => x[0] <= d).pop() || hst.d[0];
        if (r && (!price.input.value || !editing)) price.set(r[4]);
      } catch { /* ignore */ }
      upd();
    }
    function upd() {
      const t = type.get();
      [qty, price, fee].forEach((f) => f.el.classList.toggle("hidden", t === "div" || (t === "bonus" && f !== qty)));
      amount.el.classList.toggle("hidden", t !== "div");
      if (!feeTouched && (t === "buy" || t === "sell")) fee.set(+(qty.get() * price.get() * taxes.brokerage.commissionPct / 100).toFixed(2));
      const gross = qty.get() * price.get();
      total.textContent = t === "buy" ? `Total cost: ${fmt.rs(gross + fee.get(), 2)}` : t === "sell" ? `You receive: ${fmt.rs(gross - fee.get(), 2)} (before capital gains tax)` : t === "bonus" ? "Bonus shares are added at zero cost, lowering your average cost." : "Use this only if a dividend wasn't added automatically.";
    }
    [qty, price].forEach((f) => f.input.addEventListener("input", upd));
    type.input.addEventListener("change", upd);
    date.input.addEventListener("change", autoPrice);
    const save = () => {
      const t = type.get();
      sym = (picker.get() || sym).toUpperCase();
      const tx = { id: existing.id || uid(), date: date.get(), type: t, s: sym, note: note.get().trim() };
      if (!sym) return showErr("Choose a stock.");
      if (!tx.date) return showErr("Choose a date.");
      if (t === "div") { tx.amount = amount.get(); if (!(tx.amount > 0)) return showErr("Enter the amount you received."); }
      else {
        tx.qty = qty.get();
        if (!(tx.qty > 0)) return showErr("Enter the number of shares.");
        if (t !== "bonus") { tx.price = price.get(); tx.fee = fee.get(); if (!(tx.price > 0)) return showErr("Enter the price per share."); }
      }
      if (t === "sell") {
        const held = pf.tx.filter((x) => x.s === sym && x.id !== tx.id && x.date <= tx.date).reduce((a, x) => a + (x.type === "sell" ? -x.qty : x.type === "buy" || x.type === "bonus" ? x.qty : 0), 0);
        if (tx.qty > held + 1e-9) return showErr(`You only held ${fmt.num(held, 0)} ${sym} shares on that date.`);
      }
      const all2 = loadAll();
      const p2 = active(all2);
      p2.tx = p2.tx.filter((x) => x.id !== tx.id);
      p2.tx.push(tx);
      saveAll(all2);
      m.close();
      A.toast(editing ? "Transaction updated" : "Transaction added");
      render();
    };
    const showErr = (msg) => { err.textContent = msg; err.classList.remove("hidden"); };
    const m = UI.modal(editing ? "Edit transaction" : "Add transaction",
      h("div", {}, type.el, picker.el, h("div", { class: "grid g2", style: { gap: "0 12px" } }, date.el, qty.el, price.el, fee.el), amount.el, note.el, total, err),
      [h("button", { class: "btn", onclick: () => m.close() }, "Cancel"), h("button", { class: "btn primary", onclick: save }, editing ? "Save changes" : "Add")]);
    m.el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT" && !e.target.closest(".picker")) save(); });
    upd();
    if (existing.s && !editing) autoPrice();
  }

  // used from stock pages
  window.addToPortfolio = (s, price) => {
    const all = loadAll();
    const pf = active(all);
    txModal(pf, all, () => { if (location.hash.startsWith("#/portfolio")) window.__pfRender?.(); else A.toast(`Added to “${pf.name}” — open Portfolio to see it`); }, { s, type: "buy", price });
  };

  function settingsModal(pf, all, render) {
    const filer = UI.checkField("I'm on the Active Taxpayers List (filer)", pf.settings.filer, { help: "Filers pay lower tax on dividends and capital gains." });
    const auto = UI.checkField("Add dividends automatically", pf.settings.autoDiv, { help: "Uses each company's announced payouts and the shares you held before book closure." });
    const m = UI.modal("Portfolio settings", h("div", {}, filer.el, auto.el), [
      h("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
      h("button", { class: "btn primary", onclick: () => { pf.settings.filer = filer.get(); pf.settings.autoDiv = auto.get(); saveAll(all); m.close(); render(); } }, "Save")]);
  }

  /* ---------------- import / export / backup */
  function exportCSV(pf) {
    const rows = [["date", "type", "symbol", "quantity", "price", "fee", "amount", "note"],
      ...pf.tx.slice().sort((a, b) => a.date.localeCompare(b.date)).map((t) => [t.date, t.type, t.s, t.qty ?? "", t.price ?? "", t.fee ?? "", t.amount ?? "", t.note || ""])];
    A.download(`${pf.name.replace(/\W+/g, "-")}-transactions.csv`, A.csv(rows), "text/csv");
  }
  function importCSV(pf, all, render) {
    const inp = h("input", { type: "file", accept: ".csv,text/csv" });
    inp.addEventListener("change", async () => {
      const f = inp.files[0];
      if (!f) return;
      const rows = A.parseCSV(await f.text());
      const head = rows.shift().map((x) => x.trim().toLowerCase());
      const col = (r, ...names) => { const i = head.findIndex((h0) => names.includes(h0)); return i >= 0 ? (r[i] || "").trim() : ""; };
      let added = 0, skipped = 0;
      for (const r of rows) {
        const type = (col(r, "type", "side", "action") || "buy").toLowerCase().replace("purchase", "buy").replace("sale", "sell").replace("dividend", "div");
        const t = { id: uid(), date: normDate(col(r, "date", "trade date")), type: ["buy", "sell", "div", "bonus"].includes(type) ? type : "buy",
          s: col(r, "symbol", "stock", "ticker", "scrip").toUpperCase(), qty: +col(r, "quantity", "qty", "shares") || undefined,
          price: +col(r, "price", "rate") || undefined, fee: +col(r, "fee", "fees", "commission") || 0, amount: +col(r, "amount") || undefined, note: col(r, "note", "notes") };
        if (!t.date || !t.s || (t.type !== "div" && !t.qty)) { skipped++; continue; }
        pf.tx.push(t); added++;
      }
      saveAll(all);
      A.toast(`Imported ${added} transaction(s)${skipped ? `, skipped ${skipped}` : ""}`);
      render();
    });
    UI.modal("Import transactions", h("div", {},
      h("p", {}, "Choose a CSV file with these columns (header row required):"),
      h("pre", { class: "notice info", style: { whiteSpace: "pre-wrap", fontFamily: "var(--mono)", fontSize: "12.5px", display: "block" } }, "date,type,symbol,quantity,price,fee,note\n2024-03-15,buy,LUCK,50,780.5,58.5,\n2025-01-10,sell,LUCK,20,1020,30.6,"),
      h("p", { class: "help" }, "Type is buy, sell, div or bonus. Dates as YYYY-MM-DD or DD/MM/YYYY. Tip: export first to see the exact format."), inp), []);
  }
  function normDate(s) {
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const d = Date.parse(s);
    return isNaN(d) ? "" : new Date(d).toISOString().slice(0, 10);
  }
  function backup(all) {
    A.download(`aurestonk-backup-${todayISO()}.json`, JSON.stringify({ app: "aurestonk", version: 1, saved: new Date().toISOString(), data: all }, null, 1), "application/json");
    all.changedSinceBackup = 0;
    store.set(KEY, all);
    store.set("lastBackup", new Date().toISOString());
    A.toast("Backup downloaded");
  }
  function restore(render) {
    const inp = h("input", { type: "file", accept: ".json,application/json" });
    inp.addEventListener("change", async () => {
      try {
        const js = JSON.parse(await inp.files[0].text());
        if (js.app !== "aurestonk" || !js.data?.list) throw new Error();
        if (!confirm("Replace everything in this browser with the backup?")) return;
        js.data.changedSinceBackup = 0;
        store.set(KEY, js.data);
        A.toast("Backup restored");
        render();
      } catch { alert("That file isn't an Aurestonk backup."); }
    });
    inp.click();
  }
})();
