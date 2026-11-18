/* Projection: one calculation combining every factor, driven by a Conservative ↔ Optimistic dial.
   Each factor's range comes from real history (KSE-100 rolling returns, Pakistan inflation, PKR/USD). */
"use strict";
(function () {
  const { h, fmt, data, store, settings } = A;

  Pages.planner = async function (app, params, query) {
    const [taxes, idx, econ, stocksD] = await Promise.all([data.config("taxes"), data.history("KSE100"), data.economy().catch(() => ({})), data.stocks()]);
    const saved = store.get("projection", {});
    const q = (k, d) => (query[k] !== undefined && query[k] !== "" ? Number(query[k]) : saved[k] ?? d);

    /* ---------- factor ranges from history */
    const r5 = F.rollingCagr(idx.d, 5);
    const st = F.historyStats(idx.d) || {};
    const mkt = r5.length > 10 ? [F.percentile(r5, 0.2), F.percentile(r5, 0.5), F.percentile(r5, 0.8)] : [8, 14, 20];
    const capW = stocksD.stocks.filter((s) => s.mcap);
    const idxYield = capW.length ? capW.reduce((a, s) => a + s.mcap * (s.divYield || 0), 0) / capW.reduce((a, s) => a + s.mcap, 0) : 6;
    const yieldR = [idxYield * 0.7, idxYield, idxYield * 1.15];
    const inf = (econ.inflationAnnual || []).slice(-20).map((x) => x[1]);
    const infR = inf.length > 5 ? [F.percentile(inf, 0.75), F.percentile(inf, 0.5), F.percentile(inf, 0.25)] : [12, 9, 6];
    const fx = econ.usdpkrAnnual || [];
    const dep = fx.slice(-20).map((x, i, a) => (i ? (x[1] / a[i - 1][1] - 1) * 100 : null)).filter((x) => x !== null);
    const depR = dep.length > 5 ? [F.percentile(dep, 0.75), F.percentile(dep, 0.5), F.percentile(dep, 0.25)] : [9, 6, 3];
    const realRaiseR = [-2, 1, 3];
    const volR = [Math.max(st.vol || 25, 20) * 1.15, st.vol || 25, (st.vol || 25) * 0.9];

    const FACTORS = [
      { key: "ret", label: "Market price growth", unit: "%", note: "KSE-100 rolling 5-year returns (20th–80th percentile)", range: mkt },
      { key: "divYield", label: "Dividend yield", unit: "%", note: "Market-cap-weighted KSE-100 yield, last 12 months", range: yieldR },
      { key: "inflation", label: "Inflation", unit: "%", note: "Pakistan CPI, last 20 years (high → low)", range: infR },
      { key: "stepUp", label: "Salary / contribution growth", unit: "%", note: "Inflation plus a real raise of −2% to +3%", derived: (v, d) => v.inflation + F.lerp3(...realRaiseR, d) },
      { key: "dep", label: "Rupee depreciation vs USD", unit: "%", note: "PKR per USD yearly change, last 20 years", range: depR },
      { key: "vol", label: "Market volatility", unit: "%", note: "Used for the range of outcomes", range: volR },
    ];

    /* ---------- layout */
    app.append(UI.pageHead("Projection", "One long-term projection that combines market returns, dividends, inflation, salary growth, currency, fees and tax. Set the outlook with the dial; every factor follows it.",
      h("div", { class: "row no-print" }, UI.ibtn("link", "Copy link", { class: "btn sm", onclick: share }), UI.ibtn("printer", "Print", { class: "btn sm", onclick: () => window.print() })),
      [["Overview", "#/"], "Projection"]));
    if (query.from === "portfolio") app.append(h("div", { style: { marginBottom: "14px" } }, UI.notice("Starting amount and dividend yield were taken from your portfolio.")));

    const f = {
      initial: UI.numField("Starting amount", q("initial", 100000), { pre: "Rs", min: 0 }),
      monthly: UI.numField("Monthly investment", q("monthly", 20000), { pre: "Rs", min: 0 }),
      years: UI.numField("Years", q("years", 15), { unit: "yrs", min: 1, max: 50, step: 1 }),
      reinvest: UI.checkField("Reinvest dividends", saved.reinvest ?? true),
      filer: UI.checkField("Active tax filer", saved.filer ?? true, { help: `Dividend tax ${taxes.dividendTax.filer * 100}% (non-filer ${taxes.dividendTax.nonFiler * 100}%).` }),
      sell: UI.checkField("Sell at the end (apply capital gains tax)", saved.sell ?? false),
      zakat: UI.checkField("Deduct Zakat yearly (2.5%)", saved.zakat ?? false),
      fee: UI.numField("Broker fee per purchase", q("fee", taxes.brokerage.commissionPct), { unit: "%", step: 0.05 }),
      target: UI.numField("Goal amount (optional)", q("target", 10000000), { pre: "Rs", min: 0, help: "In today's rupees." }),
    };
    let dial = q("dial", 50);
    let overrides = Object.assign({}, saved.overrides || {});
    for (const k of ["ret", "divYield", "inflation", "stepUp", "dep"]) if (query[k] !== undefined && query[k] !== "") overrides[k] = Number(query[k]);

    const dialInput = h("input", { type: "range", min: 0, max: 100, step: 1, value: dial, "aria-label": "Outlook" });
    const dialLabel = h("span", {});
    const factorBody = h("tbody", {});
    const resetBtn = h("button", { class: "btn sm ghost hidden", onclick: () => { overrides = {}; run(); } }, "Reset to dial");
    const form = h("div", { class: "card sticky no-print" },
      h("h2", {}, "Your plan"), f.initial.el, f.monthly.el, f.years.el,
      h("div", { class: "dial", style: { marginTop: "6px" } },
        h("div", { class: "dial-top" }, h("b", {}, "Outlook"), dialLabel), dialInput,
        h("div", { class: "dial-ends" }, h("span", {}, "Most conservative"), h("span", {}, "Balanced"), h("span", {}, "Most optimistic"))),
      h("div", { style: { marginTop: "14px" } }, h("div", { class: "row", style: { justifyContent: "space-between" } }, h("h3", { style: { margin: 0 } }, "Factors"), resetBtn),
        h("table", { class: "factor-tbl" }, factorBody),
        h("p", { class: "help" }, "Values follow the dial. Type in a box to fix a value yourself.")),
      h("details", { class: "more" }, h("summary", {}, "Tax, fees and Zakat"), f.reinvest.el, f.filer.el, f.fee.el, f.sell.el, f.zakat.el),
      h("details", { class: "more", open: true }, h("summary", {}, "Goal"), f.target.el));

    const out = h("div", {});
    app.append(h("div", { class: "side-layout" }, form, out));
    const head = h("div", { class: "grid g4" });
    const scenEl = h("div", {}), scenNote = h("div", { class: "help" });
    const flowEl = h("div", {});
    const mcEl = h("div", {}), mcNote = h("div", { class: "help", style: { marginTop: "8px" } });
    const goalEl = h("div", {});
    const tableEl = h("div", {});
    const fxNote = h("div", {});
    let showReal = store.get("projReal", false);
    out.append(head, fxNote,
      h("div", { class: "card", style: { marginTop: "14px" } },
        h("div", { class: "card-h" }, h("h2", {}, "Outcomes across the outlook range"),
          UI.tabs([["nominal", "Future money"], ["real", "Today's money"]], showReal ? "real" : "nominal", (v) => { showReal = v === "real"; store.set("projReal", showReal); run(); })),
        scenEl, scenNote),
      h("div", { class: "grid g2", style: { marginTop: "14px" } },
        h("div", { class: "card" }, h("h2", {}, "What builds the final amount"), flowEl),
        h("div", { class: "card" }, h("h2", {}, "Range of outcomes at this outlook"), mcEl, mcNote)),
      h("div", { class: "card" }, h("h2", {}, "Goal"), goalEl),
      h("div", { class: "card" }, h("div", { class: "card-h" }, h("h2", {}, "Year by year"), UI.ibtn("download", "CSV", { class: "btn sm no-print", onclick: () => exportCSV() })), tableEl));

    /* ---------- factor values at a dial position */
    function factorsAt(d, withOverrides = true) {
      const v = {};
      for (const fc of FACTORS) if (!fc.derived) v[fc.key] = F.lerp3(...fc.range, d);
      for (const fc of FACTORS) if (fc.derived) v[fc.key] = fc.derived(v, d);
      if (withOverrides) Object.assign(v, overrides);
      if (withOverrides && overrides.inflation !== undefined && overrides.stepUp === undefined) v.stepUp = v.inflation + F.lerp3(...realRaiseR, d);
      return v;
    }
    function opts(v, extra = {}) {
      return Object.assign({
        initial: f.initial.get(), monthly: f.monthly.get(), years: Math.max(1, Math.min(50, Math.round(f.years.get()))),
        ret: v.ret, divYield: v.divYield, reinvest: f.reinvest.get(), stepUp: v.stepUp, inflation: v.inflation,
        divTax: f.filer.get() ? taxes.dividendTax.filer : taxes.dividendTax.nonFiler, feePct: f.fee.get(),
        zakat: f.zakat.get(), zakatRate: taxes.zakatRate, sellAtEnd: f.sell.get(),
        cgt: f.filer.get() ? taxes.capitalGainsTax.filer : taxes.capitalGainsTax.nonFiler,
      }, extra);
    }
    /* display money: PKR, or foreign currency using today's rate × projected depreciation */
    const cur = settings.currency, rateNow = settings.rates[cur] || 1;
    const futRate = (year, depPct) => (cur === "PKR" ? 1 : rateNow * Math.pow(1 + depPct / 100, year));
    const sy = fmt.sym();
    const money = (pkr, year, depPct, real) => {
      const v = real ? pkr / (cur === "PKR" ? 1 : rateNow) : pkr / futRate(year, depPct);
      return (sy === "Rs" || sy.length > 1 ? sy + " " : sy) + fmt.compact(v);
    };
    const moneyFull = (pkr, year, depPct, real) => {
      const v = real ? pkr / (cur === "PKR" ? 1 : rateNow) : pkr / futRate(year, depPct);
      return (sy === "Rs" || sy.length > 1 ? sy + " " : sy) + fmt.num(v, cur === "PKR" ? 0 : 0);
    };

    let last = null;
    function paintFactors(v, base) {
      factorBody.innerHTML = "";
      for (const fc of FACTORS) {
        if (fc.key === "dep" && cur === "PKR") continue;
        const inp = h("input", { type: "number", step: 0.1, value: v[fc.key].toFixed(1), class: overrides[fc.key] !== undefined ? "edited" : "" });
        inp.addEventListener("change", () => {
          const n = Number(inp.value);
          if (inp.value === "" || !isFinite(n)) delete overrides[fc.key]; else overrides[fc.key] = n;
          run();
        });
        factorBody.append(h("tr", {}, h("td", {}, fc.label, h("small", {}, overrides[fc.key] !== undefined ? `Fixed by you · dial says ${base[fc.key].toFixed(1)}%` : fc.note)),
          h("td", { class: "fv" }, h("div", { class: "u", "data-u": "%" }, inp))));
      }
      resetBtn.classList.toggle("hidden", !Object.keys(overrides).length);
    }

    function run() {
      dial = Number(dialInput.value);
      dialLabel.textContent = dial < 15 ? "Most conservative" : dial < 40 ? "Conservative" : dial <= 60 ? "Balanced" : dial <= 85 ? "Optimistic" : "Most optimistic";
      const base = factorsAt(dial, false);
      const v = factorsAt(dial);
      paintFactors(v, base);
      const o = opts(v);
      const r = F.project(o);
      const N = o.years, fin = r.final;
      last = { o, r, v };
      store.set("projection", { initial: o.initial, monthly: o.monthly, years: o.years, dial, overrides, reinvest: o.reinvest, filer: f.filer.get(),
        fee: o.feePct, sell: o.sellAtEnd, zakat: o.zakat, target: f.target.get() });

      const flows = [];
      let prev = 0;
      for (const [m, , c] of r.monthly) { if (c !== prev) { flows.push([new Date(Date.UTC(2000, m, 1)).toISOString().slice(0, 10), -(c - prev)]); prev = c; } }
      flows.push([new Date(Date.UTC(2000, N * 12, 1)).toISOString().slice(0, 10), fin.afterTax]);
      const irr = F.xirr(flows);
      const realIrr = irr !== null ? ((1 + irr / 100) / (1 + v.inflation / 100) - 1) * 100 : null;

      head.innerHTML = "";
      head.append(
        UI.stat(`Value after ${N} years`, money(fin.afterTax, N, v.dep), cur === "PKR" ? moneyFull(fin.afterTax, N, v.dep) : `at a projected ${fmt.num(futRate(N, v.dep), 1)} PKR/${cur}`, "hero-stat"),
        UI.stat("In today's money", money(fin.real, N, v.dep, true), `prices ${((fin.deflator - 1) * 100).toFixed(0)}% higher by then`),
        UI.stat("Total contributed", money(fin.contributed, 0, 0, true), `${(fin.afterTax / Math.max(1, fin.contributed)).toFixed(2)}× multiple`),
        UI.stat("Real return per year", h("span", { class: fmt.cls(realIrr) }, fmt.pct(realIrr, 1)), `nominal ${fmt.pct(irr, 1)} · after tax & fees`));
      fxNote.innerHTML = "";
      if (cur !== "PKR") fxNote.append(h("div", { style: { marginTop: "12px" } }, UI.notice(`Shown in ${cur}. Future amounts are converted at today's rate (${fmt.num(rateNow, 2)} PKR) adjusted for ${v.dep.toFixed(1)}% yearly rupee depreciation. Today's-money figures use today's rate.`)));

      // scenarios across the dial
      scenEl.innerHTML = "";
      const marks = [[0, "Most conservative", "#c2563c"], [25, "Conservative", "#c98a3a"], [50, "Balanced", "#d6aa3c"], [75, "Optimistic", "#7fae4e"], [100, "Most optimistic", "#3a9c6b"]];
      const series = marks.map(([d, name, color]) => {
        const vv = factorsAt(d);
        const rr = F.project(opts(vv));
        return { name, color, width: 1.6, data: rr.rows.map((x) => [x.year, (showReal ? x.real / (cur === "PKR" ? 1 : rateNow) : x.value / futRate(x.year, vv.dep))]), final: rr };
      });
      series.push({ name: "Your outlook", color: "var(--ink)", width: 2.6, dash: true,
        data: r.rows.map((x) => [x.year, showReal ? x.real / (cur === "PKR" ? 1 : rateNow) : x.value / futRate(x.year, v.dep)]) });
      Charts.line(scenEl, { x: "num", height: 290, xFmt: (x) => "Y" + Math.round(x), tipX: (x) => "Year " + x, yFmt: (x) => fmt.compact(x, 1), series });
      const lo = series[0].data[series[0].data.length - 1][1], hi = series[4].data[series[4].data.length - 1][1];
      scenNote.textContent = `Across the whole dial the result ranges from ${fmt.compact(lo)} to ${fmt.compact(hi)} ${cur}${showReal ? " in today's money" : ""}. Each line moves every factor together.`;

      // contribution breakdown
      flowEl.innerHTML = "";
      const divTotal = r.rows.reduce((a, x) => a + (x.dividends || 0), 0);
      const growth = fin.value - fin.contributed - (o.reinvest ? divTotal : 0) + fin.fees + fin.zakat;
      const items = [
        { label: "Your contributions", value: fin.contributed, color: "#7b8a84" },
        { label: "Price growth", value: growth, color: "#d6aa3c" },
        { label: o.reinvest ? "Dividends reinvested" : "Dividends paid out", value: divTotal, color: "#3a9c6b" },
        { label: "Dividend tax", value: -fin.divTax, color: "#c2563c" },
        { label: "Broker fees", value: -fin.fees, color: "#c2563c" },
      ];
      if (fin.zakat) items.push({ label: "Zakat", value: -fin.zakat, color: "#c2563c" });
      if (fin.cgt) items.push({ label: "Capital gains tax", value: -fin.cgt, color: "#c2563c" });
      items.push({ label: "Inflation's bite (purchasing power)", value: -(fin.afterTax - fin.real), color: "#8a5a44" });
      Charts.hbars(flowEl, { items: items.map((x) => ({ ...x, value: x.value / (cur === "PKR" ? 1 : rateNow) })), fmt: (x) => fmt.compact(x, 1) });
      flowEl.append(h("p", { class: "help", style: { marginTop: "10px" } }, `Amounts in today's-rate ${cur}. Dividend tax is already netted from reinvested dividends.`));

      goal();
      mc();
      // table
      tableEl.innerHTML = "";
      tableEl.append(UI.table([
        { key: "year", label: "Year", render: (x) => x.year },
        { key: "monthlyContribution", label: "Monthly", num: true, render: (x) => moneyFull(x.monthlyContribution, x.year, v.dep) },
        { key: "contributed", label: "Contributed", num: true, render: (x) => moneyFull(x.contributed, x.year, v.dep) },
        { key: "dividends", label: "Dividends (net)", num: true, render: (x) => moneyFull(x.dividends, x.year, v.dep) },
        { key: "value", label: "Value", num: true, render: (x) => h("b", {}, moneyFull(x.value, x.year, v.dep)) },
        { key: "real", label: "Today's money", num: true, render: (x) => moneyFull(x.real, x.year, v.dep, true) },
      ], r.rows.slice(1), { compact: true, sort: "year", asc: true }).el);
    }

    function goal() {
      const { o, r, v } = last;
      const target = f.target.get();
      goalEl.innerHTML = "";
      if (!target) { goalEl.append(h("p", { class: "muted" }, "Enter a goal to see what it takes to reach it.")); return; }
      const got = r.final.real;
      const need = F.solveMonthly(target, o, true);
      const yrs = F.solveYears(target, o, true, 50);
      const pct = Math.min(100, (got / target) * 100);
      const needCons = F.solveMonthly(target, opts(factorsAt(0)), true);
      goalEl.append(
        h("div", { class: "row", style: { justifyContent: "space-between" } }, h("span", {}, `Goal: ${moneyFull(target, 0, 0, true)} in today's money, in ${o.years} years`), h("b", { class: "mono" }, pct.toFixed(0) + "%")),
        h("div", { class: "progress", style: { margin: "8px 0 14px" } }, h("i", { style: { width: pct + "%", background: pct >= 100 ? "var(--up)" : "var(--gold)" } })),
        h("div", { class: "grid g3" },
          UI.stat("Monthly needed at this outlook", money(Math.ceil(need / 100) * 100, 0, 0, true), need <= o.monthly ? "Your plan already covers it" : `${money(need - o.monthly, 0, 0, true)} more than now`),
          UI.stat("Monthly needed if conservative", money(Math.ceil(needCons / 100) * 100, 0, 0, true), "a safer amount to aim for"),
          UI.stat("Time needed at current amount", yrs ? `${yrs} years` : "50+ years", yrs && yrs <= o.years ? "reached within your timeline" : "keeping the monthly amount")),
        h("div", { class: "row", style: { marginTop: "12px" } },
          h("button", { class: "btn sm", onclick: () => { f.monthly.set(Math.ceil(need / 100) * 100); run(); } }, "Use outlook amount"),
          h("button", { class: "btn sm", onclick: () => { f.monthly.set(Math.ceil(needCons / 100) * 100); run(); } }, "Use conservative amount")));
      void v;
    }

    const mc = A.debounce(() => {
      const { o, v } = last;
      const sim = F.monteCarlo(Object.assign({}, o, { realTerms: true }), 800, v.vol);
      mcEl.innerHTML = "";
      const yrs = sim.p50.map((_, i) => i);
      const conv = (x) => x / (cur === "PKR" ? 1 : rateNow);
      Charts.line(mcEl, { x: "num", height: 240, xFmt: (x) => "Y" + Math.round(x), tipX: (x) => "Year " + x, yFmt: (x) => fmt.compact(x, 1),
        series: [{ name: "Unlucky (10th pct)", data: yrs.map((y) => [y, conv(sim.p10[y])]), color: "#c2563c" },
          { name: "Typical", data: yrs.map((y) => [y, conv(sim.p50[y])]), color: "#d6aa3c", width: 2.6 },
          { name: "Lucky (90th pct)", data: yrs.map((y) => [y, conv(sim.p90[y])]), color: "#3a9c6b" }] });
      const target = f.target.get();
      mcNote.innerHTML = `800 simulated paths with ${v.vol.toFixed(0)}% yearly volatility, in today's money. 80% of outcomes fall between <b>${money(sim.p10[o.years], 0, 0, true)}</b> and <b>${money(sim.p90[o.years], 0, 0, true)}</b>.` +
        (target ? ` Probability of reaching the goal: <b>${(sim.prob(target) * 100).toFixed(0)}%</b>.` : "");
    }, 250);

    function share() {
      const { o } = last;
      const p = new URLSearchParams({ initial: o.initial, monthly: o.monthly, years: o.years, dial, fee: o.feePct, target: f.target.get(), ...Object.fromEntries(Object.entries(overrides).map(([k, x]) => [k, x])) });
      const url = location.origin + location.pathname + "#/planner?" + p;
      navigator.clipboard?.writeText(url).then(() => A.toast("Link copied"), () => prompt("Copy this link:", url));
    }
    function exportCSV() {
      const { r } = last;
      A.download("aurestonk-projection.csv", A.csv([["Year", "Monthly (PKR)", "Contributed (PKR)", "Dividends net (PKR)", "Value (PKR)", "Today's money (PKR)"],
        ...r.rows.slice(1).map((x) => [x.year, Math.round(x.monthlyContribution), Math.round(x.contributed), Math.round(x.dividends), Math.round(x.value), Math.round(x.real)])]), "text/csv");
    }
    dialInput.addEventListener("input", run);
    Object.values(f).forEach((x) => { x.input.addEventListener("input", A.debounce(run, 150)); x.input.addEventListener("change", run); });
    run();
  };
})();
