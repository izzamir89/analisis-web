// Skrin Dashboard — gabung data pasaran sebenar + indikator + kekuatan + SMC + sesi
// + berita jadi satu skor (enjin peraturan deterministik). "Muat data" dicetus
// pengguna supaya kuota API dikawal. Degradasi anggun bila data tiada.

import { PAIRS, cariPair } from "./pairs.js";
import { ambilOHLC, adaKunciApi } from "./marketdata.js";
import { ringkasanIndikator, kekuatanMataWang } from "./indicators.js";
import { analisaSMC } from "./smc.js";
import { skorSetup, jelaskan } from "./scoring.js";
import { backtest } from "./backtest.js";
import { ringkasan } from "./analytics.js";
import { statusMasaOrder, pasaranTutup } from "./sessions.js";
import { jarakBerita } from "./news.js";
import { escapeHtml } from "./store.js";

const KELAS_VERDICT = { BUY: "verdict-buy", SELL: "verdict-sell", WAIT: "verdict-wait" };
const BINTANG = { "A+": "⭐⭐⭐⭐⭐", A: "⭐⭐⭐⭐", B: "⭐⭐⭐", C: "⭐⭐", D: "⭐" };

// % perubahan harian dari lilin (tutup terakhir vs sebelum).
function perubahanHarian(candles) {
  if (!candles || candles.length < 2) return null;
  const a = candles[candles.length - 2].c;
  const b = candles[candles.length - 1].c;
  return a ? ((b - a) / a) * 100 : null;
}

// Arah trend satu TF dari ringkasan indikator.
function arahTrend(ind) {
  if (!ind || ind.harga == null || ind.ema200 == null) return { teks: "—", kelas: "" };
  const naik = ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200 && ind.harga > ind.ema200;
  const turun = ind.ema20 < ind.ema50 && ind.ema50 < ind.ema200 && ind.harga < ind.ema200;
  if (naik) return { teks: "BULLISH", kelas: "verdict-buy" };
  if (turun) return { teks: "BEARISH", kelas: "verdict-sell" };
  return { teks: ind.harga > ind.ema200 ? "Naik lemah" : "Turun lemah", kelas: "verdict-wait" };
}

function num(x, d = 5) {
  return x == null ? "—" : Number(x).toFixed(d);
}

export function renderDashboard(host, pairId) {
  const p = cariPair(pairId);
  host.innerHTML = `
    <div class="db-bar">
      <select id="pilih-pair" class="db-pair">${PAIRS.map(
        (x) => `<option value="${x.id}" ${x.id === p.id ? "selected" : ""}>${x.id}</option>`
      ).join("")}</select>
      <button class="btn-utama btn-muat" id="muat-data">⤓ Muat data</button>
    </div>
    <p class="nota">Skor deterministik (enjin peraturan, <b>bukan AI/ML</b>) dari data pasaran sebenar. Tekan <b>Muat data</b> — setiap muat guna kuota API. Nilai indikator mungkin beza sedikit dari broker anda.</p>
    <div id="db-status" class="nota"></div>
    <div id="db-isi"></div>`;

  host.querySelector("#pilih-pair").addEventListener("change", (e) => {
    location.hash = `#dashboard/${e.target.value}`;
  });
  host.querySelector("#muat-data").addEventListener("click", muat);

  const statusEl = host.querySelector("#db-status");
  const isiEl = host.querySelector("#db-isi");
  let candles1h = null; // disimpan untuk backtest tanpa panggilan API tambahan

  async function muat() {
    if (!adaKunciApi()) {
      statusEl.innerHTML = `⚠️ Tiada kunci API. Buka <a href="#calc">Kalkulator → ⚙️ Kunci API</a> untuk masukkan kunci Twelve Data percuma.`;
      return;
    }
    const btn = host.querySelector("#muat-data");
    btn.disabled = true;
    statusEl.textContent = "⏳ Mengambil OHLC (1J, 4J, Harian)…";

    const [r1, r4, rd] = await Promise.all([
      ambilOHLC(p.id, "60"),
      ambilOHLC(p.id, "240"),
      ambilOHLC(p.id, "D"),
    ]);
    candles1h = r1.candles || null;
    const ind1h = r1.candles ? ringkasanIndikator(r1.candles) : null;
    const ind4h = r4.candles ? ringkasanIndikator(r4.candles) : null;
    const indD = rd.candles ? ringkasanIndikator(rd.candles) : null;
    const smc = r1.candles ? analisaSMC(r1.candles) : null;

    // Kekuatan mata wang — dari perubahan harian pasangan (cache-dahulu, jimat kuota).
    statusEl.textContent = "⏳ Mengira kekuatan mata wang…";
    const perubahan = {};
    let lengkap = 0;
    for (const pr of PAIRS) {
      const rr = pr.id === p.id ? rd : await ambilOHLC(pr.id, "D", { outputsize: 30 });
      const ch = perubahanHarian(rr.candles);
      if (ch != null) {
        perubahan[pr.id] = ch;
        lengkap++;
      }
    }
    const kekuatan = kekuatanMataWang(perubahan);

    const now = new Date();
    const statusSesi = statusMasaOrder(now);
    const berita = jarakBerita(now);
    const hasil = skorSetup({
      pairId: p.id,
      ind1h,
      ind4h,
      indD,
      kekuatan,
      smc,
      statusSesi,
      berita,
      pasaranTutup: pasaranTutup(now),
    });

    const sumberTeks =
      r1.sumber === "manual" && !ind1h
        ? "⚠️ Data 1J tidak tersedia — sebahagian skor dianggar."
        : `Sumber: ${r1.sumber}. Kekuatan: ${lengkap}/${PAIRS.length} pasangan.`;
    statusEl.textContent = sumberTeks;
    btn.disabled = false;

    lukis({ hasil, ind1h, ind4h, indD, kekuatan, smc, statusSesi, berita });
  }

  function lukis(d) {
    const { hasil, ind1h, ind4h, indD, kekuatan, smc, statusSesi, berita } = d;
    const kelasV = KELAS_VERDICT[hasil.verdict] || "";
    const tfRows = [
      ["1 Jam", ind1h],
      ["4 Jam", ind4h],
      ["Harian", indD],
    ]
      .map(([lbl, ind]) => {
        const t = arahTrend(ind);
        return `<tr><td>${lbl}</td><td class="${t.kelas}">${t.teks}</td></tr>`;
      })
      .join("");

    const barKekuatan = Object.entries(kekuatan)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([mw, v]) =>
          `<div class="kk-baris"><span class="kk-mw">${escapeHtml(mw)}</span>
             <span class="kk-bar"><span class="kk-isi" style="width:${v * 10}%"></span></span>
             <span class="kk-nilai">${v}</span></div>`
      )
      .join("");

    const rsiKelas = ind1h && ind1h.rsi != null ? (ind1h.rsi >= 70 ? "verdict-sell" : ind1h.rsi <= 30 ? "verdict-buy" : "") : ""; // prettier-ignore
    const macdKelas = ind1h && ind1h.macdHist != null ? (ind1h.macdHist > 0 ? "verdict-buy" : "verdict-sell") : ""; // prettier-ignore

    const smcRows = smc
      ? `<tr><td>BOS</td><td class="${smc.bos.arah ? (smc.bos.arah === "bull" ? "verdict-buy" : "verdict-sell") : ""}">${smc.bos.arah ? smc.bos.arah + " ✅" : "—"}</td></tr>
         <tr><td>CHoCH</td><td>${smc.choch.arah ? smc.choch.arah : "—"}</td></tr>
         <tr><td>Order Block</td><td>${smc.ob.length ? smc.ob[0].jenis + " ✅" : "—"}</td></tr>
         <tr><td>Liquidity Grab</td><td>${smc.grab.length ? smc.grab[0].arah + " ✅" : "—"}</td></tr>`
      : `<tr><td colspan="2">Tiada data SMC.</td></tr>`;

    const beritaTeks = !berita.ada
      ? "Tiada berita merah dijadualkan."
      : berita.bahaya
        ? "⛔ Zon bahaya berita (±30 min)."
        : `Berita merah dalam ${Math.round(berita.minit)} min.`;

    isiEl.innerHTML = `
      <div class="kotak db-confidence ${kelasV}">
        <div class="db-conf-atas">
          <div>
            <div class="db-verdict">${hasil.verdict} ${hasil.skor}%</div>
            <div class="db-gred">${BINTANG[hasil.gred] || ""} Gred ${hasil.gred}</div>
          </div>
          <a class="btn-kecil" href="#calc">Buka di Kalkulator →</a>
        </div>
        <p class="db-jelas">${escapeHtml(jelaskan(hasil))}</p>
      </div>

      <div class="db-grid">
        <div class="kotak">
          <h3>Trend (MTF)</h3>
          <table class="hasil">${tfRows}</table>
        </div>
        <div class="kotak">
          <h3>Kekuatan Mata Wang</h3>
          ${barKekuatan || '<p class="nota">Tiada data kekuatan.</p>'}
        </div>
        <div class="kotak">
          <h3>Momentum & Volatiliti (1J)</h3>
          <table class="hasil">
            <tr><td>RSI(14)</td><td class="${rsiKelas}">${ind1h && ind1h.rsi != null ? ind1h.rsi.toFixed(1) : "—"}</td></tr>
            <tr><td>MACD hist</td><td class="${macdKelas}">${ind1h ? num(ind1h.macdHist) : "—"}</td></tr>
            <tr><td>ADX(14)</td><td>${ind1h && ind1h.adx != null ? ind1h.adx.toFixed(1) : "—"}</td></tr>
            <tr><td>ATR(14)</td><td>${ind1h ? num(ind1h.atr, cariPair(p.id).digit) : "—"}</td></tr>
          </table>
        </div>
        <div class="kotak">
          <h3>Sesi & Berita</h3>
          <table class="hasil">
            <tr><td>Kecairan sesi</td><td>${escapeHtml(statusSesi.label || statusSesi.tahap)}</td></tr>
            <tr><td>Berita</td><td>${escapeHtml(beritaTeks)}</td></tr>
          </table>
        </div>
        <div class="kotak">
          <h3>Smart Money <span class="nota">(heuristik)</span></h3>
          <table class="hasil">${smcRows}</table>
        </div>
      </div>

      <div class="kotak" id="db-backtest">
        <h3>Backtest tetingkap-pendek (1J)</h3>
        <p class="nota">Main semula enjin skor atas ~${candles1h ? candles1h.length : 0} lilin 1J yang dimuat (≈ ${candles1h ? Math.round(candles1h.length / 24) : 0} hari). Ini <b>semakan pantas</b>, bukan backtest sejarah penuh.</p>
        <button class="btn-kecil" id="jalan-backtest">▶ Jalankan backtest</button>
        <div id="db-bt-hasil"></div>
      </div>`;

    const btBtn = isiEl.querySelector("#jalan-backtest");
    if (btBtn) btBtn.addEventListener("click", jalanBacktest);
  }

  function jalanBacktest() {
    const out = isiEl.querySelector("#db-bt-hasil");
    if (!candles1h || candles1h.length < 60) {
      out.innerHTML = `<p class="nota">⚠️ Data 1J tak cukup untuk backtest.</p>`;
      return;
    }
    // skorFn satu-TF: guna indikator + SMC + sesi dari cap masa lilin. Berita tak diketahui
    // secara sejarah → dianggap tiada. Ambang direndahkan (60) kerana hanya 1 TF.
    const skorFn = (win) => {
      const now = new Date(win[win.length - 1].t);
      const h = skorSetup({
        pairId: p.id,
        ind1h: ringkasanIndikator(win),
        smc: analisaSMC(win),
        statusSesi: statusMasaOrder(now),
        berita: { ada: false },
        pasaranTutup: pasaranTutup(now),
      });
      return { verdict: h.verdict, skor: h.skor };
    };
    const trades = backtest(candles1h, { skorFn, pairId: p.id, threshold: 60, mula: 200 });
    const r = ringkasan(trades);
    if (!trades.length) {
      out.innerHTML = `<p class="nota">Tiada isyarat BUY/SELL cukup kuat (ambang 60) dalam tetingkap ini.</p>`;
      return;
    }
    out.innerHTML = `
      <table class="hasil">
        <tr><td>Dagangan</td><td>${r.ditutup}</td></tr>
        <tr><td>Menang / Kalah</td><td>${r.menang} / ${r.kalah}</td></tr>
        <tr><td>Kadar menang</td><td>${r.kadarMenang}%</td></tr>
        <tr><td>Expectancy (R)</td><td class="${r.expectancyR > 0 ? "verdict-buy" : "verdict-sell"}">${r.expectancyR != null ? r.expectancyR.toFixed(2) : "—"}</td></tr>
        <tr><td>Profit factor</td><td>${r.profitFactor === Infinity ? "∞" : r.profitFactor != null ? r.profitFactor.toFixed(2) : "—"}</td></tr>
      </table>
      <p class="nota">Sampel kecil — jangan terlalu bergantung. Simulasi entri pada tutup lilin, SL/TP ikut ATR.</p>`;
  }

  // Auto-muat jika kunci ada; jika tidak, tunjuk panduan.
  if (adaKunciApi()) muat();
  else statusEl.innerHTML = `Tekan <b>Muat data</b> selepas set kunci API di <a href="#calc">Kalkulator → ⚙️</a>.`; // prettier-ignore
}
