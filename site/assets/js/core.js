/* Aurestonk core: DOM helpers, number formatting, storage, data loading. */
"use strict";
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------------- storage (never throws) */
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem("aurestonk." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("aurestonk." + k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem("aurestonk." + k); } catch { /* ignore */ } },
  };

  /* ---------------- number formatting */
  /* Currency: all data is in PKR; money outputs convert to the chosen display currency.
     rates = PKR per 1 unit of currency (from data/fx.json, updated daily). */
  const CURRENCIES = [
    ["PKR", "Rs", "Pakistani Rupee"], ["USD", "$", "US Dollar"], ["EUR", "€", "Euro"], ["GBP", "£", "British Pound"],
    ["AED", "AED", "UAE Dirham"], ["SAR", "SAR", "Saudi Riyal"], ["QAR", "QAR", "Qatari Riyal"],
    ["KWD", "KWD", "Kuwaiti Dinar"], ["BHD", "BHD", "Bahraini Dinar"], ["OMR", "OMR", "Omani Rial"],
  ];
  const settings = { currency: store.get("currency", "PKR"), rates: { PKR: 1 }, fxDate: null };
  const sym = () => (CURRENCIES.find((c) => c[0] === settings.currency) || CURRENCIES[0])[1];
  const conv = (pkr) => pkr / (settings.rates[settings.currency] || 1);
  function num(n, d = 0) {
    if (n === null || n === undefined || !isFinite(n)) return "—";
    const [i, f] = Math.abs(n).toFixed(d).split(".");
    return (n < 0 ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? "." + f : "");
  }
  function compact(n, d = 2) {
    if (n === null || n === undefined || !isFinite(n)) return "—";
    const a = Math.abs(n), s = n < 0 ? "-" : "";
    if (a >= 1e12) return s + (a / 1e12).toFixed(d) + "T";
    if (a >= 1e9) return s + (a / 1e9).toFixed(d) + "B";
    if (a >= 1e6) return s + (a / 1e6).toFixed(d) + "M";
    if (a >= 1e4) return s + (a / 1e3).toFixed(1) + "K";
    return s + num(a, a < 100 ? 2 : 0);
  }
  const money = (sy, v) => (sy.length > 1 && sy !== "Rs" ? sy + " " + v : sy === "Rs" ? "Rs " + v : sy + v);
  /* rs: full amount in display currency (input is PKR). rsc: compact. pkr: always rupees (share prices). */
  const rs = (n, d) => {
    if (n === null || n === undefined || !isFinite(n)) return "—";
    const v = conv(n);
    const dd = d ?? (settings.currency === "PKR" ? 0 : Math.abs(v) < 1000 ? 2 : 0);
    return money(sym(), num(v, dd));
  };
  const rsc = (n) => (n === null || n === undefined || !isFinite(n) ? "—" : money(sym(), compact(conv(n))));
  /* share prices: converted to the display currency, more decimals for small values */
  const pxDec = (v) => (settings.currency === "PKR" ? 2 : Math.abs(v) < 1 ? 4 : Math.abs(v) < 10 ? 3 : 2);
  const px = (n, d) => { if (n === null || n === undefined || !isFinite(n)) return "—"; const v = conv(n); return num(v, d ?? pxDec(v)); };
  const pkr = (n, d) => (n === null || n === undefined || !isFinite(n) ? "—" : money(sym(), px(n, d)));
  const pct = (n, d = 2, sign = true) => (n === null || n === undefined || !isFinite(n) ? "—" : (sign && n > 0 ? "+" : "") + n.toFixed(d) + "%");
  const cls = (n) => (n > 0 ? "up" : n < 0 ? "down" : "flat");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function date(iso, withYear = true) {
    if (!iso) return "—";
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return `${d} ${MONTHS[m - 1]}${withYear ? " " + y : ""}`;
  }
  const todayISO = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10); // PKT

  /* ---------------- data loading (cached) */
  const cache = {};
  function load(path) {
    if (!cache[path]) {
      cache[path] = fetch(path, { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(`Couldn't load ${path} (${r.status})`);
        return r.json();
      }).catch((e) => { delete cache[path]; throw e; });
    }
    return cache[path];
  }
  const data = {
    meta: () => load("/data/meta.json"),
    stocks: () => load("/data/stocks.json"),
    market: () => load("/data/market.json"),
    payouts: () => load("/data/payouts.json"),
    economy: () => load("/data/economy.json"),
    history: (s) => load(`/data/history/${encodeURIComponent(s)}.json`),
    hourly: (s) => load(`/data/hourly/${encodeURIComponent(s)}.json`).catch(() => ({ d: [] })),
    config: (n) => load(`/config/${n}.json`),
    fx: () => load("/data/fx.json").catch(() => ({ rates: { PKR: 1 } })),
    async stock(sym) {
      const { stocks } = await data.stocks();
      return stocks.find((s) => s.s === sym);
    },
  };

  /* ---------------- misc */
  function toast(msg, ms = 2600) {
    let t = $("#toast");
    if (!t) { t = h("div", { id: "toast", class: "toast", role: "status" }); document.body.append(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), ms);
  }
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  function download(name, content, type = "text/plain") {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = h("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function csv(rows) {
    return rows.map((r) => r.map((c) => {
      const s = String(c ?? "");
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(",")).join("\n");
  }
  function parseCSV(text) {
    const rows = [];
    let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); rows.push(row); row = []; cur = "";
      } else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim()));
  }

  window.Pages = window.Pages || {};
  window.A = { $, $$, h, esc, store, settings, fmt: { num, compact, rs, rsc, pkr, px, conv, sym, pct, cls, date, MONTHS }, CURRENCIES, todayISO,
               data, toast, debounce, uid, download, csv, parseCSV };
})();
