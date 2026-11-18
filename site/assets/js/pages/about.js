/* About, how it works, disclaimer. */
"use strict";
(function () {
  const { h, fmt, data } = A;
  Pages.about = async function (app) {
    let meta = {};
    try { meta = await data.meta(); } catch { /* ignore */ }
    app.append(UI.pageHead("About Aurestonk", "Free tools for people investing in the Pakistan Stock Exchange.", null, [["Overview", "#/"], "About"]));
    app.append(h("div", { class: "grid g2" },
      h("div", { class: "card" }, h("h2", {}, "What it does"),
        h("ul", { class: "list-plain" },
          h("li", {}, "Shows the KSE-100 and its companies with clean charts — hourly detail for recent days."),
          h("li", {}, "Ready-made lists so you never have to dig: top dividend payers, gainers, cheapest P/E, Shariah-compliant stocks."),
          h("li", {}, "A private portfolio tracker that adds dividends for you."),
          h("li", {}, "A planner and calculators that include Pakistan's inflation, taxes and fees."))),
      h("div", { class: "card" }, h("h2", {}, "Where the data comes from"),
        h("p", { style: { marginTop: 0 } }, "Prices, payouts and company figures are collected once every weekday after the market closes, from publicly available PSX pages. Economic figures come from the World Bank, the State Bank of Pakistan and the Pakistan Bureau of Statistics."),
        h("p", { class: "muted small" }, meta.asOf ? `Latest prices: ${fmt.date(meta.asOf)}${meta.sample ? " (sample data)" : ""}.` : ""),
        meta.lastRun && meta.lastRun.warnings?.length ? h("p", { class: "muted small" }, `The last update reported ${meta.lastRun.warnings.length} minor issue(s).`) : null)));
    app.append(h("div", { class: "card", style: { marginTop: "16px" } }, h("h2", {}, "Your privacy"),
      h("p", { style: { margin: 0 } }, "There are no accounts and no tracking. Your portfolio and planner settings are stored only in your own browser. Use the backup option on the Portfolio page to keep a copy or move it to another device.")));
    app.append(h("div", { class: "card", style: { marginTop: "16px" } }, h("h2", {}, "Disclaimer"),
      h("p", { style: { marginTop: 0 } }, "Aurestonk is for education and information only. It is not investment, tax or legal advice, and nothing here is a recommendation to buy or sell any security. Data can be delayed, incomplete or wrong; projections are estimates based on your assumptions, and past performance does not guarantee future results. Please check important figures with official sources and consider speaking to a licensed adviser before making decisions."),
      h("p", { class: "muted small", style: { marginBottom: 0 } }, "Aurestonk is an independent project and is not affiliated with the Pakistan Stock Exchange, SECP, or any broker.")));
  };
})();
