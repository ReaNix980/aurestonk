/* Aurestonk shared UI pieces: form fields, tables, stock picker, price chart, quick lists, modal. */
"use strict";
(function () {
  const { h, $, $$, fmt, data, store } = A;

  /* ---------------- form fields (return {el, get, set}) */
  function numField(label, val, o = {}) {
    // Money fields (pre: "Rs") show and accept the chosen display currency, but get()/set() always use PKR.
    const money = o.pre === "Rs";
    const k = money ? fmt.conv(1) : 1;             // display units per 1 PKR
    const toShow = (v) => (v === "" || v === null || v === undefined ? "" : money && k !== 1 ? +(Number(v) * k).toFixed(Number(v) * k < 10 ? 4 : 2) : v);
    const input = h("input", { type: "number", value: toShow(val), step: o.step || "any", min: o.min, max: o.max, inputmode: "decimal", id: o.id });
    const pre = money ? fmt.sym() : o.pre;
    const wrap = h("div", { class: "with-unit" + (pre ? " has-pre" : "") + (pre && pre.length > 2 ? " wide-pre" : "") }, pre ? h("span", { class: "pre" }, pre) : null, input, o.unit ? h("span", { class: "unit" }, o.unit) : null);
    const el = h("div", { class: "field" }, label ? h("label", {}, label) : null, wrap, o.help ? h("div", { class: "help" }, o.help) : null);
    if (o.onInput) input.addEventListener("input", o.onInput);
    return { el, input, money,
      get: () => (input.value === "" ? (o.def ?? 0) : Number(input.value) / k),
      set: (v) => (input.value = toShow(v)) };
  }
  function selField(label, choices, val, o = {}) {
    const sel = h("select", {}, choices.map(([v, l]) => h("option", { value: v, selected: String(v) === String(val) }, l)));
    const el = h("div", { class: "field" }, label ? h("label", {}, label) : null, sel, o.help ? h("div", { class: "help" }, o.help) : null);
    if (o.onInput) sel.addEventListener("change", o.onInput);
    return { el, input: sel, get: () => sel.value, set: (v) => (sel.value = v) };
  }
  function checkField(label, val, o = {}) {
    const cb = h("input", { type: "checkbox", checked: !!val });
    const el = h("label", { class: "check" }, cb, h("span", {}, label, o.help ? h("span", { class: "help", style: { display: "block", margin: 0 } }, o.help) : null));
    if (o.onInput) cb.addEventListener("change", o.onInput);
    return { el, input: cb, get: () => cb.checked, set: (v) => (cb.checked = !!v) };
  }
  function textField(label, val, o = {}) {
    const input = h("input", { type: o.type || "text", value: val ?? "", placeholder: o.placeholder || "" });
    const el = h("div", { class: "field" }, label ? h("label", {}, label) : null, input, o.help ? h("div", { class: "help" }, o.help) : null);
    if (o.onInput) input.addEventListener("input", o.onInput);
    return { el, input, get: () => input.value, set: (v) => (input.value = v) };
  }

  /* ---------------- tabs */
  function tabs(items, current, onPick) {
    const el = h("div", { class: "tabs", role: "tablist" });
    for (const [v, l] of items) {
      const b = h("button", { class: v === current ? "on" : "", role: "tab", "data-v": v }, l);
      b.addEventListener("click", () => { $$("button", el).forEach((x) => x.classList.toggle("on", x === b)); onPick(v); });
      el.append(b);
    }
    return el;
  }

  /* ---------------- sortable table */
  function table(cols, rows, o = {}) {
    let sortKey = o.sort || null, asc = o.asc ?? false;
    const wrap = h("div", { class: "tbl-wrap" });
    const tbl = h("table", { class: "tbl" + (o.compact ? " compact" : "") });
    wrap.append(tbl);
    const render = () => {
      let list = rows.slice();
      if (sortKey) {
        const c = cols.find((x) => x.key === sortKey) || {};
        const val = c.sortVal || ((r) => r[sortKey]);
        list.sort((a, b) => {
          const va = val(a), vb = val(b);
          if (va === vb) return 0;
          if (va === null || va === undefined || (typeof va === "number" && !isFinite(va))) return 1;
          if (vb === null || vb === undefined || (typeof vb === "number" && !isFinite(vb))) return -1;
          return (va < vb ? -1 : 1) * (asc ? 1 : -1);
        });
      }
      if (o.limit) list = list.slice(0, o.limit);
      tbl.innerHTML = "";
      const thead = h("thead", {}, h("tr", {}, cols.map((c) => {
        const th = h("th", { class: [c.num ? "n" : "", c.sortable !== false ? "sortable" : "", sortKey === c.key ? "sorted" + (asc ? " asc" : "") : ""].join(" "), title: c.title || "" }, c.label);
        if (c.sortable !== false) th.addEventListener("click", () => { if (sortKey === c.key) asc = !asc; else { sortKey = c.key; asc = !!c.ascFirst; } render(); });
        return th;
      })));
      const tbody = h("tbody");
      if (!list.length) tbody.append(h("tr", {}, h("td", { colspan: cols.length, class: "muted", style: { textAlign: "center", padding: "26px" } }, o.empty || "Nothing to show.")));
      for (const r of list) {
        const tr = h("tr", { class: o.onRow ? "click" : "" }, cols.map((c) => {
          const v = c.render ? c.render(r) : r[c.key];
          return h("td", { class: (c.num ? "n " : "") + (c.cls ? c.cls(r) : "") }, v ?? "—");
        }));
        if (o.onRow) tr.addEventListener("click", (ev) => { if (!ev.target.closest("a,button,input")) o.onRow(r); });
        tbody.append(tr);
      }
      tbl.append(thead, tbody);
    };
    render();
    return { el: wrap, update(newRows) { rows = newRows; render(); } };
  }
  const symCell = (s) => h("div", {}, h("a", { class: "sym", href: `#/stock/${s.s}` }, s.s), h("span", { class: "sym-sub" }, s.n));
  const chgCell = (v) => h("span", { class: "pill " + fmt.cls(v) }, fmt.pct(v));

  /* ---------------- quick lists (the "find it fast" lists) */
  const QUICK = [
    { id: "top-dividend", label: "Top 20 dividend stocks", icon: "coins", desc: "Highest dividend yield over the last 12 months",
      pick: (l) => l.filter((s) => s.divYield > 0).sort((a, b) => b.divYield - a.divYield).slice(0, 20), sort: "divYield" },
    { id: "gainers", label: "Top gainers today", icon: "up", desc: "Biggest % rise in the latest session",
      pick: (l) => l.slice().sort((a, b) => b.chgPct - a.chgPct).slice(0, 20), sort: "chgPct" },
    { id: "losers", label: "Top losers today", icon: "down", desc: "Biggest % fall in the latest session",
      pick: (l) => l.slice().sort((a, b) => a.chgPct - b.chgPct).slice(0, 20), sort: "chgPct", asc: true },
    { id: "active", label: "Most active", icon: "activity", desc: "Highest traded volume in the latest session",
      pick: (l) => l.slice().sort((a, b) => b.vol - a.vol).slice(0, 20), sort: "vol" },
    { id: "best-1y", label: "Best performers (1 year)", icon: "award", desc: "Largest price gain over 12 months",
      pick: (l) => l.filter((s) => s.r1y !== null).sort((a, b) => b.r1y - a.r1y).slice(0, 20), sort: "r1y" },
    { id: "cheap-pe", label: "Lowest P/E", icon: "tag", desc: "Cheapest compared to earnings (profitable companies only)",
      pick: (l) => l.filter((s) => s.pe > 0).sort((a, b) => a.pe - b.pe).slice(0, 20), sort: "pe", asc: true },
    { id: "shariah", label: "Shariah-compliant (KMI-30)", icon: "shield", desc: "Members of the KMI-30 index",
      pick: (l) => l.filter((s) => s.kmi30), sort: "mcap" },
    { id: "near-high", label: "Near 52-week high", icon: "ceiling", desc: "Within 5% of their 1-year high",
      pick: (l) => l.filter((s) => s.high52 && s.price >= s.high52 * 0.95).sort((a, b) => b.price / b.high52 - a.price / a.high52), sort: "r1y" },
    { id: "near-low", label: "Near 52-week low", icon: "floor", desc: "Within 10% of their 1-year low",
      pick: (l) => l.filter((s) => s.low52 && s.price <= s.low52 * 1.1).sort((a, b) => a.price / a.low52 - b.price / b.low52), sort: "r1y", asc: true },
    { id: "largest", label: "Largest companies", icon: "building", desc: "By market capitalisation",
      pick: (l) => l.filter((s) => s.mcap).sort((a, b) => b.mcap - a.mcap).slice(0, 20), sort: "mcap" },
  ];

  /* ---------------- stock picker with type-ahead */
  function stockPicker(label, current, onPick, o = {}) {
    const input = h("input", { type: "text", placeholder: o.placeholder || "Type a symbol or company…", value: current || "", autocomplete: "off" });
    const list = h("div", { class: "picker-list hidden" });
    const el = h("div", { class: "field picker" }, label ? h("label", {}, label) : null, h("div", { style: { position: "relative" } }, input, list));
    let stocks = [];
    data.stocks().then((d) => { stocks = d.stocks; if (o.includeIndex) stocks = [{ s: "KSE100", n: "KSE-100 Index" }, ...stocks]; });
    let idx = 0, shown = [];
    const draw = () => {
      const q = input.value.trim().toUpperCase();
      shown = stocks.filter((s) => !q || s.s.includes(q) || s.n.toUpperCase().includes(q)).slice(0, 8);
      idx = 0;
      list.innerHTML = "";
      shown.forEach((s, i) => {
        const it = h("div", { class: "picker-it" + (i === idx ? " on" : "") }, h("b", {}, s.s), h("span", {}, " " + s.n));
        it.addEventListener("mousedown", (e) => { e.preventDefault(); choose(s); });
        list.append(it);
      });
      list.classList.toggle("hidden", !shown.length);
    };
    const choose = (s) => { input.value = s.s; list.classList.add("hidden"); onPick(s.s, s); };
    input.addEventListener("focus", () => { input.select(); draw(); });
    input.addEventListener("input", draw);
    input.addEventListener("blur", () => setTimeout(() => list.classList.add("hidden"), 120));
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        idx = (idx + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % Math.max(1, shown.length);
        $$(".picker-it", list).forEach((x, i) => x.classList.toggle("on", i === idx));
      } else if (e.key === "Enter" && shown[idx]) { e.preventDefault(); choose(shown[idx]); }
    });
    return { el, input, get: () => input.value.trim().toUpperCase(), set: (v) => (input.value = v) };
  }

  /* ---------------- price chart with ranges (hourly for short ranges) */
  const RANGES = [["1D", "1D"], ["1W", "1W"], ["1M", "1M"], ["3M", "3M"], ["6M", "6M"], ["YTD", "YTD"], ["1Y", "1Y"], ["5Y", "5Y"], ["ALL", "All"]];
  function priceChart(el, sym, o = {}) {
    let range = store.get("range", "6M"), mode = store.get("chartMode", "candle");
    const tools = h("div", { class: "chart-tools" });
    const box = h("div", {});
    const note = h("div", { class: "help", style: { marginTop: "6px" } });
    el.append(tools, box, note);
    let daily = null, hourly = null, meta = null;
    Promise.all([data.history(sym), data.hourly(sym), data.meta()]).then(([d, hr, m]) => { daily = d.d; hourly = hr.d || []; meta = m; draw(); })
      .catch(() => { box.innerHTML = '<div class="ch-empty">Price history isn\'t available for this symbol yet.</div>'; });
    tools.append(
      tabs(RANGES, range, (v) => { range = v; store.set("range", v); draw(); }),
      tabs([["candle", "Candles"], ["line", "Line"]], mode, (v) => { mode = v; store.set("chartMode", v); draw(); }),
    );
    function draw() {
      if (!daily) return;
      const last = daily[daily.length - 1][0];
      let rows, isHourly = false;
      note.textContent = "";
      if (range === "1D" || range === "1W") {
        const days = [...new Set(hourly.map((r) => r[0].slice(0, 10)))];
        const keep = days.slice(range === "1D" ? -1 : -5);
        rows = hourly.filter((r) => keep.includes(r[0].slice(0, 10)));
        isHourly = true;
        if (rows.length < 2) {
          rows = daily.slice(range === "1D" ? -5 : -10);
          isHourly = false;
          note.textContent = "Hourly detail starts building from the first daily update — showing daily candles for now.";
        } else note.textContent = `Hourly candles (Pakistan time). Hourly history available since ${fmt.date(meta.hourlySince || hourly[0][0])}.`;
      } else {
        const back = { "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "5Y": 1827 }[range];
        let from = range === "YTD" ? last.slice(0, 4) + "-01-01" : range === "ALL" ? "0000" : new Date(Date.parse(last) - back * 86400e3).toISOString().slice(0, 10);
        rows = daily.filter((r) => r[0] >= from);
        if (rows.length > 900) { // weekly candles for very long ranges
          const wk = [];
          for (const r of rows) {
            const d = new Date(r[0] + "T00:00:00Z");
            const key = new Date(d - ((d.getUTCDay() + 6) % 7) * 86400e3).toISOString().slice(0, 10);
            const w = wk[wk.length - 1];
            if (!w || w.k !== key) wk.push({ k: key, r: [r[0], r[1], r[2], r[3], r[4], r[5]] });
            else { w.r[2] = Math.max(w.r[2], r[2]); w.r[3] = Math.min(w.r[3], r[3]); w.r[4] = r[4]; w.r[5] += r[5]; }
          }
          rows = wk.map((w) => w.r);
          note.textContent = "Weekly candles for long ranges.";
        }
      }
      box.innerHTML = "";
      if (o.onRange && rows.length > 1) o.onRange(rows, range);
      const k = sym === "KSE100" ? 1 : fmt.conv(1);
      const shown = k === 1 ? rows : rows.map((r) => [r[0], r[1] * k, r[2] * k, r[3] * k, r[4] * k, r[5]]);
      Charts.candles(box, { rows: shown, mode, hourly: isHourly, height: o.height || 360,
        yFmt: (v) => (sym === "KSE100" ? fmt.num(v, 0) : fmt.num(v, Math.abs(v) < 1 ? 4 : Math.abs(v) < 100 ? 2 : 0)) });
    }
  }

  /* ---------------- modal */
  function modal(title, body, actions = []) {
    const bg = h("div", { class: "modal-bg" });
    const m = h("div", { class: "modal", role: "dialog", "aria-modal": "true" }, h("h3", {}, title), body,
      actions.length ? h("div", { class: "row", style: { justifyContent: "flex-end", marginTop: "16px" } }, actions) : null);
    bg.append(m);
    const close = () => { bg.remove(); document.removeEventListener("keydown", esc); };
    const esc = (e) => { if (e.key === "Escape") close(); };
    bg.addEventListener("mousedown", (e) => { if (e.target === bg) close(); });
    document.addEventListener("keydown", esc);
    document.body.append(bg);
    setTimeout(() => m.querySelector("input,select,button")?.focus(), 30);
    return { close, el: m };
  }

  /* ---------------- misc */
  const stat = (k, v, sub, extra = "") => h("div", { class: "stat " + extra }, h("div", { class: "k" }, k), h("div", { class: "v" }, v), sub ? h("div", { class: "s" }, sub) : null);
  const loading = (n = 3) => h("div", {}, Array.from({ length: n }, () => h("div", { class: "skeleton", style: { height: "110px", marginBottom: "14px" } })));
  const errorBox = (e) => h("div", { class: "error-box" }, "Couldn't load this section: ", e.message || String(e));
  function pageHead(title, sub, right, crumb) {
    const c = crumb ? h("div", { class: "crumb" }, ...[].concat(crumb).flatMap((x, i) => [i ? h("span", {}, "/") : null, typeof x === "string" ? h("span", {}, x) : h("a", { href: x[1] }, x[0])])) : null;
    return h("div", { class: "page-head" }, h("div", {}, c, h("h1", {}, title), sub ? h("p", {}, sub) : null), right || null);
  }
  const notice = (text, icon = "info", info = true) => h("div", { class: "notice" + (info ? " info" : "") }, h("span", { html: Icon(icon, 16) }), h("div", {}, text));
  const ibtn = (icon, label, attrs = {}) => h(attrs.href ? "a" : "button", Object.assign({ class: "btn" }, attrs, { html: Icon(icon, 15) + (label ? `<span>${A.esc(label)}</span>` : "") }));

  window.UI = { notice, ibtn, numField, selField, checkField, textField, tabs, table, symCell, chgCell, QUICK, stockPicker, priceChart, modal, stat, loading, errorBox, pageHead };
})();
