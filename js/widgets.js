// Pembina widget rasmi TradingView (percuma, tanpa API key, tanpa CORS).
// Setiap widget = satu <div> bekas + satu <script> yang memuatkan konfigurasi JSON.
import { PAIRS } from "./pairs.js";

const BASE = "https://s3.tradingview.com/external-embedding/";

// Bina widget: kosongkan bekas, masukkan skrip TradingView dengan config.
function buildWidget(host, scriptFile, config) {
  host.innerHTML = "";
  const container = document.createElement("div");
  container.className = "tradingview-widget-container";
  const widget = document.createElement("div");
  widget.className = "tradingview-widget-container__widget";
  container.appendChild(widget);

  const script = document.createElement("script");
  script.type = "text/javascript";
  script.async = true;
  script.src = BASE + scriptFile;
  script.innerHTML = JSON.stringify(config);
  container.appendChild(script);

  host.appendChild(container);
}

// Tolok Technical Analysis (Strong Buy … Strong Sell) untuk satu pasangan.
export function widgetTeknikal(host, simbol, interval = "1D") {
  buildWidget(host, "embed-widget-technical-analysis.js", {
    interval,
    width: "100%",
    isTransparent: true,
    height: "100%",
    symbol: simbol,
    showIntervalTabs: true,
    displayMode: "single",
    locale: "ms_MY",
    colorTheme: "dark",
  });
}

// Carta lilin penuh + indikator pra-muat (RSI, MACD, Bollinger).
export function widgetCarta(host, simbol, interval = "240") {
  buildWidget(host, "embed-widget-advanced-chart.js", {
    autosize: true,
    symbol: simbol,
    interval, // 60=1J, 240=4J, D=harian
    timezone: "Asia/Kuala_Lumpur",
    theme: "dark",
    style: "1", // lilin
    locale: "ms_MY",
    enable_publishing: false,
    allow_symbol_change: true,
    hide_side_toolbar: false,
    details: true,
    studies: [
      "STD;RSI",
      "STD;MACD",
      "STD;Bollinger_Bands",
    ],
    support_host: "https://www.tradingview.com",
  });
}

// Forex Heat Map — pandangan kekuatan mata wang seluruh pasaran.
export function widgetHeatMap(host) {
  buildWidget(host, "embed-widget-forex-heat-map.js", {
    width: "100%",
    height: "100%",
    currencies: ["EUR", "USD", "JPY", "GBP", "CHF", "AUD", "CAD", "NZD"],
    isTransparent: true,
    colorTheme: "dark",
    locale: "ms_MY",
  });
}

// Forex Cross Rates — jadual kadar silang semua pasangan.
export function widgetCrossRates(host) {
  buildWidget(host, "embed-widget-forex-cross-rates.js", {
    width: "100%",
    height: "100%",
    currencies: ["EUR", "USD", "JPY", "GBP", "CHF", "AUD", "CAD", "NZD"],
    isTransparent: true,
    colorTheme: "dark",
    locale: "ms_MY",
  });
}

// Ticker tape — harga langsung + perubahan % bagi semua pasangan watchlist.
export function widgetTickerTape(host) {
  buildWidget(host, "embed-widget-ticker-tape.js", {
    symbols: PAIRS.map((p) => ({ proName: p.tv, title: p.id })),
    showSymbolLogo: true,
    isTransparent: true,
    displayMode: "compact",
    colorTheme: "dark",
    locale: "ms_MY",
  });
}

// Kalendar ekonomi — berita impak tinggi (NFP, FOMC, CPI) untuk elak masuk order ketika berita.
export function widgetKalendar(host) {
  buildWidget(host, "embed-widget-events.js", {
    width: "100%",
    height: "100%",
    colorTheme: "dark",
    isTransparent: true,
    locale: "ms_MY",
    importanceFilter: "0,1", // sederhana & tinggi
    countryFilter: "us,eu,gb,jp,au,ca,ch,nz",
  });
}

// Screener forex — senarai pasangan dengan rating teknikal & penapis.
export function widgetScreener(host) {
  buildWidget(host, "embed-widget-screener.js", {
    width: "100%",
    height: "100%",
    defaultColumn: "overview",
    defaultScreen: "general",
    market: "forex",
    showToolbar: true,
    colorTheme: "dark",
    locale: "ms_MY",
    isTransparent: true,
  });
}
