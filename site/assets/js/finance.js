/* Aurestonk finance engine — all the maths in one place, no UI here. */
"use strict";
(function () {
  /* ---------------- salary tax (slabs from config/taxes.json) */
  function salaryTax(annual, slabs, surcharge = 0) {
    const s = slabs.find((x) => x.upTo === null || annual <= x.upTo) || slabs[slabs.length - 1];
    let tax = s.fixed + Math.max(0, annual - s.over) * s.rate;
    tax *= 1 + (surcharge || 0);
    return { tax, slab: s, effective: annual ? tax / annual : 0 };
  }

  /* ---------------- core projection (monthly steps)
     o: initial, monthly, years, ret (price growth % / yr), divYield (% / yr), reinvest (bool),
        divTax (0-1), feePct (% per purchase), stepUp (% / yr contribution growth), inflation (% / yr),
        zakat (bool), zakatRate (0-1), cgt (0-1, applied if sellAtEnd), sellAtEnd (bool), retOverride(fn(month)->monthly return) */
  function project(o) {
    const months = Math.round(o.years * 12);
    const fee = (o.feePct || 0) / 100;
    const gm = Math.pow(1 + (o.ret || 0) / 100, 1 / 12) - 1;
    const dm = (o.divYield || 0) / 100 / 12;
    const im = Math.pow(1 + (o.inflation || 0) / 100, 1 / 12);
    let value = (o.initial || 0) * (1 - fee);
    let cost = o.initial || 0;
    let contrib = o.monthly || 0;
    let divPaid = 0, divTaxTotal = 0, feesTotal = (o.initial || 0) * fee, zakatTotal = 0, divYear = 0;
    let deflator = 1;
    const rows = [{ year: 0, contributed: cost, value, real: value, dividends: 0, gain: value - cost, divCash: 0 }];
    const monthly = [[0, value, cost]];
    for (let m = 1; m <= months; m++) {
      const r = o.retOverride ? o.retOverride(m) : gm;
      value *= 1 + r;
      const div = value * dm;
      const net = div * (1 - (o.divTax || 0));
      divTaxTotal += div - net;
      divYear += net;
      if (o.reinvest) { value += net * (1 - fee); feesTotal += net * fee; } else divPaid += net;
      value += contrib * (1 - fee);
      feesTotal += contrib * fee;
      cost += contrib;
      deflator *= im;
      if (m % 12 === 0) {
        if (o.zakat) { const z = value * (o.zakatRate || 0.025); value -= z; zakatTotal += z; }
        rows.push({ year: m / 12, contributed: cost, value, real: value / deflator, dividends: divYear, gain: value - cost, divCash: divPaid, monthlyContribution: contrib });
        divYear = 0;
        contrib *= 1 + (o.stepUp || 0) / 100;
      }
      monthly.push([m, value, cost]);
    }
    let finalValue = value, cgtPaid = 0;
    if (o.sellAtEnd && o.cgt) {
      const gain = Math.max(0, value - cost);
      cgtPaid = gain * o.cgt;
      finalValue = value - cgtPaid;
    }
    return { rows, monthly, final: { value, afterTax: finalValue, real: finalValue / deflator, contributed: cost, gain: value - cost,
      divCash: divPaid, divTax: divTaxTotal, fees: feesTotal, zakat: zakatTotal, cgt: cgtPaid, deflator } };
  }

  /* ---------------- Monte Carlo: random yearly returns around the expectation */
  function randn() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function monteCarlo(o, runs = 1000, vol = 25) {
    const months = Math.round(o.years * 12);
    const mu = Math.log(1 + (o.ret || 0) / 100) / 12, sig = (vol / 100) / Math.sqrt(12);
    const yearsN = Math.round(o.years);
    const byYear = Array.from({ length: yearsN + 1 }, () => []);
    const finals = [];
    for (let k = 0; k < runs; k++) {
      const shocks = new Float64Array(months + 1);
      for (let m = 1; m <= months; m++) shocks[m] = Math.exp(mu - sig * sig / 2 + sig * randn()) - 1;
      const res = project(Object.assign({}, o, { retOverride: (m) => shocks[m] }));
      res.rows.forEach((r, y) => byYear[y] && byYear[y].push(o.realTerms ? r.real : r.value));
      finals.push(o.realTerms ? res.final.real : res.final.afterTax);
    }
    const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
    return {
      p10: byYear.map((a) => q(a, 0.1)), p50: byYear.map((a) => q(a, 0.5)), p90: byYear.map((a) => q(a, 0.9)),
      finals, prob: (target) => finals.filter((v) => v >= target).length / finals.length,
    };
  }

  /* ---------------- goal solver: monthly amount needed to reach target */
  function solveMonthly(target, o, useReal = false) {
    const f = (mo) => { const r = project(Object.assign({}, o, { monthly: mo })); return useReal ? r.final.real : r.final.afterTax; };
    if (f(0) >= target) return 0;
    let lo = 0, hi = 1000;
    while (f(hi) < target && hi < 1e12) hi *= 2;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(mid) >= target) hi = mid; else lo = mid; }
    return hi;
  }
  function solveYears(target, o, useReal = false, maxYears = 60) {
    for (let y = 1; y <= maxYears; y++) {
      const r = project(Object.assign({}, o, { years: y }));
      if ((useReal ? r.final.real : r.final.afterTax) >= target) return y;
    }
    return null;
  }

  /* ---------------- returns & risk from daily history [[date,o,h,l,c,v],...] */
  const cagr = (start, end, years) => (start > 0 && years > 0 ? (Math.pow(end / start, 1 / years) - 1) * 100 : null);
  function yearsBetween(a, b) { return (Date.parse(b) - Date.parse(a)) / (365.25 * 86400e3); }
  function historyStats(d, divs = []) {
    if (!d || d.length < 30) return null;
    const last = d[d.length - 1];
    const res = { price: last[4] };
    for (const [k, y] of [["y1", 1], ["y3", 3], ["y5", 5], ["y10", 10]]) {
      const target = new Date(Date.parse(last[0]) - y * 365.25 * 86400e3).toISOString().slice(0, 10);
      if (d[0][0] > target) { res[k] = null; continue; }
      const p = d.find((r) => r[0] >= target);
      res[k] = p ? cagr(p[4], last[4], yearsBetween(p[0], last[0])) : null;
    }
    res.all = cagr(d[0][4], last[4], yearsBetween(d[0][0], last[0]));
    res.years = yearsBetween(d[0][0], last[0]);
    // yearly returns + volatility
    const yearly = {};
    for (const r of d) yearly[r[0].slice(0, 4)] = yearly[r[0].slice(0, 4)] || { first: r[4] , last: r[4] }, yearly[r[0].slice(0, 4)].last = r[4];
    const ys = Object.keys(yearly).sort();
    res.annual = ys.map((y, i) => {
      const prevLast = i ? yearly[ys[i - 1]].last : yearly[y].first;
      return [y, (yearly[y].last / prevLast - 1) * 100];
    });
    const rets = [];
    for (let i = 1; i < d.length; i++) rets.push(Math.log(d[i][4] / d[i - 1][4]));
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length);
    res.vol = sd * Math.sqrt(250) * 100;
    let peak = -Infinity, mdd = 0;
    for (const r of d) { peak = Math.max(peak, r[4]); mdd = Math.min(mdd, r[4] / peak - 1); }
    res.maxDrawdown = mdd * 100;
    // average dividend yield over last 3 years
    const cut = new Date(Date.parse(last[0]) - 3 * 365.25 * 86400e3).toISOString().slice(0, 10);
    const dsum = divs.filter((x) => x[0] > cut).reduce((a, b) => a + b[1], 0);
    const avgP = d.filter((r) => r[0] > cut).reduce((a, r, _, arr) => a + r[4] / arr.length, 0);
    res.divYield3y = avgP ? (dsum / 3 / avgP) * 100 : 0;
    return res;
  }

  /* ---------------- XIRR (money-weighted return) flows: [[dateISO, amount]] (negative = invested) */
  function xirr(flows) {
    if (flows.length < 2) return null;
    const t0 = Date.parse(flows[0][0]);
    const f = (r) => flows.reduce((a, [d, v]) => a + v / Math.pow(1 + r, (Date.parse(d) - t0) / (365.25 * 86400e3)), 0);
    let lo = -0.99, hi = 10;
    if (f(lo) * f(hi) > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
    }
    return ((lo + hi) / 2) * 100;
  }

  /* ---------------- backtest: invest monthly into a real price history
     o: start (ISO), initial, monthly, stepUp (%/yr), reinvest, divTax (0-1), feePct (%) */
  function backtest(hist, o) {
    const d = hist.d.filter((r) => r[0] >= o.start);
    if (d.length < 2) return null;
    const fee = (o.feePct || 0) / 100;
    const divs = (hist.div || []).filter((x) => x[0] >= o.start);
    let shares = 0, invested = 0, cash = 0, divTotal = 0, monthAmt = o.monthly || 0;
    const flows = [];
    const series = [];
    let lastMonth = "", di = 0, firstYear = d[0][0].slice(0, 4);
    const buy = (amount, price, date) => { shares += (amount * (1 - fee)) / price; invested += amount; flows.push([date, -amount]); };
    if (o.initial) buy(o.initial, d[0][4], d[0][0]);
    for (const r of d) {
      const month = r[0].slice(0, 7);
      while (di < divs.length && divs[di][0] <= r[0]) {
        const net = shares * divs[di][1] * (1 - (o.divTax || 0));
        divTotal += net;
        if (o.reinvest) shares += (net * (1 - fee)) / r[4]; else cash += net;
        di++;
      }
      if (month !== lastMonth) {
        if (lastMonth && r[0].slice(0, 4) !== firstYear && month.endsWith("-01") === false && r[0].slice(5, 7) === "01") monthAmt *= 1 + (o.stepUp || 0) / 100;
        if (monthAmt > 0 && (lastMonth || !o.initial)) buy(monthAmt, r[4], r[0]);
        lastMonth = month;
      }
      series.push([r[0], shares * r[4] + cash, invested]);
    }
    const last = d[d.length - 1];
    const value = shares * last[4] + cash;
    const xr = xirr([...flows, [last[0], value]]);
    return { series, value, invested, shares, dividends: divTotal, cash, xirr: xr, gain: value - invested, end: last[0] };
  }

  /* savings account comparison with same flows */
  function savingsCurve(series, ratePct, startMonthly, initial) {
    // replay flows from a backtest series (invested deltas) into an account paying ratePct / yr monthly
    const r = Math.pow(1 + ratePct / 100, 1 / 365) - 1;
    let bal = 0, prevInv = 0, prevDate = null;
    return series.map(([d, , inv]) => {
      if (prevDate) bal *= Math.pow(1 + r, (Date.parse(d) - Date.parse(prevDate)) / 86400e3);
      bal += inv - prevInv;
      prevInv = inv; prevDate = d;
      return [d, bal];
    });
  }

  /* ---------------- loans */
  function emi(P, ratePct, years) {
    const r = ratePct / 100 / 12, n = Math.round(years * 12);
    const pay = r ? (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : P / n;
    let bal = P;
    const yearly = [];
    let yi = 0, yp = 0;
    for (let m = 1; m <= n; m++) {
      const int = bal * r, prin = pay - int;
      bal = Math.max(0, bal - prin);
      yi += int; yp += prin;
      if (m % 12 === 0 || m === n) { yearly.push({ year: Math.ceil(m / 12), interest: yi, principal: yp, balance: bal }); yi = yp = 0; }
    }
    return { payment: pay, total: pay * n, interest: pay * n - P, yearly };
  }

  /* ---------------- DCF */
  function dcf({ fcf, growth, years = 5, terminal, discount, netDebt = 0, shares }) {
    const g = growth / 100, tg = terminal / 100, r = discount / 100;
    let pv = 0, f = fcf;
    const flows = [];
    for (let y = 1; y <= years; y++) { f *= 1 + g; const p = f / Math.pow(1 + r, y); pv += p; flows.push({ year: y, fcf: f, pv: p }); }
    const tv = r > tg ? (f * (1 + tg)) / (r - tg) : NaN;
    const tvPv = tv / Math.pow(1 + r, years);
    const ev = pv + tvPv;
    const equity = ev - netDebt;
    return { flows, pvSum: pv, terminalValue: tv, terminalPv: tvPv, ev, equity, perShare: shares ? equity / shares : null };
  }

  /* ---------------- distributions for the outlook dial */
  function percentile(arr, p) {
    const a = arr.filter((x) => isFinite(x)).sort((x, y) => x - y);
    if (!a.length) return null;
    const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return a[lo] + (a[hi] - a[lo]) * (i - lo);
  }
  /* rolling N-year CAGRs from daily rows, sampled monthly */
  function rollingCagr(d, years) {
    const out = [];
    const span = years * 365.25 * 86400e3;
    let j = 0;
    for (let i = 0; i < d.length; i += 21) {
      const t = Date.parse(d[i][0]) + span;
      while (j < d.length && Date.parse(d[j][0]) < t) j++;
      if (j >= d.length) break;
      out.push(cagr(d[i][4], d[j][4], years));
    }
    return out;
  }
  const lerp3 = (lo, mid, hi, dial) => (dial <= 50 ? lo + (mid - lo) * (dial / 50) : mid + (hi - mid) * ((dial - 50) / 50));

  window.F = { percentile, rollingCagr, lerp3, salaryTax, project, monteCarlo, solveMonthly, solveYears, cagr, yearsBetween, historyStats, xirr, backtest, savingsCurve, emi, dcf };
})();
