/* Calculators: one page each, all instant, all explained in plain words. */
"use strict";
(function () {
  const { h, fmt, data } = A;

  const CALCS = [
    { id: "sip", name: "Monthly investment (SIP)", icon: "calendar", group: "Grow", desc: "What a fixed monthly amount becomes, with yearly step-ups." },
    { id: "compound", name: "Compound interest", icon: "seed", group: "Grow", desc: "Grow a one-time amount at a fixed rate." },
    { id: "goal", name: "Goal planner", icon: "flag", group: "Grow", desc: "How much to invest each month to reach a target." },
    { id: "inflation", name: "Inflation", icon: "percent", group: "Grow", desc: "What today's money will cost — and be worth — in the future." },
    { id: "cagr", name: "CAGR", icon: "chart", group: "Returns", desc: "Average yearly growth between two values." },
    { id: "roi", name: "Trade profit & ROI", icon: "receipt", group: "Returns", desc: "Profit on a buy and sell after fees, dividends and tax." },
    { id: "average", name: "Average cost", icon: "scale", group: "Returns", desc: "Your new average price if you buy more shares." },
    { id: "recover", name: "Loss recovery", icon: "refresh", group: "Returns", desc: "How much a stock must rise to recover a loss." },
    { id: "compare", name: "Compare stocks", icon: "columns", group: "Stocks", desc: "Put up to 4 stocks side by side, with their performance." },
    { id: "dcf", name: "DCF value", icon: "layers", group: "Stocks", desc: "Estimate a company's value from its future cash flows." },
    { id: "lynch", name: "Peter Lynch fair value", icon: "bulb", group: "Stocks", desc: "Quick check of price vs. growth and dividends." },
    { id: "position", name: "Position size", icon: "sliders", group: "Stocks", desc: "How many shares to buy for the risk you're willing to take." },
    { id: "salary-tax", name: "Salary tax", icon: "receipt", group: "Personal", desc: "Income tax on your salary for the current tax year." },
    { id: "zakat", name: "Zakat", icon: "hand", group: "Personal", desc: "Zakat due on cash, gold, silver, shares and more." },
    { id: "home-loan", name: "Home loan / EMI", icon: "home", group: "Personal", desc: "Monthly payment and total interest on a loan." },
  ];
  window.CALCS = CALCS;

  Pages.calculators = async function (app, params, query) {
    const id = params[0];
    if (!id) return index(app);
    const c = CALCS.find((x) => x.id === id);
    if (!c) { location.hash = "#/calculators"; return; }
    document.title = c.name + " · Aurestonk";
    app.append(UI.pageHead(c.name, c.desc, null, [["Tools", "#/calculators"], c.group]));
    const box = h("div", {});
    app.append(box);
    await IMPL[id](box, query);
  };

  function index(app) {
    app.append(UI.pageHead("Tools", "Calculators for everyday investing and personal-finance questions. Results update as you type.", null, [["Overview", "#/"], "Tools"]));
    const groups = [...new Set(CALCS.map((c) => c.group))];
    for (const g of groups) {
      app.append(h("div", { class: "section-title", style: { marginTop: "18px" } }, h("h2", {}, g)),
        h("div", { class: "calc-grid" }, CALCS.filter((c) => c.group === g).map((c) =>
          h("a", { class: "calc-card", href: "#/calculators/" + c.id, html: Icon(c.icon, 20) + `<span><b>${c.name}</b><small>${c.desc}</small></span>` }))));
    }
    app.append(h("div", { style: { marginTop: "22px" } }, UI.notice(h("span", {}, "For one projection that combines returns, dividends, inflation, salary growth, currency and tax, use ", h("a", { class: "link", href: "#/planner" }, "Projection"), "."))));
  }

  /* layout helper: inputs left, results right; recompute on any input */
  function layout(box, fields, compute) {
    const res = h("div", {});
    box.append(h("div", { class: "side-layout" }, h("div", { class: "card sticky" }, fields.map((f) => f.el)), res));
    const go = () => { res.innerHTML = ""; try { compute(res); } catch (e) { res.append(UI.errorBox(e)); } };
    fields.forEach((f) => { f.input.addEventListener("input", A.debounce(go, 120)); f.input.addEventListener("change", go); });
    go();
    return go;
  }
  const card = (...k) => h("div", { class: "card" }, ...k);
  const kv = (...pairs) => h("div", { class: "kv", style: { marginTop: "12px" } }, pairs.map(([k, v]) => window.kvCell(k, v)));
  const big = (label, value, sub) => h("div", {}, h("div", { class: "muted small" }, label), h("div", { class: "result-big" }, value), sub ? h("div", { class: "muted small" }, sub) : null);

  const IMPL = {
    sip(box) {
      const m = UI.numField("Monthly investment", 25000, { pre: "Rs" }), r = UI.numField("Expected return per year", 15, { unit: "%" });
      const y = UI.numField("Years", 10, { unit: "yrs" }), s = UI.numField("Increase monthly amount each year by", 0, { unit: "%" });
      const chartEl = h("div", {});
      layout(box, [m, r, y, s], (res) => {
        const p = F.project({ initial: 0, monthly: m.get(), years: y.get(), ret: r.get(), stepUp: s.get(), reinvest: true });
        res.append(card(big("Future value", fmt.rs(p.final.value), `${fmt.rsc(p.final.value)} · you put in ${fmt.rsc(p.final.contributed)}`),
          kv(["Total invested", fmt.rs(p.final.contributed)], ["Growth", h("span", { class: "up" }, fmt.rs(p.final.value - p.final.contributed))], ["Multiple", (p.final.value / Math.max(1, p.final.contributed)).toFixed(2) + "×"])),
        card(h("h3", {}, "Year by year"), chartEl));
        chartEl.innerHTML = "";
        const rows = p.rows.slice(1);
        Charts.bars(chartEl, { labels: rows.map((x) => "Y" + x.year), stacked: true, height: 240, yFmt: (v) => fmt.compact(v, 1),
          series: [{ name: "Invested", values: rows.map((x) => Math.round(x.contributed)), color: "#94a3b8" }, { name: "Growth", values: rows.map((x) => Math.round(x.value - x.contributed)), color: "#c9a227" }] });
        res.append(h("a", { class: "btn sm", href: `#/planner?monthly=${m.get()}&ret=${r.get()}&years=${y.get()}&stepUp=${s.get()}&initial=0` }, "Open in Projection with all factors"));
      });
    },
    compound(box) {
      const p = UI.numField("Amount invested", 500000, { pre: "Rs" }), r = UI.numField("Return per year", 12, { unit: "%" }), y = UI.numField("Years", 10, { unit: "yrs" });
      const n = UI.selField("Compounded", [["1", "Yearly"], ["2", "Every 6 months"], ["4", "Quarterly"], ["12", "Monthly"], ["365", "Daily"]], "12");
      const chartEl = h("div", {});
      layout(box, [p, r, y, n], (res) => {
        const k = +n.get(), fv = p.get() * Math.pow(1 + r.get() / 100 / k, k * y.get());
        res.append(card(big("Future value", fmt.rs(fv), fmt.rsc(fv)), kv(["Interest earned", fmt.rs(fv - p.get())], ["Effective yearly rate", fmt.pct((Math.pow(1 + r.get() / 100 / k, k) - 1) * 100, 2, false)], ["Doubles in about", (72 / Math.max(0.1, r.get())).toFixed(1) + " years"])),
          card(chartEl));
        Charts.line(chartEl, { x: "num", height: 230, xFmt: (v) => "Y" + Math.round(v), tipX: (v) => "Year " + v, yFmt: (v) => fmt.compact(v, 1),
          series: [{ name: "Value", data: Array.from({ length: Math.round(y.get()) + 1 }, (_, i) => [i, p.get() * Math.pow(1 + r.get() / 100 / k, k * i)]), area: true, color: "#c9a227" }] });
      });
    },
    async goal(box, query) {
      const t = UI.numField("Target amount", +query.target || 5000000, { pre: "Rs" }), y = UI.numField("In how many years", 10, { unit: "yrs" });
      const st = F.historyStats((await data.history("KSE100")).d) || {};
      const r = UI.numField("Expected return per year", +(st.y10 ?? 15).toFixed(1), { unit: "%", help: "Prefilled with the KSE-100's 10-year average (price only)." });
      const i0 = UI.numField("Amount I already have", 0, { pre: "Rs" }), s = UI.numField("Raise my monthly amount each year by", 0, { unit: "%" });
      const infl = UI.numField("Inflation (to show today's value)", 9, { unit: "%" });
      layout(box, [t, y, r, i0, s, infl], (res) => {
        const o = { initial: i0.get(), years: y.get(), ret: r.get(), stepUp: s.get(), reinvest: true, inflation: infl.get() };
        const need = F.solveMonthly(t.get(), o);
        const p = F.project(Object.assign({}, o, { monthly: need }));
        res.append(card(big("Invest every month", fmt.rs(Math.ceil(need / 100) * 100), `for ${y.get()} years to reach ${fmt.rsc(t.get())}`),
          kv(["Total you put in", fmt.rs(p.final.contributed + 0)], ["Growth does the rest", fmt.rs(t.get() - p.final.contributed)], ["Target in today's rupees", fmt.rs(t.get() / p.final.deflator)])),
        UI.notice(`Inflation means ${fmt.rsc(t.get())} in ${y.get()} years buys what about ${fmt.rsc(t.get() / p.final.deflator)} buys today. Want the target in today's money? Use the Planner's goal option.`));
      });
    },
    inflation(box) {
      const a = UI.numField("Amount today", 100000, { pre: "Rs" }), r = UI.numField("Inflation per year", 10, { unit: "%" }), y = UI.numField("Years", 10, { unit: "yrs" });
      layout(box, [a, r, y], (res) => {
        const f = Math.pow(1 + r.get() / 100, y.get());
        res.append(card(big("Will cost", fmt.rs(a.get() * f), `in ${y.get()} years for the same things`),
          kv(["Today's money will buy", fmt.rs(a.get() / f) + " worth"], ["Prices rise by", fmt.pct((f - 1) * 100, 0)], ["Money halves in value in", (70 / Math.max(0.1, r.get())).toFixed(1) + " years"])),
        UI.notice("To grow your wealth, investments must earn more than inflation after tax. The Economy page shows the latest inflation figures."));
      });
    },
    cagr(box) {
      const s = UI.numField("Start value", 100000, { pre: "Rs" }), e = UI.numField("End value", 250000, { pre: "Rs" }), y = UI.numField("Years", 5, { unit: "yrs", step: 0.1 });
      layout(box, [s, e, y], (res) => {
        const c = F.cagr(s.get(), e.get(), y.get());
        res.append(card(big("Average growth per year (CAGR)", fmt.pct(c, 2), `Total change ${fmt.pct((e.get() / s.get() - 1) * 100, 1)}`),
          h("p", { class: "muted small" }, "CAGR is the steady yearly rate that turns the start value into the end value — it smooths out the ups and downs.")));
      });
    },
    async roi(box) {
      const taxes = await data.config("taxes");
      const bp = UI.numField("Buy price", 100, { pre: "Rs" }), sp = UI.numField("Sell price", 130, { pre: "Rs" }), q = UI.numField("Shares", 500);
      const bd = UI.textField("Bought on", new Date(Date.now() - 400 * 86400e3).toISOString().slice(0, 10), { type: "date" });
      const sd = UI.textField("Sold on", A.todayISO(), { type: "date" });
      const dv = UI.numField("Dividends received per share", 0, { pre: "Rs" });
      const fee = UI.numField("Broker fee", taxes.brokerage.commissionPct, { unit: "%" });
      const filer = UI.checkField("Tax filer", true);
      layout(box, [bp, sp, q, bd, sd, dv, fee, filer], (res) => {
        const buy = bp.get() * q.get(), sell = sp.get() * q.get();
        const fees = (buy + sell) * fee.get() / 100;
        const gain = sell - buy - fees;
        const cgtRate = filer.get() ? taxes.capitalGainsTax.filer : taxes.capitalGainsTax.nonFiler;
        const cgt = Math.max(0, gain) * cgtRate;
        const divNet = dv.get() * q.get() * (1 - (filer.get() ? taxes.dividendTax.filer : taxes.dividendTax.nonFiler));
        const net = gain - cgt + divNet;
        const yrs = Math.max(1 / 365, F.yearsBetween(bd.get(), sd.get()));
        const roi = (net / (buy + buy * fee.get() / 100)) * 100;
        res.append(card(big("Net profit", h("span", { class: fmt.cls(net) }, fmt.rs(net)), `ROI ${fmt.pct(roi, 2)} · ${fmt.pct((Math.pow(1 + roi / 100, 1 / yrs) - 1) * 100, 1)} per year`),
          kv(["Bought for", fmt.rs(buy)], ["Sold for", fmt.rs(sell)], ["Broker fees", fmt.rs(fees)], [`Capital gains tax (${cgtRate * 100}%)`, fmt.rs(cgt)], ["Dividends after tax", fmt.rs(divNet)], ["Held for", (yrs * 365).toFixed(0) + " days"])),
        UI.notice("Capital gains tax is deducted by NCCPL; exact amounts can differ slightly with your broker's charges."));
      });
    },
    average(box) {
      const q1 = UI.numField("Shares I own", 100), p1 = UI.numField("My average price", 150, { pre: "Rs" });
      const q2 = UI.numField("Shares I'll buy", 100), p2 = UI.numField("Buying price", 110, { pre: "Rs" });
      layout(box, [q1, p1, q2, p2], (res) => {
        const tq = q1.get() + q2.get(), avg = tq ? (q1.get() * p1.get() + q2.get() * p2.get()) / tq : 0;
        res.append(card(big("New average price", fmt.rs(avg, 2), `${fmt.num(tq)} shares · ${fmt.rs(tq * avg)} invested`),
          kv(["Change in average", fmt.pct((avg / p1.get() - 1) * 100, 2)], ["Break-even rise from buying price", fmt.pct((avg / p2.get() - 1) * 100, 2)])));
      });
    },
    recover(box) {
      const l = UI.numField("Loss so far", 30, { unit: "%" });
      layout(box, [l], (res) => {
        const need = (1 / (1 - Math.min(99.9, l.get()) / 100) - 1) * 100;
        res.append(card(big("Rise needed to break even", fmt.pct(need, 1, false), `after a ${l.get()}% fall`),
          h("table", { class: "mini-table", style: { marginTop: "12px" } }, h("tbody", {}, [10, 20, 30, 40, 50, 60, 75].map((x) => h("tr", {}, h("td", {}, `Fall of ${x}%`), h("td", { class: "n" }, `needs +${((1 / (1 - x / 100) - 1) * 100).toFixed(0)}%`)))))),
        UI.notice("Losses hurt more than equal gains help — that's why spreading money across several companies matters."));
      });
    },
    async compare(box, query) {
      const init = (query.s || "").split(",").filter(Boolean);
      const picks = [init[0] || "KSE100", init[1] || "", "", ""];
      const pickers = picks.map((v, i) => UI.stockPicker(`Stock ${i + 1}`, v, () => go(), { includeIndex: true }));
      const range = UI.selField("Period", [["1", "1 year"], ["3", "3 years"], ["5", "5 years"], ["10", "10 years"]], "3");
      const res = h("div", {});
      box.append(h("div", { class: "card" }, h("div", { class: "grid g4" }, pickers.map((p) => p.el)), h("div", { style: { maxWidth: "200px" } }, range.el)), res);
      range.input.addEventListener("change", () => go());
      async function go() {
        const syms = [...new Set(pickers.map((p) => p.get()).filter(Boolean))];
        res.innerHTML = "";
        if (!syms.length) return;
        const { stocks } = await data.stocks();
        const hists = await Promise.all(syms.map((s) => data.history(s).catch(() => null)));
        const yrs = +range.get();
        const series = [];
        hists.forEach((hh, i) => {
          if (!hh) return;
          const lastD = hh.d[hh.d.length - 1][0];
          const from = new Date(Date.parse(lastD) - yrs * 365.25 * 86400e3).toISOString().slice(0, 10);
          const d = hh.d.filter((r) => r[0] >= from);
          if (d.length < 2) return;
          series.push({ name: syms[i], data: window.thinSeries(d.map((r) => [r[0], (r[4] / d[0][4] - 1) * 100])) });
        });
        const chartEl = h("div", {});
        res.append(h("div", { class: "card", style: { marginTop: "16px" } }, h("h2", {}, `Price change over ${yrs} year${yrs > 1 ? "s" : ""}`), chartEl));
        Charts.line(chartEl, { height: 300, series, yFmt: (v) => v.toFixed(0) + "%", zero: true });
        const rows = syms.map((s) => stocks.find((x) => x.s === s) || (s === "KSE100" ? { s, n: "KSE-100 Index" } : null)).filter(Boolean);
        const metrics = [["Price", (x) => fmt.num(x.price, 2)], ["Today", (x) => fmt.pct(x.chgPct)], ["Sector", (x) => x.sec || "—"], ["Market cap", (x) => fmt.rsc(x.mcap)],
          ["P/E", (x) => (x.pe > 0 ? x.pe.toFixed(1) : "—")], ["EPS", (x) => fmt.num(x.eps, 2)], ["Dividend yield", (x) => (x.divYield ? x.divYield.toFixed(2) + "%" : "—")],
          ["1 year", (x) => fmt.pct(x.r1y, 1)], ["3 years", (x) => fmt.pct(x.r3y, 1)], ["5 years", (x) => fmt.pct(x.r5y, 1)], ["Shariah (KMI-30)", (x) => (x.kmi30 ? "Yes" : x.s === "KSE100" ? "—" : "No")]];
        res.append(h("div", { class: "card" }, h("h2", {}, "Side by side"), h("div", { class: "tbl-wrap" }, h("table", { class: "tbl compact" },
          h("thead", {}, h("tr", {}, h("th", {}, ""), rows.map((x) => h("th", { class: "n" }, x.s)))),
          h("tbody", {}, metrics.map(([lab, f]) => h("tr", {}, h("td", { class: "muted" }, lab), rows.map((x) => h("td", { class: "n" }, x.price !== undefined ? f(x) : "—")))))))));
      }
      go();
    },
    async dcf(box) {
      let cur = null;
      const pick = UI.stockPicker("Company (optional — fills price & shares)", "", async (s, st) => { cur = st; if (st.shares) shares.set(st.shares); go(); });
      const fcf = UI.numField("Free cash flow last year", 10000000000, { pre: "Rs", help: "From the cash-flow statement: operating cash flow − capital spending." });
      const g = UI.numField("Growth for the next 5 years", 12, { unit: "%" }), tg = UI.numField("Growth after that (forever)", 5, { unit: "%" });
      const dr = UI.numField("Discount rate (your required return)", 18, { unit: "%", help: "Pakistan's high interest rates mean this should be high." });
      const nd = UI.numField("Net debt (debt − cash)", 0, { pre: "Rs" }), shares = UI.numField("Number of shares", 1000000000);
      const go = layout(box, [pick, fcf, g, tg, dr, nd, shares], (res) => {
        const v = F.dcf({ fcf: fcf.get(), growth: g.get(), terminal: tg.get(), discount: dr.get(), netDebt: nd.get(), shares: shares.get() });
        if (!(dr.get() > tg.get())) { res.append(h("div", { class: "error-box" }, "The discount rate must be higher than the long-term growth rate.")); return; }
        const mos = cur?.price ? (v.perShare / cur.price - 1) * 100 : null;
        res.append(card(big("Estimated value per share", fmt.rs(v.perShare, 2), cur?.price ? h("span", {}, `${cur.s} trades at ${fmt.rs(cur.price, 2)}: `, h("b", { class: fmt.cls(mos) }, mos >= 0 ? `${mos.toFixed(0)}% below this estimate` : `${(-mos).toFixed(0)}% above this estimate`)) : null),
          kv(["Value of next 5 years", fmt.rsc(v.pvSum)], ["Value after year 5 (today)", fmt.rsc(v.terminalPv)], ["Company value", fmt.rsc(v.ev)], ["Equity value", fmt.rsc(v.equity)])),
        UI.notice("A DCF is only as good as its guesses. Try pessimistic numbers too — if the stock still looks cheap, that's a better sign."));
      });
      pick.el.querySelector("input").addEventListener("change", go);
    },
    async lynch(box) {
      let cur = null;
      const eps = UI.numField("Earnings per share (EPS)", 20, { pre: "Rs" }), g = UI.numField("Expected earnings growth per year", 15, { unit: "%" });
      const dy = UI.numField("Dividend yield", 6, { unit: "%" }), price = UI.numField("Current price", 200, { pre: "Rs" });
      const pick = UI.stockPicker("Fill from a stock (optional)", "", (s, st) => { cur = st; if (st.eps) eps.set(st.eps); dy.set(st.divYield || 0); price.set(st.price); go(); });
      const go = layout(box, [pick, eps, g, dy, price], (res) => {
        const pe = price.get() / Math.max(0.01, eps.get());
        const ratio = (g.get() + dy.get()) / pe;
        const fair = eps.get() * g.get();
        const verdict = ratio >= 2 ? ["Looks attractive", "up"] : ratio >= 1 ? ["Fairly priced", ""] : ["Looks expensive", "down"];
        res.append(card(big("Lynch ratio", h("span", { class: verdict[1] }, ratio.toFixed(2)), `${verdict[0]} · (growth + dividend yield) ÷ P/E`),
          kv(["P/E", pe.toFixed(1)], ["Fair value (EPS × growth)", fmt.rs(fair, 2)], ["Price vs fair value", fmt.pct((price.get() / fair - 1) * 100, 0)])),
        UI.notice("Rule of thumb: below 1 is expensive, 1–2 is fair, above 2 is attractive. Growth estimates matter a lot — use realistic ones."));
      });
    },
    position(box) {
      const cap = UI.numField("Account size", 1000000, { pre: "Rs" }), risk = UI.numField("Risk per trade", 1, { unit: "%", help: "How much of the account you're willing to lose if the stop is hit." });
      const entry = UI.numField("Entry price", 250, { pre: "Rs" }), stop = UI.numField("Stop-loss price", 235, { pre: "Rs" }), target = UI.numField("Target price (optional)", 290, { pre: "Rs" });
      layout(box, [cap, risk, entry, stop, target], (res) => {
        const perShare = entry.get() - stop.get();
        if (perShare <= 0) { res.append(h("div", { class: "error-box" }, "The stop-loss must be below the entry price.")); return; }
        const riskAmt = cap.get() * risk.get() / 100;
        let qty = Math.floor(riskAmt / perShare);
        const maxQty = Math.floor(cap.get() / entry.get());
        const capped = qty > maxQty;
        qty = Math.min(qty, maxQty);
        const rr = target.get() > entry.get() ? (target.get() - entry.get()) / perShare : null;
        res.append(card(big("Buy", `${fmt.num(qty)} shares`, `${fmt.rs(qty * entry.get())} · ${(qty * entry.get() / cap.get() * 100).toFixed(1)}% of your account`),
          kv(["Money at risk", fmt.rs(qty * perShare)], ["Risk per share", fmt.rs(perShare, 2)], ["Reward : risk", rr ? `${rr.toFixed(2)} : 1` : "—"], ["Profit at target", rr ? fmt.rs(qty * (target.get() - entry.get())) : "—"])),
        capped ? UI.notice("Limited by your account size, not your risk.") : null);
      });
    },
    async "salary-tax"(box) {
      const taxes = await data.config("taxes");
      const per = UI.selField("I'm entering my", [["m", "Monthly salary"], ["y", "Yearly salary"]], "m");
      const sal = UI.numField("Taxable salary", 250000, { pre: "Rs" });
      layout(box, [per, sal], (res) => {
        const annual = per.get() === "m" ? sal.get() * 12 : sal.get();
        const t = F.salaryTax(annual, taxes.salarySlabs, taxes.salarySurcharge);
        res.append(card(big("Tax per month", fmt.rs(t.tax / 12), `${fmt.rs(t.tax)} per year · ${(t.effective * 100).toFixed(2)}% of salary`),
          kv(["Take-home per month", fmt.rs((annual - t.tax) / 12)], ["Take-home per year", fmt.rs(annual - t.tax)], ["Your top slab rate", (t.slab.rate * 100) + "%"])),
        card(h("h3", {}, `Tax slabs for ${taxes.taxYear}`), h("table", { class: "mini-table" }, h("tbody", {}, taxes.salarySlabs.map((s, i) => {
          const from = i ? taxes.salarySlabs[i - 1].upTo + 1 : 0;
          const on = s === t.slab;
          return h("tr", { style: on ? { background: "var(--gold-soft)", fontWeight: 650 } : {} }, h("td", {}, s.upTo ? `${fmt.rs(from)} – ${fmt.rs(s.upTo)}` : `Above ${fmt.rs(from - 1)}`),
            h("td", { class: "n" }, s.rate ? `${fmt.rs(s.fixed)} + ${s.rate * 100}% above ${fmt.rs(s.over)}` : "No tax"));
        }))), h("p", { class: "help" }, "Based on the Finance Act 2026 for tax year July 2026 – June 2027. For official purposes check with FBR.")));
      });
    },
    zakat(box) {
      const f = {
        cash: UI.numField("Cash & bank balances", 300000, { pre: "Rs" }), gold: UI.numField("Gold (market value)", 0, { pre: "Rs" }),
        silver: UI.numField("Silver (market value)", 0, { pre: "Rs" }), shares: UI.numField("Shares & funds (market value)", 500000, { pre: "Rs" }),
        biz: UI.numField("Business stock & money owed to you", 0, { pre: "Rs" }), debts: UI.numField("Debts & bills due now", 0, { pre: "Rs" }),
        nisab: UI.numField("Nisab threshold", 0, { pre: "Rs", help: "Enter the current nisab announced for this year (based on silver or gold prices). Leave 0 to skip the check." }),
      };
      layout(box, Object.values(f), (res) => {
        const assets = f.cash.get() + f.gold.get() + f.silver.get() + f.shares.get() + f.biz.get();
        const net = assets - f.debts.get();
        const due = f.nisab.get() && net < f.nisab.get() ? 0 : Math.max(0, net) * 0.025;
        res.append(card(big("Zakat due", fmt.rs(due), `2.5% of ${fmt.rs(Math.max(0, net))} net zakatable wealth`),
          f.nisab.get() && net < f.nisab.get() ? h("div", { class: "notice", style: { marginTop: "10px" } }, "Your net wealth is below the nisab you entered, so no Zakat is due.") : null),
        UI.notice("This is a simple estimate. Scholars differ on details (e.g. how to value shares), so check with a scholar you trust for your situation."));
      });
    },
    "home-loan"(box) {
      const p = UI.numField("Loan amount", 10000000, { pre: "Rs" }), r = UI.numField("Interest rate per year", 14, { unit: "%", help: "Bank home-finance rates usually follow KIBOR plus a margin." }), y = UI.numField("Years", 20, { unit: "yrs" });
      const chartEl = h("div", {});
      layout(box, [p, r, y], (res) => {
        const e = F.emi(p.get(), r.get(), y.get());
        res.append(card(big("Monthly payment", fmt.rs(e.payment), `for ${y.get()} years`),
          kv(["Total paid", fmt.rs(e.total)], ["Total interest", h("span", { class: "down" }, fmt.rs(e.interest))], ["Interest vs loan", (e.interest / p.get() * 100).toFixed(0) + "%"])),
          card(h("h3", {}, "Interest vs principal each year"), chartEl));
        Charts.bars(chartEl, { labels: e.yearly.map((x) => "Y" + x.year), stacked: true, height: 240, yFmt: (v) => fmt.compact(v, 1),
          series: [{ name: "Interest", values: e.yearly.map((x) => Math.round(x.interest)), color: "#e76f51" }, { name: "Principal", values: e.yearly.map((x) => Math.round(x.principal)), color: "#1f7a63" }] });
      });
    },
  };
})();
