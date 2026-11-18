# Aurestonk

A free, simple toolkit for Pakistan Stock Exchange investors: KSE-100 market data, stock pages, dividends, a private portfolio tracker, an investment planner and 15 calculators.

**To put it online, follow [SETUP-GUIDE.md](SETUP-GUIDE.md).**

## Tabs

| Tab | What's in it |
|---|---|
| Home | Search, KSE-100 snapshot, three main paths, today's movers, Quick Lists |
| Market | KSE-100 chart (hourly for 1D/1W), breadth, movers, sectors, long-term returns, yearly returns |
| Stocks | Every KSE-100 stock; 10 one-click Quick Lists (e.g. Top 20 dividend stocks); sector and Shariah filters; 4 column views; CSV export |
| Stock page | Same layout for every stock: price chart, key numbers, 52-week range, performance, dividend history, a "what if I had invested" backtest, peers |
| Dividends | Upcoming payouts with "buy before" countdown, top 20 payers, payout calendar, recent payouts, dividend income goal |
| Portfolio | Multiple portfolios, buys/sells/bonus/dividends, automatic dividends after tax, P/L, XIRR, comparison with the KSE-100, allocation, dividend income, CSV import/export, backup/restore |
| Projection | One calculation combining market growth, dividends, inflation, salary growth, rupee depreciation, fees, tax and Zakat — all driven by a Conservative ↔ Optimistic dial based on real historical ranges, each factor overridable; outcome range chart; Monte Carlo; goal; year-by-year table |
| Calculators | SIP, compound interest, goal, inflation, CAGR, trade ROI, average cost, loss recovery, compare stocks, DCF, Peter Lynch, position size, salary tax (FY 2026-27), Zakat, home loan |
| Economy | Policy rate, CPI, USD/PKR, real interest rate, KSE-100 vs inflation, yearly charts |

Search everything with **Ctrl+K** (or `/`). The currency menu shows amounts in PKR, USD, EUR, GBP, AED, SAR, QAR, KWD, BHD or OMR (rates update daily; share prices stay in PKR). Dark mode is the default; the button beside the currency menu switches it.

## Project layout

```
site/                     the website (static — no build step)
  index.html
  assets/style.css
  assets/js/core.js       helpers, number formats, data loading
  assets/js/charts.js     SVG charts (line, candles, bars, donut)
  assets/js/finance.js    all maths: projections, Monte Carlo, XIRR, backtests, tax, loans, DCF
  assets/js/ui.js         shared UI: fields, tables, stock picker, price chart, Quick Lists
  assets/js/app.js        routing, search, footer
  assets/js/pages/*.js    one file per tab
  config/*.json           your details, tax rates, manual economy figures
  data/                   written by the collector (starts with SAMPLE data)
scripts/collect.py        daily PSX collector (runs on GitHub Actions)
scripts/sample_data.py    regenerates sample data
.github/workflows/        the daily schedule
vercel.json               tells Vercel to publish site/
```
