// Skrin Dashboard — gabung data pasaran sebenar + indikator + kekuatan + SMC + sesi
// + berita jadi satu skor (enjin peraturan deterministik). Fetch dicetus pengguna
// supaya kuota API dikawal: "Muat data" ambil hanya 3 TF pasangan semasa (≈3 kredit);
// kekuatan mata wang (7 pasangan lagi) ialah butang berasingan supaya pengguna kawal
// kredit. Degradasi anggun bila data tiada.

import { PAIRS, cariPair } from "./pairs.js";
import { ambilOHLC, adaKunciApi, statusKuota } from "./marketdata.js";
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
const SPINNER = '<span class="spinner" aria-hidden="true"></span>';

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
  try {
    localStorage.setItem("db_pair", p.id); // ingat pasangan terakhir dilihat
  } catch {
    /* abai */
  }

  host.innerHTML = `
    <div class="db-bar">
      <select id="pilih-pair" class="db-pair">${PAIRS.map(
        (x) => `<option value="${x.id}" ${x.id === p.id ? "selected" : ""}>${x.id}</option>`
      ).join("")}</select>
      <button class="btn-utama btn-muat" id="muat-data">⤓ Muat data</button>
    </div>
    <p class="nota">Skor deterministik (enjin peraturan, <b>bukan AI/ML</b>) dari data pasaran sebenar. "Muat data" ambil ~3 kredit; kekuatan mata wang butang berasingan. Nilai mungkin beza sedikit dari broker.</p>
    <div id="db-kuota" class="db-kuota"></div>
    <div id="db-status" class="nota"></div>
    <div id="db-isi"></div>`;

  const statusEl = host.querySelector("#db-status");
  const isiEl = host.querySelector("#db-isi");
  const kuotaEl = host.querySelector("#db-kuota");

  // Keadaan dashboard semasa — dikongsi antara muat / kekuatan / lukis.
  const st = {
    ind1h: null,
    ind4h: null,
    indD: null,
    smc: null,
    kekuatan: null,
    candles1h: null,
    candlesD: null,
    dimuat: false,
  };

  host.querySelector("#pilih-pair").addEventListener("change", (e) => {
    location.hash = `#dashboard/${e.target.value}`;
  });
  host.querySelector("#muat-data").addEventListener("click", muat);

  function lukisKuota() {
    const q = statusKuota();
    kuotaEl.textContent = `Kuota API — minit ${q.minitBaki}/${q.minitHad} · hari ${q.hariDigunakan}/${q.hariHad}`;
  }

  // Ambil 3 TF pasangan semasa (murah). Kekuatan diambil berasingan.
  async function muat() {
    if (!adaKunciApi()) {
      isiEl.innerHTML = "";
      statusEl.innerHTML = `⚠️ Tiada kunci API. Buka <a href="#calc">Kalkulator → ⚙️ Kunci API</a> untuk kunci Twelve Data percuma.`;
      return;
    }
    const btn = host.querySelector("#muat-data");
    btn.disabled = true;
    statusEl.innerHTML = `${SPINNER} Mengambil OHLC (1J, 4J, Harian)…`;

    const [r1, r4, rd] = await Promise.all([
      ambilOHLC(p.id, "60"),
      ambilOHLC(p.id, "240"),
      ambilOHLC(p.id, "D"),
    ]);
    st.candles1h = r1.candles || null;
    st.candlesD = rd.candles || null;
    st.ind1h = r1.candles ? ringkasanIndikator(r1.candles) : null;
    st.ind4h = r4.candles ? ringkasanIndikator(r4.candles) : null;
    st.indD = rd.candles ? ringkasanIndikator(rd.candles) : null;
    st.smc = r1.candles ? analisaSMC(r1.candles) : null;
    st.kekuatan = null; // pasangan berubah → kekuatan perlu dikira semula
    st.dimuat = true;

    lukisKuota();
    btn.disabled = false;

    if (!st.ind1h) {
      statusEl.textContent = "";
      isiEl.innerHTML = `<div class="kotak db-kosong">
        <b>⚠️ Data tidak tersedia</b>
        <p class="nota">${escapeHtml(r1.ralat || "Gagal ambil data 1J.")} Semak kunci API / kuota, atau cuba sebentar lagi. Emas & sesetengah pasangan mungkin liputan berbeza di tier percuma.</p>
      </div>`;
      return;
    }
    statusEl.textContent = `Sumber: ${r1.sumber}.`;
    kiraDanLukis();
  }

  // Kira kekuatan mata wang — 7 pasangan lagi (opt-in, ≈7 kredit, cache 6 jam).
  async function muatKekuatan() {
    const btn = isiEl.querySelector("#muat-kekuatan");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `${SPINNER} Mengira…`;
    }
    const perubahan = {};
    for (const pr of PAIRS) {
      const rr =
        pr.id === p.id && st.candlesD
          ? { candles: st.candlesD }
          : await ambilOHLC(pr.id, "D", { outputsize: 30 });
      const ch = perubahanHarian(rr.candles);
      if (ch != null) perubahan[pr.id] = ch;
    }
    st.kekuatan = kekuatanMataWang(perubahan);
    lukisKuota();
    kiraDanLukis();
  }

  // Kira skor dari keadaan semasa (sesi/berita segar) & lukis semua panel.
  function kiraDanLukis() {
    const now = new Date();
    const statusSesi = statusMasaOrder(now);
    const berita = jarakBerita(now);
    const hasil = skorSetup({
      pairId: p.id,
      ind1h: st.ind1h,
      ind4h: st.ind4h,
      indD: st.indD,
      kekuatan: st.kekuatan,
      smc: st.smc,
      statusSesi,
      berita,
      pasaranTutup: pasaranTutup(now),
    });
    lukis(hasil, statusSesi, berita);
  }

  function lukis(hasil, statusSesi, berita) {
    const { ind1h, ind4h, indD, smc, kekuatan } = st;
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

    const barKekuatan = kekuatan
      ? Object.entries(kekuatan)
          .sort((a, b) => b[1] - a[1])
          .map(
            ([mw, v]) =>
              `<div class="kk-baris"><span class="kk-mw">${escapeHtml(mw)}</span>
                 <span class="kk-bar"><span class="kk-isi" style="width:${v * 10}%"></span></span>
                 <span class="kk-nilai">${v}</span></div>`
          )
          .join("")
      : `<p class="nota">Belum dikira — jimat kredit.</p>
         <button class="btn-kecil" id="muat-kekuatan">⤓ Kira kekuatan (≈7 kredit)</button>`;

    const rsiKelas = ind1h && ind1h.rsi != null ? (ind1h.rsi >= 70 ? "verdict-sell" : ind1h.rsi <= 30 ? "verdict-buy" : "") : ""; // prettier-ignore
    const macdKelas = ind1h && ind1h.macdHist != null ? (ind1h.macdHist > 0 ? "verdict-buy" : "verdict-sell") : ""; // prettier-ignore
    const adxKuat = ind1h && ind1h.adx != null && ind1h.adx >= 25;

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
          ${barKekuatan}
        </div>
        <div class="kotak">
          <h3>Momentum & Volatiliti (1J)</h3>
          <table class="hasil">
            <tr><td>RSI(14)</td><td class="${rsiKelas}">${ind1h && ind1h.rsi != null ? ind1h.rsi.toFixed(1) : "—"}</td></tr>
            <tr><td>MACD hist</td><td class="${macdKelas}">${ind1h ? num(ind1h.macdHist) : "—"}</td></tr>
            <tr><td>ADX(14)</td><td class="${adxKuat ? "adx-kuat" : ""}">${ind1h && ind1h.adx != null ? ind1h.adx.toFixed(1) + (adxKuat ? " ▲" : "") : "—"}</td></tr>
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
        <p class="nota">Main semula enjin skor atas ~${st.candles1h ? st.candles1h.length : 0} lilin 1J (≈ ${st.candles1h ? Math.round(st.candles1h.length / 24) : 0} hari). <b>Semakan pantas</b>, bukan backtest sejarah penuh.</p>
        <button class="btn-kecil" id="jalan-backtest">▶ Jalankan backtest</button>
        <div id="db-bt-hasil"></div>
      </div>`;

    const kkBtn = isiEl.querySelector("#muat-kekuatan");
    if (kkBtn) kkBtn.addEventListener("click", muatKekuatan);
    const btBtn = isiEl.querySelector("#jalan-backtest");
    if (btBtn) btBtn.addEventListener("click", jalanBacktest);
  }

  function jalanBacktest() {
    const out = isiEl.querySelector("#db-bt-hasil");
    if (!st.candles1h || st.candles1h.length < 60) {
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
    const trades = backtest(st.candles1h, { skorFn, pairId: p.id, threshold: 60, mula: 200 });
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

  // Init: papar kuota; auto-muat jika kunci ada, jika tidak beri panduan.
  lukisKuota();
  if (adaKunciApi()) muat();
  else statusEl.innerHTML = `Tekan <b>Muat data</b> selepas set kunci API di <a href="#calc">Kalkulator → ⚙️</a>.`; // prettier-ignore
}
