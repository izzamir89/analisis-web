// Router hash ringkas + navigasi bawah. Tiada framework, tiada langkah build.
import { PAIRS, cariPair } from "./pairs.js";
import * as W from "./widgets.js";
import { renderKalkulator } from "./calculator.js";
import { renderAlerts, mulaTinjauan } from "./alerts.js";

const app = document.getElementById("app");
const tajukEl = document.getElementById("tajuk");

// Tetapan timeframe untuk skrin Carta
const TF = [
  { label: "1J", v: "60" },
  { label: "4J", v: "240" },
  { label: "Harian", v: "D" },
];

function setActiveNav(nama) {
  document.querySelectorAll(".navbtn").forEach((b) =>
    b.classList.toggle("aktif", b.dataset.rute === nama));
}

// ---- Skrin ----

function skrinWatchlist() {
  tajukEl.textContent = "Watchlist Forex";
  app.innerHTML = `<div class="senarai-kad"></div>`;
  const wrap = app.querySelector(".senarai-kad");
  for (const p of PAIRS) {
    const kad = document.createElement("article");
    kad.className = "kad-pair";
    kad.innerHTML = `
      <header class="kad-head">
        <div><b>${p.id}</b><span class="sub">${p.nama}</span></div>
        <a class="lihat" href="#chart/${p.id}">Carta →</a>
      </header>
      <div class="kad-widget"></div>`;
    wrap.appendChild(kad);
    W.widgetTeknikal(kad.querySelector(".kad-widget"), p.tv, "1D");
  }
}

function skrinCarta(pairId) {
  const p = cariPair(pairId);
  tajukEl.textContent = `Carta ${p.id}`;
  app.innerHTML = `
    <div class="bar-pilih">
      <select id="pilih-pair">${PAIRS.map((x) =>
        `<option value="${x.id}" ${x.id === p.id ? "selected" : ""}>${x.id}</option>`).join("")}</select>
      <div class="tf">${TF.map((t) =>
        `<button class="tfbtn" data-v="${t.v}">${t.label}</button>`).join("")}</div>
    </div>
    <div class="carta-wrap" id="carta"></div>
    <p class="nota">Tip: dalam carta, klik ikon loceng untuk set alert masa-nyata TradingView (perlu akaun TV percuma). Baca nilai ATR(14) di sini untuk kalkulator.</p>`;

  const cartaEl = app.querySelector("#carta");
  let interval = "240";
  const lukis = () => W.widgetCarta(cartaEl, cariPair(getSel()).tv, interval);
  const getSel = () => app.querySelector("#pilih-pair").value;

  app.querySelector("#pilih-pair").addEventListener("change", (e) => {
    location.hash = `#chart/${e.target.value}`;
  });
  app.querySelectorAll(".tfbtn").forEach((b) => {
    b.classList.toggle("aktif", b.dataset.v === interval);
    b.addEventListener("click", () => {
      interval = b.dataset.v;
      app.querySelectorAll(".tfbtn").forEach((x) => x.classList.toggle("aktif", x === b));
      lukis();
    });
  });
  lukis();
}

function skrinScreener() {
  tajukEl.textContent = "Screener Forex";
  app.innerHTML = `
    <div class="tab-screener">
      <button class="sbtn aktif" data-w="screener">Senarai</button>
      <button class="sbtn" data-w="heat">Heat Map</button>
      <button class="sbtn" data-w="cross">Kadar Silang</button>
    </div>
    <div class="screener-wrap" id="sc-host"></div>`;
  const hostEl = app.querySelector("#sc-host");
  const lukis = (w) => {
    if (w === "heat") W.widgetHeatMap(hostEl);
    else if (w === "cross") W.widgetCrossRates(hostEl);
    else W.widgetScreener(hostEl);
  };
  app.querySelectorAll(".sbtn").forEach((b) =>
    b.addEventListener("click", () => {
      app.querySelectorAll(".sbtn").forEach((x) => x.classList.toggle("aktif", x === b));
      lukis(b.dataset.w);
    }));
  lukis("screener");
}

function skrinKalkulator() {
  tajukEl.textContent = "Kalkulator Entry / SL / TP";
  app.innerHTML = `<div class="padded"></div>`;
  renderKalkulator(app.querySelector(".padded"));
}

function skrinAlerts() {
  tajukEl.textContent = "Alert";
  app.innerHTML = `<div class="padded"></div>`;
  renderAlerts(app.querySelector(".padded"));
}

// ---- Router ----

function route() {
  const hash = location.hash || "#watchlist";
  const [rute, arg] = hash.replace(/^#/, "").split("/");
  window.scrollTo(0, 0);
  switch (rute) {
    case "chart": skrinCarta(arg); setActiveNav("watchlist"); break;
    case "screener": skrinScreener(); setActiveNav("screener"); break;
    case "calc": skrinKalkulator(); setActiveNav("calc"); break;
    case "alerts": skrinAlerts(); setActiveNav("alerts"); break;
    default: skrinWatchlist(); setActiveNav("watchlist");
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", () => {
  route();
  mulaTinjauan(); // semak alert tersimpan semasa app dibuka
  // Daftar service worker (PWA boleh-pasang)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
});
