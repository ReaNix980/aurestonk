/* Aurestonk charts: small dependency-free SVG charts with hover tooltips.
   Charts.line, Charts.candles, Charts.bars, Charts.donut, Charts.spark */
"use strict";
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const PALETTE = ["#c9a227", "#1f7a63", "#3b82f6", "#e76f51", "#8b5cf6", "#14b8a6", "#f59e0b", "#ec4899", "#64748b", "#84cc16", "#0ea5e9", "#a16207"];
  const css = (v, d) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || d;
  const resolve = (c) => (typeof c === "string" && c.startsWith("var(") ? css(c.slice(4, -1), "#888") : c);

  function s(tag, attrs = {}, parent) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
    if (parent) parent.append(el);
    return el;
  }

  function nice(min, max, count = 5) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => span / x <= count) || 10 * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
    return { lo, hi, ticks };
  }

  /* Redraw on resize; returns an object with update() */
  function responsive(el, draw) {
    el.classList.add("chart");
    let w = 0;
    const run = () => {
      const nw = el.clientWidth;
      if (!nw || nw === w) return;
      w = nw;
      el.innerHTML = "";
      draw(nw);
    };
    const ro = new ResizeObserver(run);
    ro.observe(el);
    requestAnimationFrame(run);
    return { redraw() { w = 0; run(); }, destroy() { ro.disconnect(); } };
  }

  function tooltip(el) {
    let t = el.querySelector(".ch-tip");
    if (!t) { t = document.createElement("div"); t.className = "ch-tip"; el.append(t); }
    return {
      show(html, x, y) {
        t.innerHTML = html;
        t.style.display = "block";
        const W = el.clientWidth, tw = t.offsetWidth;
        t.style.left = Math.min(Math.max(4, x + 14), W - tw - 4) + "px";
        if (x + 14 + tw > W) t.style.left = Math.max(4, x - tw - 14) + "px";
        t.style.top = Math.max(0, y - 10) + "px";
      },
      hide() { t.style.display = "none"; },
    };
  }

  const defaultFmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : (+v.toFixed(2)).toString());
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function timeLabel(ms, span) {
    const d = new Date(ms);
    if (span < 3 * 86400e3) return d.toISOString().slice(11, 16);
    if (span < 400 * 86400e3) return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
  }
  const toMs = (x) => (typeof x === "number" ? x : Date.parse(x.length <= 10 ? x + "T00:00:00Z" : x + "Z"));

  /* ------------------------------------------------------------ line / area */
  function line(el, o) {
    const opt = Object.assign({ height: 280, yFmt: defaultFmt, x: "time", legend: true, pad: { t: 14, r: 14, b: 28, l: 58 } }, o);
    const series = opt.series.filter((sr) => sr.data && sr.data.length);
    series.forEach((sr, i) => (sr.color = resolve(sr.color) || PALETTE[i % PALETTE.length]));
    return responsive(el, (W) => {
      if (!series.length) { el.innerHTML = '<div class="ch-empty">No data</div>'; return; }
      const H = opt.height, P = opt.pad;
      const xs = (v) => (opt.x === "time" ? toMs(v) : v);
      let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
      for (const sr of series) for (const [x, y] of sr.data) {
        const xv = xs(x);
        if (xv < xmin) xmin = xv; if (xv > xmax) xmax = xv;
        if (y !== null && isFinite(y)) { if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
      }
      if (opt.zero) { ymin = Math.min(ymin, 0); ymax = Math.max(ymax, 0); }
      const yr = nice(ymin, ymax, Math.max(3, Math.round(H / 60)));
      const X = (v) => P.l + ((xs(v) - xmin) / (xmax - xmin || 1)) * (W - P.l - P.r);
      const Y = (v) => P.t + (1 - (v - yr.lo) / (yr.hi - yr.lo || 1)) * (H - P.t - P.b);
      const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "ch-svg" }, el);
      for (const t of yr.ticks) {
        s("line", { x1: P.l, x2: W - P.r, y1: Y(t), y2: Y(t), class: t === 0 ? "ch-zero" : "ch-grid" }, svg);
        const tx = s("text", { x: P.l - 8, y: Y(t) + 4, "text-anchor": "end", class: "ch-axis" }, svg);
        tx.textContent = opt.yFmt(t);
      }
      const nx = Math.max(2, Math.floor((W - P.l - P.r) / 90));
      for (let i = 0; i <= nx; i++) {
        const xv = xmin + ((xmax - xmin) * i) / nx;
        const tx = s("text", { x: P.l + ((W - P.l - P.r) * i) / nx, y: H - 8, "text-anchor": i === 0 ? "start" : i === nx ? "end" : "middle", class: "ch-axis" }, svg);
        tx.textContent = opt.xFmt ? opt.xFmt(xv) : opt.x === "time" ? timeLabel(xv, xmax - xmin) : defaultFmt(xv);
      }
      for (const sr of series) {
        const pts = sr.data.filter(([, y]) => y !== null && isFinite(y)).map(([x, y]) => [X(x), Y(y)]);
        if (!pts.length) continue;
        const d = "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L");
        if (sr.area) {
          const gid = "g" + Math.random().toString(36).slice(2, 8);
          const grad = s("linearGradient", { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 }, s("defs", {}, svg));
          s("stop", { offset: "0%", "stop-color": sr.color, "stop-opacity": 0.28 }, grad);
          s("stop", { offset: "100%", "stop-color": sr.color, "stop-opacity": 0.02 }, grad);
          const base = Y(Math.max(yr.lo, Math.min(0, yr.hi)));
          s("path", { d: d + `L${pts[pts.length - 1][0]},${base}L${pts[0][0]},${base}Z`, fill: `url(#${gid})` }, svg);
        }
        s("path", { d, fill: "none", stroke: sr.color, "stroke-width": sr.width || 2, "stroke-dasharray": sr.dash ? "5 4" : null, "stroke-linejoin": "round" }, svg);
      }
      // hover
      const tip = tooltip(el);
      const cross = s("line", { y1: P.t, y2: H - P.b, class: "ch-cross", style: "display:none" }, svg);
      const dots = series.map((sr) => s("circle", { r: 4, fill: sr.color, stroke: "#fff", "stroke-width": 1.5, style: "display:none" }, svg));
      const hit = s("rect", { x: P.l, y: P.t, width: W - P.l - P.r, height: H - P.t - P.b, fill: "transparent" }, svg);
      const move = (ev) => {
        const r = svg.getBoundingClientRect();
        const mx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
        const xv = xmin + ((mx - P.l) / (W - P.l - P.r)) * (xmax - xmin);
        let html = "", cx = null;
        series.forEach((sr, i) => {
          let best = null, bd = Infinity;
          for (const p of sr.data) { const dd = Math.abs(xs(p[0]) - xv); if (dd < bd) { bd = dd; best = p; } }
          if (!best || best[1] === null) { dots[i].style.display = "none"; return; }
          cx = cx ?? X(best[0]);
          if (i === 0) html += `<div class="ch-tip-h">${opt.tipX ? opt.tipX(best[0]) : opt.x === "time" ? String(best[0]).slice(0, 16).replace("T", " ") : defaultFmt(best[0])}</div>`;
          html += `<div><i style="background:${sr.color}"></i>${sr.name || ""} <b>${opt.yFmt(best[1])}</b></div>`;
          dots[i].setAttribute("cx", X(best[0]));
          dots[i].setAttribute("cy", Y(best[1]));
          dots[i].style.display = "";
        });
        if (cx === null) return;
        cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.style.display = "";
        tip.show(html, cx, P.t);
      };
      const leave = () => { tip.hide(); cross.style.display = "none"; dots.forEach((d) => (d.style.display = "none")); };
      hit.addEventListener("mousemove", move);
      hit.addEventListener("touchmove", move, { passive: true });
      hit.addEventListener("mouseleave", leave);
      if (opt.legend && series.length > 1) legend(el, series.map((sr) => ({ label: sr.name, color: sr.color, dash: sr.dash })));
    });
  }

  function legend(el, items) {
    const lg = document.createElement("div");
    lg.className = "ch-legend";
    lg.innerHTML = items.map((it) => `<span><i style="background:${it.color}${it.dash ? ";opacity:.6" : ""}"></i>${it.label}</span>`).join("");
    el.append(lg);
  }

  /* ------------------------------------------------------------ candles (with volume) */
  function candles(el, o) {
    const opt = Object.assign({ height: 340, mode: "candle", yFmt: defaultFmt, hourly: false }, o);
    const rows = opt.rows || [];
    return responsive(el, (W) => {
      if (rows.length < 2) { el.innerHTML = '<div class="ch-empty">Not enough data for this range yet</div>'; return; }
      const H = opt.height, P = { t: 12, r: 62, b: 26, l: 8 };
      const volH = Math.round((H - P.t - P.b) * 0.18);
      const plotH = H - P.t - P.b - volH - 6;
      const n = rows.length;
      const step = (W - P.l - P.r) / n;
      let lo = Infinity, hi = -Infinity, vmax = 0;
      for (const r of rows) { lo = Math.min(lo, r[3]); hi = Math.max(hi, r[2]); vmax = Math.max(vmax, r[5] || 0); }
      const yr = nice(lo, hi, Math.max(3, Math.round(plotH / 55)));
      const Y = (v) => P.t + (1 - (v - yr.lo) / (yr.hi - yr.lo || 1)) * plotH;
      const X = (i) => P.l + step * (i + 0.5);
      const up = css("--up", "#16a34a"), down = css("--down", "#dc2626");
      const svg = s("svg", { width: W, height: H, class: "ch-svg" }, el);
      for (const t of yr.ticks) {
        s("line", { x1: P.l, x2: W - P.r, y1: Y(t), y2: Y(t), class: "ch-grid" }, svg);
        s("text", { x: W - P.r + 6, y: Y(t) + 4, class: "ch-axis" }, svg).textContent = opt.yFmt(t);
      }
      // x labels at day/month boundaries
      const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - P.l - P.r) / 80))));
      for (let i = 0; i < n; i += every) {
        const t = rows[i][0];
        let lab;
        if (opt.hourly) lab = (i === 0 || rows[i - every]?.[0].slice(0, 10) !== t.slice(0, 10)) ? fmtDay(t) : t.slice(11, 16);
        else lab = n > 400 ? MONTHS[+t.slice(5, 7) - 1] + " " + t.slice(2, 4) : fmtDay(t);
        s("text", { x: X(i), y: H - 8, "text-anchor": "middle", class: "ch-axis" }, svg).textContent = lab;
      }
      const vb = P.t + plotH + 6 + volH;
      const bw = Math.max(1, Math.min(14, step * 0.7));
      if (opt.mode === "line" || n > 700) {
        const d = "M" + rows.map((r, i) => X(i).toFixed(1) + "," + Y(r[4]).toFixed(1)).join("L");
        const col = rows[n - 1][4] >= rows[0][4] ? up : down;
        const gid = "c" + Math.random().toString(36).slice(2, 7);
        const g = s("linearGradient", { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 }, s("defs", {}, svg));
        s("stop", { offset: "0%", "stop-color": col, "stop-opacity": 0.22 }, g);
        s("stop", { offset: "100%", "stop-color": col, "stop-opacity": 0 }, g);
        s("path", { d: d + `L${X(n - 1)},${P.t + plotH}L${X(0)},${P.t + plotH}Z`, fill: `url(#${gid})` }, svg);
        s("path", { d, fill: "none", stroke: col, "stroke-width": 2 }, svg);
      } else {
        rows.forEach((r, i) => {
          const c = r[4] >= r[1] ? up : down;
          s("line", { x1: X(i), x2: X(i), y1: Y(r[2]), y2: Y(r[3]), stroke: c, "stroke-width": 1 }, svg);
          const y1 = Y(Math.max(r[1], r[4])), y2 = Y(Math.min(r[1], r[4]));
          s("rect", { x: X(i) - bw / 2, y: y1, width: bw, height: Math.max(1, y2 - y1), fill: c }, svg);
        });
      }
      rows.forEach((r, i) => {
        if (!vmax) return;
        const vh = ((r[5] || 0) / vmax) * volH;
        s("rect", { x: X(i) - bw / 2, y: vb - vh, width: bw, height: vh, fill: r[4] >= r[1] ? up : down, opacity: 0.3 }, svg);
      });
      const tip = tooltip(el);
      const cross = s("line", { y1: P.t, y2: vb, class: "ch-cross", style: "display:none" }, svg);
      const hit = s("rect", { x: P.l, y: P.t, width: W - P.l - P.r, height: vb - P.t, fill: "transparent" }, svg);
      const move = (ev) => {
        const rct = svg.getBoundingClientRect();
        const mx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rct.left;
        const i = Math.max(0, Math.min(n - 1, Math.floor((mx - P.l) / step)));
        const r = rows[i];
        const prevC = i > 0 ? rows[i - 1][4] : r[1];
        const ch = ((r[4] / prevC - 1) * 100);
        cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.style.display = "";
        tip.show(`<div class="ch-tip-h">${opt.hourly ? fmtDay(r[0]) + " " + r[0].slice(11, 16) : fmtDay(r[0], true)}</div>
          <div>Open <b>${opt.yFmt(r[1])}</b></div><div>High <b>${opt.yFmt(r[2])}</b></div>
          <div>Low <b>${opt.yFmt(r[3])}</b></div><div>Close <b>${opt.yFmt(r[4])}</b> <span class="${ch >= 0 ? "up" : "down"}">${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%</span></div>
          <div>Volume <b>${Math.round(r[5] || 0).toLocaleString("en-US")}</b></div>`, X(i), P.t);
      };
      hit.addEventListener("mousemove", move);
      hit.addEventListener("touchmove", move, { passive: true });
      hit.addEventListener("mouseleave", () => { tip.hide(); cross.style.display = "none"; });
    });
  }
  function fmtDay(t, year) {
    const [y, m, d] = t.slice(0, 10).split("-").map(Number);
    return `${d} ${MONTHS[m - 1]}${year ? " " + y : ""}`;
  }

  /* ------------------------------------------------------------ bars */
  function bars(el, o) {
    const opt = Object.assign({ height: 260, yFmt: defaultFmt, stacked: false, legend: true }, o);
    opt.series.forEach((sr, i) => (sr.color = sr.color || PALETTE[i % PALETTE.length]));
    return responsive(el, (W) => {
      const H = opt.height, P = { t: 12, r: 10, b: 30, l: 58 };
      const labels = opt.labels;
      const n = labels.length;
      if (!n) { el.innerHTML = '<div class="ch-empty">No data</div>'; return; }
      let lo = 0, hi = 0;
      for (let i = 0; i < n; i++) {
        if (opt.stacked) {
          let pos = 0, neg = 0;
          for (const sr of opt.series) { const v = sr.values[i] || 0; if (v >= 0) pos += v; else neg += v; }
          hi = Math.max(hi, pos); lo = Math.min(lo, neg);
        } else for (const sr of opt.series) { const v = sr.values[i] || 0; hi = Math.max(hi, v); lo = Math.min(lo, v); }
      }
      const yr = nice(lo, hi, 5);
      const Y = (v) => P.t + (1 - (v - yr.lo) / (yr.hi - yr.lo || 1)) * (H - P.t - P.b);
      const bandW = (W - P.l - P.r) / n;
      const svg = s("svg", { width: W, height: H, class: "ch-svg" }, el);
      for (const t of yr.ticks) {
        s("line", { x1: P.l, x2: W - P.r, y1: Y(t), y2: Y(t), class: t === 0 ? "ch-zero" : "ch-grid" }, svg);
        s("text", { x: P.l - 8, y: Y(t) + 4, "text-anchor": "end", class: "ch-axis" }, svg).textContent = opt.yFmt(t);
      }
      const every = Math.max(1, Math.ceil(n / Math.floor((W - P.l - P.r) / 46)));
      const tip = tooltip(el);
      for (let i = 0; i < n; i++) {
        const x0 = P.l + bandW * i;
        if (i % every === 0) s("text", { x: x0 + bandW / 2, y: H - 10, "text-anchor": "middle", class: "ch-axis" }, svg).textContent = labels[i];
        let pos = 0, neg = 0;
        const k = opt.series.length;
        opt.series.forEach((sr, j) => {
          const v = sr.values[i] || 0;
          let x, w, y1, y2;
          if (opt.stacked) {
            w = bandW * 0.68; x = x0 + (bandW - w) / 2;
            if (v >= 0) { y1 = Y(pos + v); y2 = Y(pos); pos += v; } else { y1 = Y(neg); y2 = Y(neg + v); neg += v; }
          } else {
            w = (bandW * 0.74) / k; x = x0 + bandW * 0.13 + w * j;
            y1 = Y(Math.max(v, 0)); y2 = Y(Math.min(v, 0));
          }
          const color = resolve(typeof sr.color === "function" ? sr.color(v, i) : sr.color);
          s("rect", { x, y: y1, width: Math.max(1, w - 1), height: Math.max(0.5, y2 - y1), fill: color, rx: 2 }, svg);
        });
        const hit = s("rect", { x: x0, y: P.t, width: bandW, height: H - P.t - P.b, fill: "transparent" }, svg);
        hit.addEventListener("mousemove", () => {
          tip.show(`<div class="ch-tip-h">${opt.tipLabels ? opt.tipLabels[i] : labels[i]}</div>` + opt.series.map((sr) =>
            `<div><i style="background:${resolve(typeof sr.color === "function" ? sr.color(sr.values[i], i) : sr.color)}"></i>${sr.name || ""} <b>${opt.yFmt(sr.values[i] || 0)}</b></div>`).join(""), x0 + bandW / 2, P.t);
        });
        hit.addEventListener("mouseleave", () => tip.hide());
      }
      if (opt.legend && opt.series.length > 1) legend(el, opt.series.map((sr) => ({ label: sr.name, color: typeof sr.color === "function" ? PALETTE[0] : sr.color })));
    });
  }

  /* ------------------------------------------------------------ horizontal bars (rankings) */
  function hbars(el, o) {
    const opt = Object.assign({ fmt: defaultFmt, rowH: 26 }, o);
    el.classList.add("chart");
    const max = Math.max(...opt.items.map((it) => Math.abs(it.value)), 1e-9);
    const hasNeg = opt.items.some((it) => it.value < 0);
    el.innerHTML = opt.items.map((it) => {
      const w = (Math.abs(it.value) / max) * (hasNeg ? 50 : 100);
      const left = hasNeg ? (it.value >= 0 ? 50 : 50 - w) : 0;
      const color = it.color || (it.value >= 0 ? "var(--up)" : "var(--down)");
      return `<div class="hb-row" style="height:${opt.rowH}px"><span class="hb-lab" title="${it.label}">${it.label}</span>
        <span class="hb-track">${hasNeg ? '<span class="hb-mid"></span>' : ""}<span class="hb-bar" style="left:${left}%;width:${w}%;background:${color}"></span></span>
        <span class="hb-val ${it.value > 0 ? "up" : it.value < 0 ? "down" : ""}">${opt.fmt(it.value)}</span></div>`;
    }).join("");
  }

  /* ------------------------------------------------------------ donut */
  function donut(el, o) {
    const opt = Object.assign({ size: 200, fmt: defaultFmt }, o);
    const items = opt.items.filter((it) => it.value > 0);
    items.forEach((it, i) => (it.color = it.color || PALETTE[i % PALETTE.length]));
    el.classList.add("chart", "donut-wrap");
    el.innerHTML = "";
    const total = items.reduce((a, b) => a + b.value, 0);
    const S = opt.size, R = S / 2, r = R * 0.62;
    const svg = s("svg", { width: S, height: S, viewBox: `0 0 ${S} ${S}`, class: "ch-svg" }, el);
    const tip = tooltip(el);
    let a0 = -Math.PI / 2;
    if (!total) s("circle", { cx: R, cy: R, r: (R + r) / 2, fill: "none", stroke: "var(--line)", "stroke-width": R - r }, svg);
    for (const it of items) {
      const a1 = a0 + (it.value / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a, rad) => [R + rad * Math.cos(a), R + rad * Math.sin(a)];
      const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R), [x2, y2] = p(a1, r), [x3, y3] = p(a0, r);
      const d = items.length === 1
        ? `M${R},${R - R}A${R},${R} 0 1 1 ${R - 0.01},${0}Z M${R},${R - r}A${r},${r} 0 1 0 ${R + 0.01},${R - r}Z`
        : `M${x0},${y0}A${R},${R} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${r},${r} 0 ${large} 0 ${x3},${y3}Z`;
      const path = s("path", { d, fill: it.color, "fill-rule": "evenodd", class: "dn-seg" }, svg);
      path.addEventListener("mousemove", (ev) => {
        const b = el.getBoundingClientRect();
        tip.show(`<div class="ch-tip-h">${it.label}</div><b>${opt.fmt(it.value)}</b> · ${(it.value / total * 100).toFixed(1)}%`, ev.clientX - b.left, ev.clientY - b.top);
      });
      path.addEventListener("mouseleave", () => tip.hide());
      a0 = a1;
    }
    if (opt.center) {
      const c = document.createElement("div");
      c.className = "dn-center";
      c.style.width = c.style.height = S + "px";
      c.innerHTML = opt.center;
      el.append(c);
    }
    const lg = document.createElement("div");
    lg.className = "dn-legend";
    lg.innerHTML = items.map((it) => `<div><i style="background:${it.color}"></i><span>${it.label}</span><b>${total ? (it.value / total * 100).toFixed(1) : 0}%</b></div>`).join("");
    el.append(lg);
  }

  /* ------------------------------------------------------------ sparkline */
  function spark(values, { w = 110, h = 32, color } = {}) {
    const svg = s("svg", { width: w, height: h, class: "spark" });
    const v = values.filter((x) => isFinite(x));
    if (v.length < 2) return svg;
    const lo = Math.min(...v), hi = Math.max(...v);
    const col = color || (v[v.length - 1] >= v[0] ? css("--up", "#16a34a") : css("--down", "#dc2626"));
    const d = "M" + v.map((y, i) => `${((i / (v.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((y - lo) / (hi - lo || 1)) * (h - 4)).toFixed(1)}`).join("L");
    s("path", { d, fill: "none", stroke: col, "stroke-width": 1.6 }, svg);
    return svg;
  }

  window.Charts = { line, candles, bars, hbars, donut, spark, PALETTE };
})();
