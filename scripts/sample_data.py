"""Generate SAMPLE (fake) data so the website works before the first real PSX update.

Every file written here carries "sample": true, and the website shows a clear
"sample data" banner while it is true. The real collector (collect.py)
overwrites these files with genuine PSX data.

    python scripts/sample_data.py
"""
import json
import math
import random
from datetime import date, datetime, timedelta
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "site" / "data"
random.seed(42)

# symbol, name, sector, shariah(KMI-30), start price, face value
STOCKS = [
    ("OGDC", "Oil & Gas Development Co.", "Oil & Gas Exploration", True, 120, 10),
    ("PPL", "Pakistan Petroleum", "Oil & Gas Exploration", True, 95, 10),
    ("MARI", "Mari Energies", "Oil & Gas Exploration", True, 420, 10),
    ("POL", "Pakistan Oilfields", "Oil & Gas Exploration", True, 450, 10),
    ("PSO", "Pakistan State Oil", "Oil & Gas Marketing", True, 230, 10),
    ("SNGP", "Sui Northern Gas Pipelines", "Oil & Gas Marketing", False, 70, 10),
    ("HBL", "Habib Bank", "Commercial Banks", False, 140, 10),
    ("UBL", "United Bank", "Commercial Banks", False, 230, 10),
    ("MCB", "MCB Bank", "Commercial Banks", False, 210, 10),
    ("MEBL", "Meezan Bank", "Commercial Banks", True, 240, 10),
    ("BAHL", "Bank AL Habib", "Commercial Banks", False, 110, 10),
    ("BAFL", "Bank Alfalah", "Commercial Banks", False, 65, 10),
    ("NBP", "National Bank of Pakistan", "Commercial Banks", False, 60, 10),
    ("ABL", "Allied Bank", "Commercial Banks", False, 120, 10),
    ("LUCK", "Lucky Cement", "Cement", True, 900, 10),
    ("DGKC", "D.G. Khan Cement", "Cement", True, 90, 10),
    ("MLCF", "Maple Leaf Cement", "Cement", True, 40, 10),
    ("FCCL", "Fauji Cement", "Cement", True, 30, 10),
    ("CHCC", "Cherat Cement", "Cement", True, 220, 10),
    ("KOHC", "Kohat Cement", "Cement", True, 330, 10),
    ("EFERT", "Engro Fertilizers", "Fertilizer", True, 160, 10),
    ("FFC", "Fauji Fertilizer", "Fertilizer", True, 280, 10),
    ("FATIMA", "Fatima Fertilizer", "Fertilizer", True, 70, 10),
    ("ENGROH", "Engro Holdings", "Investment Companies", True, 180, 10),
    ("DAWH", "Dawood Hercules", "Investment Companies", False, 140, 10),
    ("HUBC", "Hub Power", "Power Generation", True, 130, 10),
    ("KAPCO", "Kot Addu Power", "Power Generation", False, 35, 10),
    ("SYS", "Systems Ltd", "Technology", True, 450, 10),
    ("TRG", "TRG Pakistan", "Technology", False, 75, 10),
    ("AIRLINK", "Air Link Communication", "Technology", True, 150, 10),
    ("PTC", "Pakistan Telecommunication", "Technology", False, 20, 10),
    ("SEARL", "The Searle Company", "Pharmaceuticals", True, 70, 10),
    ("AGP", "AGP Ltd", "Pharmaceuticals", True, 120, 10),
    ("ABOT", "Abbott Laboratories", "Pharmaceuticals", True, 800, 10),
    ("NESTLE", "Nestle Pakistan", "Food & Personal Care", True, 6500, 10),
    ("UNITY", "Unity Foods", "Food & Personal Care", True, 25, 10),
    ("FFL", "Fauji Foods", "Food & Personal Care", True, 15, 10),
    ("INDU", "Indus Motor", "Automobile Assembler", True, 1500, 10),
    ("HCAR", "Honda Atlas Cars", "Automobile Assembler", True, 260, 10),
    ("SAZEW", "Sazgar Engineering", "Automobile Assembler", True, 900, 10),
    ("ISL", "International Steels", "Engineering", True, 80, 10),
    ("MUGHAL", "Mughal Iron & Steel", "Engineering", True, 70, 10),
    ("ILP", "Interloop", "Textile Composite", True, 70, 10),
    ("NML", "Nishat Mills", "Textile Composite", True, 90, 10),
    ("EPCL", "Engro Polymer", "Chemical", True, 40, 10),
    ("LOTCHEM", "Lotte Chemical Pakistan", "Chemical", True, 20, 10),
    ("PKGS", "Packages Ltd", "Paper & Board", True, 550, 10),
    ("ATRL", "Attock Refinery", "Refinery", True, 500, 10),
    ("NRL", "National Refinery", "Refinery", True, 280, 10),
    ("TGL", "Tariq Glass", "Glass & Ceramics", True, 120, 10),
]

PKT_OPEN_HOURS = [9, 10, 11, 12, 13, 14, 15]   # hourly bars 09:30-15:30 PKT


def trading_days(start: date, end: date):
    d = start
    while d <= end:
        if d.weekday() < 5:
            yield d
        d += timedelta(days=1)


def gen_series(p0, days, drift, vol, rng):
    out = []
    p = p0
    for d in days:
        r = rng.gauss(drift / 250, vol / math.sqrt(250))
        o = p * (1 + rng.gauss(0, vol / 50))
        c = max(0.5, p * math.exp(r))
        h = max(o, c) * (1 + abs(rng.gauss(0, vol / 40)))
        l = min(o, c) * (1 - abs(rng.gauss(0, vol / 40)))
        v = int(abs(rng.gauss(1, 0.6)) * 1_500_000 * (100 / max(p, 5)) ** 0.5)
        out.append([d.isoformat(), round(o, 2), round(h, 2), round(l, 2), round(c, 2), v])
        p = c
    return out


def main():
    end = date.today() - timedelta(days=1)
    while end.weekday() >= 5:
        end -= timedelta(days=1)
    start = date(end.year - 10, 1, 1)
    days = list(trading_days(start, end))
    rng = random.Random(7)
    (OUT / "history").mkdir(parents=True, exist_ok=True)
    (OUT / "hourly").mkdir(parents=True, exist_ok=True)
    now = datetime.now().replace(microsecond=0).isoformat()

    # index: grows ~18%/yr nominal with ~22% vol, ending near 235k
    idx = gen_series(30000, days, 0.19, 0.22, rng)
    scale = 235000 / idx[-1][4]
    idx = [[d, round(o * scale, 2), round(h * scale, 2), round(l * scale, 2), round(c * scale, 2), v * 40]
           for d, o, h, l, c, v in idx]
    write_json(OUT / "history" / "KSE100.json", {"s": "KSE100", "sample": True, "d": idx, "div": []})
    write_json(OUT / "hourly" / "KSE100.json", {"s": "KSE100", "sample": True, "d": hourly_from(idx[-30:], rng)})

    stocks = []
    payouts_up, payouts_recent = [], []
    for sym, name, sector, kmi, p0, face in STOCKS:
        drift = rng.uniform(0.04, 0.30)
        vol = rng.uniform(0.25, 0.5)
        series = gen_series(p0 * rng.uniform(0.25, 0.6), days, drift, vol, rng)
        k = p0 / series[-1][4]
        series = [[d, round(o * k, 2), round(h * k, 2), round(l * k, 2), round(c * k, 2), v] for d, o, h, l, c, v in series]
        # dividends: 1-4 a year, yield 0-14%
        yld = rng.choice([0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.14]) if sym not in ("TRG", "SYS", "AIRLINK", "PTC", "UNITY", "FFL") else rng.choice([0, 0, 0.01])
        per_year = rng.choice([1, 2, 4])
        divs = []
        if yld:
            for y in range(start.year, end.year + 1):
                for q in range(per_year):
                    m = [3, 8] if per_year == 2 else ([9] if per_year == 1 else [2, 4, 8, 10])
                    if q >= len(m):
                        continue
                    ex = date(y, m[q], 15)
                    while ex.weekday() >= 5:
                        ex += timedelta(days=1)
                    if ex > end:
                        continue
                    price_then = next((r[4] for r in series if r[0] >= ex.isoformat()), series[-1][4])
                    amt = round(price_then * yld / per_year * rng.uniform(0.7, 1.3), 2)
                    divs.append([ex.isoformat(), amt, "cash"])
        write_json(OUT / "history" / f"{sym}.json", {"s": sym, "sample": True, "d": series, "div": divs})
        write_json(OUT / "hourly" / f"{sym}.json", {"s": sym, "sample": True, "d": hourly_from(series[-30:], rng)})

        last, prev = series[-1], series[-2]
        price = last[4]

        def ret(n_days):
            if len(series) <= n_days:
                return None
            return round((price / series[-n_days - 1][4] - 1) * 100, 2)
        cutoff = (end - timedelta(days=365)).isoformat()
        dps12 = round(sum(a for d, a, _ in divs if d > cutoff), 2)
        eps = round(price / rng.uniform(4, 18), 2)
        shares = int(rng.uniform(0.3, 6) * 1e9 / max(price, 10) * 30)
        year = [r for r in series if r[0] > cutoff]
        stocks.append({
            "s": sym, "n": name, "sec": sector, "kse100": True, "kmi30": kmi,
            "price": price, "chg": round(price - prev[4], 2), "chgPct": round((price / prev[4] - 1) * 100, 2),
            "open": last[1], "high": last[2], "low": last[3], "vol": last[5],
            "mcap": round(price * shares), "shares": shares, "eps": eps, "pe": round(price / eps, 2),
            "dps12m": dps12, "divYield": round(dps12 / price * 100, 2) if dps12 else 0,
            "high52": max(r[2] for r in year), "low52": min(r[3] for r in year),
            "r1m": ret(21), "r6m": ret(126), "r1y": ret(250), "r3y": ret(750), "r5y": ret(1250),
            "face": face,
        })
        # upcoming payouts for ~1/3 of dividend payers
        if yld and rng.random() < 0.4:
            bc = end + timedelta(days=rng.randint(3, 45))
            amt = round(price * yld / per_year, 2)
            payouts_up.append({"s": sym, "n": name, "type": "Cash dividend", "amount": amt,
                               "pct": round(amt / face * 100, 1), "period": "Interim",
                               "bookClosureFrom": bc.isoformat(), "bookClosureTo": (bc + timedelta(days=2)).isoformat(),
                               "announced": (end - timedelta(days=rng.randint(1, 10))).isoformat()})
        for d, a, _ in divs[-2:]:
            payouts_recent.append({"s": sym, "n": name, "type": "Cash dividend", "amount": a,
                                   "pct": round(a / face * 100, 1), "exDate": d})

    write_json(OUT / "stocks.json", {"updated": now, "asOf": end.isoformat(), "sample": True, "stocks": stocks})
    last, prev = idx[-1], idx[-2]
    sectors = {}
    for s in stocks:
        g = sectors.setdefault(s["sec"], {"name": s["sec"], "mcap": 0, "w": 0})
        g["mcap"] += s["mcap"]
        g["w"] += s["mcap"] * s["chgPct"]
    sec_list = [{"name": g["name"], "mcap": g["mcap"], "chgPct": round(g["w"] / g["mcap"], 2)} for g in sectors.values()]
    write_json(OUT / "market.json", {
        "updated": now, "asOf": end.isoformat(), "sample": True,
        "index": {"s": "KSE100", "name": "KSE-100", "value": last[4], "chg": round(last[4] - prev[4], 2),
                  "chgPct": round((last[4] / prev[4] - 1) * 100, 2), "open": last[1], "high": last[2],
                  "low": last[3], "vol": last[5]},
        "breadth": {"up": sum(1 for s in stocks if s["chg"] > 0), "down": sum(1 for s in stocks if s["chg"] < 0),
                    "flat": sum(1 for s in stocks if s["chg"] == 0)},
        "sectors": sorted(sec_list, key=lambda x: -x["mcap"]),
    })
    payouts_up.sort(key=lambda p: p["bookClosureFrom"])
    payouts_recent.sort(key=lambda p: p["exDate"], reverse=True)
    write_json(OUT / "payouts.json", {"updated": now, "sample": True, "upcoming": payouts_up, "recent": payouts_recent[:60]})

    # economy (annual, sample) + daily USD/PKR
    years = list(range(end.year - 15, end.year))
    infl = [[y, round(rng.uniform(3, 12) if y < end.year - 4 else rng.uniform(9, 29), 1)] for y in years]
    fx = []
    r = 100.0
    for y in years:
        r *= 1 + rng.uniform(0.0, 0.25)
        fx.append([y, round(r, 1)])
    usd = []
    v = 278.0
    for d in days[-500:]:
        v *= 1 + rng.gauss(0.00005, 0.002)
        usd.append([d.isoformat(), round(v, 2)])
    write_json(OUT / "economy.json", {"updated": now, "sample": True, "inflationAnnual": infl,
                                      "usdpkrAnnual": fx, "gdpGrowth": [[y, round(rng.uniform(-1, 6), 1)] for y in years],
                                      "usdpkrDaily": usd})
    usd = 280.0
    write_json(OUT / "fx.json", {"sample": True, "date": None, "base": "PKR", "note": "PKR per 1 unit", "rates": {
        "PKR": 1, "USD": usd, "EUR": round(usd * 1.12, 2), "GBP": round(usd * 1.3475, 2), "AED": round(usd / 3.6725, 2),
        "SAR": round(usd / 3.75, 2), "QAR": round(usd / 3.64, 2), "KWD": round(usd / 0.307, 2), "BHD": round(usd / 0.376, 2),
        "OMR": round(usd / 0.3845, 2)}})
    write_json(OUT / "meta.json", {"updated": now, "asOf": end.isoformat(), "sample": True,
                                   "hourlySince": idx[-30][0], "symbols": len(stocks)})
    print(f"Sample data written: {len(stocks)} stocks, {len(days)} trading days, index + hourly.")


def hourly_from(daily_rows, rng):
    out = []
    for d, o, h, l, c, v in daily_rows:
        n = len(PKT_OPEN_HOURS)
        path = [o]
        for i in range(1, n):
            path.append(o + (c - o) * i / (n - 1) + rng.gauss(0, (h - l) / 6))
        path[-1] = c
        prev = o
        for i, hr in enumerate(PKT_OPEN_HOURS):
            po, pc = prev, path[i]
            hh = min(h, max(po, pc) * (1 + abs(rng.gauss(0, 0.002))))
            ll = max(l, min(po, pc) * (1 - abs(rng.gauss(0, 0.002))))
            out.append([f"{d}T{hr:02d}:30", round(po, 2), round(max(hh, po, pc), 2), round(min(ll, po, pc), 2),
                        round(pc, 2), int(v / n * rng.uniform(0.5, 1.5))])
            prev = pc
    return out


def write_json(path, obj):
    path.write_text(json.dumps(obj, separators=(",", ":")), "utf-8")


if __name__ == "__main__":
    main()
