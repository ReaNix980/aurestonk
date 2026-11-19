"""Aurestonk daily data collector.

Runs on GitHub Actions every weekday after PSX closes. Reads public pages of the
PSX Data Portal (dps.psx.com.pk), updates the JSON files in site/data/, and the
website (on Vercel) republishes automatically.

    python scripts/collect.py                 # normal daily update
    python scripts/collect.py --backfill      # first run: download long daily history
    python scripts/collect.py --full          # also refresh company fundamentals & payouts
    python scripts/collect.py --diagnose LUCK # print what each data source returns (for debugging)

Safety rules:
  * Never overwrite good data with empty/broken data (sanity checks before every write).
  * Each data source is independent: if one fails, the others still update.
  * A summary of warnings is saved in site/data/meta.json and printed at the end.
"""
import argparse
import json
import re
import statistics
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "site" / "data"
BASE = "https://dps.psx.com.pk"
PKT = timezone(timedelta(hours=5))
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Accept": "text/html,application/json,application/xhtml+xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.7",
      "Referer": "https://dps.psx.com.pk/", "X-Requested-With": "XMLHttpRequest"}
WARN = []
S = requests.Session()
S.headers.update(UA)

# PSX's data portal now expects a short-lived token (published in a script tag on its home page)
# to be sent with each data request in the "X-Req-Id" header. It rotates every few minutes.
TOKEN = {"value": None, "at": 0.0}
TOKEN_RE = re.compile(r"window\.__ps\s*=\s*(\{.*?\})\s*[;<]", re.S)


def psx_token(force=False):
    # reuse the token for ~3 minutes; even when forced, don't refetch more than once every 20 s
    age = time.time() - TOKEN["at"]
    if TOKEN["value"] and (age < 20 or (not force and age < 200)):
        return TOKEN["value"]
    try:
        r = S.get(BASE + "/", timeout=30)
        m = TOKEN_RE.search(r.text or "")
        val = json.loads(m.group(1)).get("_k") if m else None
    except Exception:
        val = None
    TOKEN.update(value=val, at=time.time())
    if not val:
        warn("Couldn't read the PSX request token from the home page")
    return val


def warn(msg):
    WARN.append(msg)
    print("  ! " + msg)


def _request(method, url, tries=3, **kw):
    psx = url.startswith(BASE)
    refreshed = False
    k = 0
    while k < tries:
        headers = dict(kw.pop("headers", {}) or {})
        if psx:
            tok = psx_token()
            if tok:
                headers["X-Req-Id"] = tok
        try:
            r = S.request(method, url, timeout=45, headers=headers, **kw)
            if r.status_code == 200:
                return r
            if r.status_code == 403 and psx and not refreshed:
                psx_token(force=True)      # token expired: get a fresh one and retry once
                refreshed = True
                continue
            warn(f"{method} {url} -> HTTP {r.status_code}")
        except requests.RequestException as e:
            warn(f"{method} {url} -> {type(e).__name__}")
        time.sleep(2 + 3 * k)
        k += 1
    return None


def get(url, tries=3, **kw):
    return _request("GET", url, tries, **kw)


def post(url, data, tries=3):
    return _request("POST", url, tries, data=data)


def num(x):
    """'1,234.5' / '(1.2)' / '-' / '12.5%' -> float or None"""
    if x is None:
        return None
    s = str(x).strip().replace(",", "").replace("%", "").replace("Rs.", "").replace("Rs", "").strip()
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    try:
        v = float(s)
        return -v if neg else v
    except ValueError:
        return None


def load(path, default):
    try:
        return json.loads(path.read_text("utf-8"))
    except Exception:
        return default


def save(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, separators=(",", ":")), "utf-8")
    tmp.replace(path)


def table_rows(html, min_cols=3):
    """Parse every <table> into lists of dicts keyed by lower-case header text."""
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for t in soup.find_all("table"):
        heads = [th.get_text(" ", strip=True).lower() for th in t.find_all("th")]
        for tr in t.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < min_cols:
                continue
            vals = [td.get_text(" ", strip=True) for td in tds]
            row = {heads[i] if i < len(heads) else str(i): v for i, v in enumerate(vals)}
            # PSX often puts the symbol in a data attribute or link
            a = tr.find("a")
            if a and a.get_text(strip=True):
                row["_link"] = a.get_text(strip=True)
            for attr in ("data-symbol", "data-code"):
                if tr.get(attr):
                    row["_sym"] = tr.get(attr)
            out.append(row)
    return out


def col(row, *names):
    for n in names:
        for k, v in row.items():
            if k == n or k.startswith(n):
                return v
    return None


# ------------------------------------------------------------------ sources
def fetch_symbols():
    """All listed symbols with names and sectors."""
    r = get(f"{BASE}/symbols")
    if not r:
        return {}
    try:
        items = r.json()
    except ValueError:
        warn("symbols: not JSON")
        return {}
    out = {}
    for it in items if isinstance(items, list) else []:
        sym = (it.get("symbol") or "").strip().upper()
        if sym:
            out[sym] = {"n": (it.get("name") or sym).strip(), "sec": (it.get("sectorName") or "").strip().title(),
                        "etf": bool(it.get("isETF")), "debt": bool(it.get("isDebt"))}
    print(f"  symbols: {len(out)}")
    return out


def fetch_index_members(index):
    r = get(f"{BASE}/indices/{index}")
    if not r:
        return {}
    members = {}
    for row in table_rows(r.text):
        sym = (row.get("_sym") or row.get("_link") or col(row, "symbol", "scrip") or "").strip().upper()
        if not re.fullmatch(r"[A-Z0-9\-]{2,12}", sym or ""):
            continue
        members[sym] = {"weight": num(col(row, "idx wtg", "weight", "idx. wtg")),
                        "name": col(row, "name", "company")}
    print(f"  {index} members: {len(members)}")
    return members


def fetch_market_watch():
    """Today's board for every symbol: open/high/low/close/volume."""
    r = get(f"{BASE}/market-watch")
    if not r:
        return {}
    out = {}
    for row in table_rows(r.text, min_cols=6):
        sym = (row.get("_sym") or col(row, "symbol") or row.get("_link") or "").split()[0].strip().upper() if (
            row.get("_sym") or col(row, "symbol") or row.get("_link")) else ""
        if not sym:
            continue
        cur = num(col(row, "current", "close"))
        if cur is None:
            continue
        out[sym] = {"ldcp": num(col(row, "ldcp")), "o": num(col(row, "open")), "h": num(col(row, "high")),
                    "l": num(col(row, "low")), "c": cur, "v": num(col(row, "volume")) or 0,
                    "sec": col(row, "sector")}
    print(f"  market-watch rows: {len(out)}")
    return out


def fetch_ticks(sym):
    """Intraday trades for the latest session -> list of (datetime PKT, price, volume)."""
    r = get(f"{BASE}/timeseries/int/{sym}", tries=2)
    if not r:
        return []
    try:
        js = r.json()
    except ValueError:
        return []
    rows = js.get("data") if isinstance(js, dict) else js
    ticks = []
    for row in rows or []:
        if not isinstance(row, (list, tuple)) or len(row) < 2:
            continue
        ts, price = row[0], num(row[1])
        vol = num(row[2]) if len(row) > 2 else 0
        if price is None or ts is None:
            continue
        ts = float(ts)
        if ts > 1e12:
            ts /= 1000
        ticks.append((datetime.fromtimestamp(ts, PKT), price, vol or 0))
    ticks.sort(key=lambda t: t[0])
    return ticks


def fetch_eod(sym):
    """Long daily history. PSX returns [timestamp, close, volume, open?] rows."""
    r = get(f"{BASE}/timeseries/eod/{sym}", tries=2)
    if not r:
        return []
    try:
        js = r.json()
    except ValueError:
        return []
    rows = js.get("data") if isinstance(js, dict) else js
    out = []
    for row in rows or []:
        if not isinstance(row, (list, tuple)) or len(row) < 2:
            continue
        ts = float(row[0])
        if ts > 1e12:
            ts /= 1000
        d = datetime.fromtimestamp(ts, PKT).date().isoformat()
        c = num(row[1])
        v = num(row[2]) if len(row) > 2 else 0
        o = num(row[3]) if len(row) > 3 else None
        if c is None:
            continue
        o = o if o else c
        out.append([d, o, max(o, c), min(o, c), c, int(v or 0)])
    out.sort(key=lambda x: x[0])
    return out


def fetch_history(sym):
    """Full daily open/high/low/close/volume history for one symbol (POST /historical)."""
    r = post(f"{BASE}/historical", {"symbol": sym}, tries=2)
    if not r:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    for tr in soup.select("table tbody tr"):
        tds = tr.find_all("td")
        if len(tds) < 6:
            continue
        ts = tds[0].get("data-order")
        d = None
        if ts and str(ts).strip().lstrip("-").isdigit():
            d = datetime.fromtimestamp(int(ts), PKT).date().isoformat()
        if not d:
            d = to_iso(tds[0].get_text(" ", strip=True))
        o, hi, lo, c = (num(td.get_text(strip=True)) for td in tds[1:5])
        v = num(tds[5].get_text(strip=True)) or 0
        if not d or c is None:
            continue
        o = o or c
        hi = max(x for x in (hi, o, c) if x is not None)
        lo = min(x for x in (lo, o, c) if x is not None)
        out.append([d, o, hi, lo, c, int(v)])
    out.sort(key=lambda x: x[0])
    return out


def fetch_screener():
    """P/E, dividend yield, market cap, free float and sector for every listed company in one request."""
    r = get(f"{BASE}/screener", tries=2)
    if not r:
        return {}
    soup = BeautifulSoup(r.text, "html.parser")
    t = soup.find("table")
    if not t:
        return {}
    heads = [th.get_text(" ", strip=True).lower() for th in t.find_all("th")]

    def idx(*names):
        return next((i for i, h_ in enumerate(heads) if any(h_.startswith(n) for n in names)), None)
    I = {"sym": idx("symbol"), "sec": idx("sector"), "mcap": idx("market cap"), "pe": idx("pe ratio", "p/e"),
         "dy": idx("dividend yield"), "ff": idx("free float"), "price": idx("price")}
    out = {}
    for tr in t.select("tbody tr"):
        tds = tr.find_all("td")
        if I["sym"] is None or len(tds) <= I["sym"]:
            continue
        sym = tds[I["sym"]].get_text(strip=True).upper()

        def val(key):
            i = I[key]
            if i is None or i >= len(tds):
                return None
            return num(tds[i].get("data-order") or tds[i].get_text(strip=True))
        out[sym] = {"mcap": val("mcap"), "pe": val("pe"), "divYield": val("dy"), "freeFloat": val("ff"),
                    "sec": tds[I["sec"]].get_text(strip=True) if I["sec"] is not None and I["sec"] < len(tds) else ""}
    print(f"  screener rows: {len(out)}")
    return out


def fetch_company(sym):
    """Fundamentals + payout history from the company page."""
    r = get(f"{BASE}/company/{sym}", tries=2)
    if not r:
        return None
    html = r.text
    soup = BeautifulSoup(html, "html.parser")
    stats = {}
    for lab in soup.select(".stats_label"):
        val = lab.find_next_sibling(class_="stats_value") or lab.find_next(class_="stats_value")
        if val:
            stats[lab.get_text(" ", strip=True).lower()] = val.get_text(" ", strip=True)

    def stat(*keys):
        for k, v in stats.items():
            if any(key in k for key in keys):
                return num(v)
        return None
    info = {
        "pe": stat("p/e"), "eps": stat("eps"), "mcapK": stat("market cap"), "shares": stat("shares"),
        "freeFloat": stat("free float"), "face": stat("face value") or 10,
        "name": (soup.select_one(".quote__name") or soup.find("h1") or soup.title).get_text(" ", strip=True)
        if (soup.select_one(".quote__name") or soup.find("h1") or soup.title) else sym,
    }
    # payouts: rows with a "details" like "25%(F) (D)" and a book-closure range
    payouts = []
    for row in table_rows(html, min_cols=3):
        details = col(row, "details", "payout") or ""
        if "%" not in details:
            continue
        m = re.search(r"([\d.]+)\s*%", details)
        pct = float(m.group(1)) if m else None
        kind = "Bonus shares" if "(B)" in details else ("Right shares" if "(R)" in details else "Cash dividend")
        period = {"(F)": "Final", "(i)": "Interim", "(ii)": "2nd interim", "(iii)": "3rd interim"}
        per = next((v for k, v in period.items() if k.lower() in details.lower()), "")
        bc = col(row, "book closure", "book") or ""
        dates = re.findall(r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", bc)
        announced = col(row, "date") or ""
        payouts.append({"pct": pct, "type": kind, "period": per, "details": details,
                        "bookClosureFrom": to_iso(dates[0]) if dates else None,
                        "bookClosureTo": to_iso(dates[-1]) if dates else None,
                        "announced": to_iso(announced), "result": col(row, "financial results", "financial")})
    info["payouts"] = payouts
    return info


def to_iso(s):
    s = (s or "").strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%B %d, %Y", "%b %d, %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def fetch_economy(econ):
    def wb(ind):
        r = get(f"https://api.worldbank.org/v2/country/PAK/indicator/{ind}?format=json&per_page=80", tries=2)
        try:
            rows = r.json()[1]
            return sorted([[int(x["date"]), round(x["value"], 2)] for x in rows if x.get("value") is not None])
        except Exception:
            warn(f"World Bank {ind} failed")
            return None
    for key, ind in (("inflationAnnual", "FP.CPI.TOTL.ZG"), ("usdpkrAnnual", "PA.NUS.FCRF"),
                     ("gdpGrowth", "NY.GDP.MKTP.KD.ZG")):
        v = wb(ind)
        if v:
            econ[key] = v
    r = get("https://open.er-api.com/v6/latest/USD", tries=2)
    try:
        rate = r.json()["rates"]["PKR"]
        today = datetime.now(PKT).date().isoformat()
        daily = [x for x in econ.get("usdpkrDaily", []) if x[0] != today]
        daily.append([today, round(rate, 2)])
        econ["usdpkrDaily"] = daily[-2000:]
        js = r.json()["rates"]
        fx = {"PKR": 1}
        for c in ("USD", "EUR", "GBP", "AED", "SAR", "QAR", "KWD", "BHD", "OMR"):
            if js.get(c):
                fx[c] = round(js["PKR"] / js[c], 4)   # PKR per 1 unit of currency
        if len(fx) >= 5:
            save(DATA / "fx.json", {"sample": False, "date": today, "base": "PKR", "note": "PKR per 1 unit", "rates": fx})
    except Exception:
        warn("Exchange rates failed")
    return econ


# ------------------------------------------------------------------ building blocks
def hourly_candles(ticks):
    """Group trades into hourly OHLCV candles labelled by their start time (PKT)."""
    buckets = {}
    for t, p, v in ticks:
        key = t.replace(minute=0, second=0, microsecond=0)
        b = buckets.get(key)
        if not b:
            buckets[key] = [p, p, p, p, v]
        else:
            b[1] = max(b[1], p)
            b[2] = min(b[2], p)
            b[3] = p
            b[4] += v
    return [[k.strftime("%Y-%m-%dT%H:%M"), *[round(x, 2) for x in b[:4]], int(b[4])] for k, b in sorted(buckets.items())]


def daily_from_ticks(ticks):
    if not ticks:
        return None
    d = ticks[-1][0].date().isoformat()
    ps = [p for t, p, v in ticks if t.date().isoformat() == d]
    vs = sum(v for t, p, v in ticks if t.date().isoformat() == d)
    return [d, ps[0], max(ps), min(ps), ps[-1], int(vs)]


def merge_daily(rows, new_row):
    if not new_row:
        return rows
    rows = [r for r in rows if r[0] != new_row[0]]
    rows.append(new_row)
    rows.sort(key=lambda r: r[0])
    return rows


def payouts_to_divs(payouts, face):
    """Cash dividends -> [exDate(approx = book closure start), amount per share, type]"""
    out = []
    for p in payouts:
        if p["type"] != "Cash dividend" or not p["pct"] or not p["bookClosureFrom"]:
            continue
        out.append([p["bookClosureFrom"], round(p["pct"] / 100 * (face or 10), 4), "cash"])
    return sorted({d[0] + str(d[1]): d for d in out}.values())


def stock_stats(sym, meta, hist, comp, screen=None):
    d = hist["d"]
    if len(d) < 2:
        return None
    last, prev = d[-1], d[-2]
    price = last[4]
    asof = date.fromisoformat(last[0])

    def ret(days_back):
        target = (asof - timedelta(days=days_back)).isoformat()
        past = next((r for r in reversed(d) if r[0] <= target), None)
        return round((price / past[4] - 1) * 100, 2) if past and past[4] else None
    cutoff = (asof - timedelta(days=365)).isoformat()
    year = [r for r in d if r[0] > cutoff] or d[-1:]
    dps12 = round(sum(a for dd, a, *_ in hist.get("div", []) if dd > cutoff and dd <= last[0]), 2)
    comp = comp or {}
    screen = screen or {}
    eps = comp.get("eps")
    shares = comp.get("shares")
    mcap = screen.get("mcap") or (comp.get("mcapK") or 0) * 1000 or (price * shares if shares else None)
    if not eps and screen.get("pe"):
        eps = round(price / screen["pe"], 2) if screen["pe"] > 0 else None
    return {
        "s": sym, "n": meta.get("n", sym), "sec": meta.get("sec", ""), "kse100": meta.get("kse100", False),
        "kmi30": meta.get("kmi30", False), "weight": meta.get("weight"),
        "price": price, "chg": round(price - prev[4], 2), "chgPct": round((price / prev[4] - 1) * 100, 2) if prev[4] else 0,
        "open": last[1], "high": last[2], "low": last[3], "vol": last[5],
        "mcap": round(mcap) if mcap else None, "shares": shares, "eps": eps,
        "pe": round(screen.get("pe") or comp.get("pe") or (price / eps if eps and eps > 0 else 0), 2) or None,
        "dps12m": dps12, "divYield": round(dps12 / price * 100, 2) if dps12 and price else round(screen.get("divYield") or 0, 2),
        "high52": max(r[2] for r in year), "low52": min(r[3] for r in year),
        "r1m": ret(30), "r6m": ret(182), "r1y": ret(365), "r3y": ret(1095), "r5y": ret(1826),
        "face": comp.get("face") or 10, "freeFloat": comp.get("freeFloat"),
    }


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help="download full daily history for every symbol")
    ap.add_argument("--full", action="store_true", help="refresh fundamentals and payouts for every symbol")
    ap.add_argument("--diagnose", metavar="SYMBOL")
    ap.add_argument("--limit", type=int, default=0, help="only process N symbols (testing)")
    a = ap.parse_args()
    if a.diagnose:
        return diagnose(a.diagnose.upper())

    started = datetime.now(PKT)
    print(f"Aurestonk collector — {started:%Y-%m-%d %H:%M} PKT")
    meta_all = load(DATA / "meta.json", {})
    was_sample = meta_all.get("sample", True)
    if was_sample:
        print("  Replacing SAMPLE data with real PSX data.")
        a.backfill = a.full = True

    symbols = fetch_symbols()
    kse = fetch_index_members("KSE100")
    kmi = fetch_index_members("KMI30")
    if len(kse) < 50:
        warn(f"KSE-100 list looks wrong ({len(kse)} members). Keeping the previous list.")
        prev = load(DATA / "stocks.json", {}).get("stocks", [])
        kse = {s["s"]: {"weight": s.get("weight")} for s in prev if s.get("kse100") and not load(DATA / "stocks.json", {}).get("sample")}
    if not kse:
        print("No KSE-100 members available — stopping without changing any data.")
        return finish(started, ok=False)
    watch = fetch_market_watch()
    screen = fetch_screener()
    syms = sorted(kse)
    if a.limit:
        syms = syms[: a.limit]

    comp_cache = load(DATA / "companies.json", {})
    stocks, upcoming, recent = [], [], []
    hourly_since = meta_all.get("hourlySince") if not was_sample else None
    today_market = None

    for i, sym in enumerate(syms):
        print(f"[{i + 1}/{len(syms)}] {sym}")
        hpath, ipath = DATA / "history" / f"{sym}.json", DATA / "hourly" / f"{sym}.json"
        hist = load(hpath, {"s": sym, "d": [], "div": []})
        if hist.get("sample") or was_sample:
            hist = {"s": sym, "d": [], "div": []}
        # daily candles: PSX returns the full history (including today) in one request
        full = fetch_history(sym)
        if not full:
            full = fetch_eod(sym)  # older endpoint as a fallback (close + volume only)
        if full:
            merged = {r[0]: r for r in hist["d"]}
            merged.update({r[0]: r for r in full})
            hist["d"] = sorted(merged.values(), key=lambda r: r[0])
            today_market = max(today_market or "", hist["d"][-1][0])
        else:
            warn(f"{sym}: no daily history returned")
        time.sleep(0.4)
        # hourly candles: built from today's trades (optional — daily data doesn't depend on it)
        ticks = fetch_ticks(sym)
        if ticks:
            day0 = ticks[-1][0].date().isoformat()
            hour = load(ipath, {"s": sym, "d": []})
            if hour.get("sample") or was_sample:
                hour = {"s": sym, "d": []}
            new = hourly_candles([t for t in ticks if t[0].date().isoformat() == day0])
            if new:
                keep = [r for r in hour["d"] if not r[0].startswith(day0)]
                hour["d"] = sorted(keep + new, key=lambda r: r[0])
                save(ipath, hour)
                hourly_since = hourly_since or day0
        w = watch.get(sym)
        # fundamentals weekly (or on --full)
        c = comp_cache.get(sym)
        stale = not c or c.get("_fetched", "") < (date.today() - timedelta(days=7)).isoformat()
        if a.full or stale:
            got = fetch_company(sym)
            if got:
                got["_fetched"] = date.today().isoformat()
                comp_cache[sym] = c = got
            time.sleep(0.3)
        if c:
            hist["div"] = payouts_to_divs(c.get("payouts", []), c.get("face"))
            today = date.today().isoformat()
            for p in c.get("payouts", []):
                row = {"s": sym, "n": symbols.get(sym, {}).get("n", sym), "type": p["type"], "pct": p["pct"],
                       "amount": round(p["pct"] / 100 * (c.get("face") or 10), 2) if p["pct"] and p["type"] == "Cash dividend" else None,
                       "period": p["period"], "bookClosureFrom": p["bookClosureFrom"], "bookClosureTo": p["bookClosureTo"],
                       "announced": p["announced"], "exDate": p["bookClosureFrom"]}
                if p["bookClosureFrom"] and p["bookClosureFrom"] >= today:
                    upcoming.append(row)
                elif p["bookClosureFrom"]:
                    recent.append(row)
        if len(hist["d"]) >= 2:
            hist.pop("sample", None)
            save(hpath, hist)
            meta = {"n": symbols.get(sym, {}).get("n") or (c or {}).get("name") or sym,
                    "sec": symbols.get(sym, {}).get("sec") or (w or {}).get("sec") or "",
                    "kse100": True, "kmi30": sym in kmi, "weight": kse[sym].get("weight")}
            sc = screen.get(sym, {})
            if sc and not meta["sec"]:
                meta["sec"] = sc.get("sec", "")
            st = stock_stats(sym, meta, hist, c, sc)
            if st:
                stocks.append(st)
        time.sleep(0.25)

    # index
    ihist = load(DATA / "history" / "KSE100.json", {"s": "KSE100", "d": [], "div": []})
    if ihist.get("sample") or was_sample:
        ihist = {"s": "KSE100", "d": [], "div": []}
    ifull = fetch_history("KSE100")
    if ifull:
        merged = {r[0]: r for r in ihist["d"]}
        merged.update({r[0]: r for r in ifull})
        ihist["d"] = sorted(merged.values(), key=lambda r: r[0])
    elif a.backfill or len(ihist["d"]) < 30:
        eod = fetch_eod("KSE100")
        if eod:
            ihist["d"] = eod
    iticks = fetch_ticks("KSE100")
    iday = daily_from_ticks(iticks)
    if iday:
        ihist["d"] = merge_daily(ihist["d"], iday)
        ih = load(DATA / "hourly" / "KSE100.json", {"s": "KSE100", "d": []})
        if ih.get("sample") or was_sample:
            ih = {"s": "KSE100", "d": []}
        ih["d"] = sorted([r for r in ih["d"] if not r[0].startswith(iday[0])] + hourly_candles(iticks), key=lambda r: r[0])
        save(DATA / "hourly" / "KSE100.json", ih)
    if len(ihist["d"]) >= 2:
        ihist.pop("sample", None)
        save(DATA / "history" / "KSE100.json", ihist)
    else:
        warn("KSE-100 index history unavailable")

    # sanity check before replacing the stock list
    if len(stocks) < max(30, int(len(syms) * 0.6)):
        warn(f"Only {len(stocks)} of {len(syms)} stocks updated — keeping the previous stocks.json.")
        return finish(started, ok=False, hourly_since=hourly_since)
    asof = max(s_["asOf"] for s_ in [{"asOf": today_market or ""}] + [{"asOf": ihist["d"][-1][0] if ihist["d"] else ""}])
    now = datetime.now(PKT).replace(microsecond=0).isoformat()
    save(DATA / "stocks.json", {"updated": now, "asOf": asof, "sample": False, "stocks": stocks})
    save(DATA / "companies.json", comp_cache)
    sectors = {}
    for s_ in stocks:
        if not s_.get("mcap"):
            continue
        g = sectors.setdefault(s_["sec"] or "Other", {"name": s_["sec"] or "Other", "mcap": 0, "w": 0})
        g["mcap"] += s_["mcap"]
        g["w"] += s_["mcap"] * (s_["chgPct"] or 0)
    sec_list = sorted([{"name": g["name"], "mcap": g["mcap"], "chgPct": round(g["w"] / g["mcap"], 2)}
                       for g in sectors.values() if g["mcap"]], key=lambda x: -x["mcap"])
    idx = ihist["d"]
    market = {"updated": now, "asOf": asof, "sample": False, "sectors": sec_list,
              "breadth": {"up": sum(1 for x in stocks if x["chg"] > 0), "down": sum(1 for x in stocks if x["chg"] < 0),
                          "flat": sum(1 for x in stocks if x["chg"] == 0)}}
    if len(idx) >= 2:
        market["index"] = {"s": "KSE100", "name": "KSE-100", "value": idx[-1][4], "chg": round(idx[-1][4] - idx[-2][4], 2),
                           "chgPct": round((idx[-1][4] / idx[-2][4] - 1) * 100, 2), "open": idx[-1][1],
                           "high": idx[-1][2], "low": idx[-1][3], "vol": idx[-1][5]}
    save(DATA / "market.json", market)
    upcoming.sort(key=lambda p: p["bookClosureFrom"])
    recent.sort(key=lambda p: p["bookClosureFrom"], reverse=True)
    save(DATA / "payouts.json", {"updated": now, "sample": False, "upcoming": upcoming, "recent": recent[:150]})
    econ = load(DATA / "economy.json", {})
    if econ.get("sample"):
        econ = {}
    econ = fetch_economy(econ)
    econ.update({"updated": now, "sample": False})
    save(DATA / "economy.json", econ)
    return finish(started, ok=True, hourly_since=hourly_since, asof=asof, n=len(stocks))


def finish(started, ok, hourly_since=None, asof=None, n=None):
    meta = load(DATA / "meta.json", {})
    if ok:
        meta.update({"updated": datetime.now(PKT).replace(microsecond=0).isoformat(), "asOf": asof,
                     "sample": False, "symbols": n})
    if hourly_since:
        meta["hourlySince"] = hourly_since
    meta["lastRun"] = {"at": started.isoformat(timespec="minutes"), "ok": ok, "warnings": WARN[-40:]}
    save(DATA / "meta.json", meta)
    print(f"\nDone ({'OK' if ok else 'with problems'}). {len(WARN)} warning(s).")
    for w_ in WARN[:40]:
        print("  - " + w_)
    return 0  # never fail the workflow on partial data; problems are visible in meta.json


def diagnose(sym):
    print(f"Diagnosing data sources for {sym}\n")
    checks = [("symbols list", f"{BASE}/symbols"), ("KSE-100 members", f"{BASE}/indices/KSE100"),
              ("market watch", f"{BASE}/market-watch"), ("daily history", f"{BASE}/timeseries/eod/{sym}"),
              ("intraday trades", f"{BASE}/timeseries/int/{sym}"), ("company page", f"{BASE}/company/{sym}")]
    for name, url in checks:
        r = get(url, tries=1)
        print(f"== {name}: {url}")
        if not r:
            print("   FAILED\n")
            continue
        print(f"   HTTP {r.status_code}, {r.headers.get('content-type')}, {len(r.content)} bytes")
        print("   starts with:", r.text[:300].replace("\n", " "), "\n")
    print("== parsed results")
    print("   symbols:", len(fetch_symbols()))
    print("   KSE-100 members:", list(fetch_index_members("KSE100"))[:10])
    mw = fetch_market_watch()
    print("   market watch sample:", mw.get(sym))
    eod = fetch_eod(sym)
    print("   daily history rows:", len(eod), eod[:2], eod[-2:])
    t = fetch_ticks(sym)
    print("   intraday trades:", len(t), t[:2], t[-2:])
    print("   hourly candles:", hourly_candles(t)[:3])
    c = fetch_company(sym)
    if c:
        print("   company:", {k: v for k, v in c.items() if k != "payouts"})
        print("   payouts:", c["payouts"][:4])
    print("\nCopy everything above and share it if something looks wrong.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
