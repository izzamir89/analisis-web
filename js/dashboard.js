// Skrin Dashboard "AI Score v3" — gabung data pasaran sebenar + indikator + SMC
// + paras S/R + corak lilin + berita jadi SATU KEPUTUSAN, bukan sekadar paparan.
//
// Enjin di sebelah dalam ialah peraturan deterministik (scoring.js), bukan AI/ML.
// Fetch dicetus pengguna supaya kuota API dikawal. Degradasi anggun bila data tiada.

import { PAIRS, cariPair } from "./pairs.js";
import { ambilOHLC, adaKunciApi, statusKuota } from "./marketdata.js";
import { ringkasanIndikator, kekuatanMataWang, atr as kiraAtr } from "./indicators.js";
import { analisaSMC } from "./smc.js";
import { arasSR, zonSupplyDemand } from "./aras.js";
import { skorSetup, jelaskan } from "./scoring.js";
import { backtestAsync } from "./backtest.js";
import { kumpulJalur, simpanSnapshot, bacaJalur } from "./kebarangkalian.js";
import { siriPadaMasa, TEMPOH_4J, TEMPOH_HARI } from "./mtf.js";
import { kiraDagangan } from "./calculator.js";
import { ringkasan } from "./analytics.js";
import { statusMasaOrder, pasaranTutup } from "./sessions.js";
import { jarakAcara } from "./news.js";
import { escapeHtml } from "./store.js";

const KELAS_VERDICT = {
  BUY: "verdict-buy",
  SELL: "verdict-sell",
  WAIT: "verdict-wait",
  "NO TRADE": "verdict-notrade",
};
const BINTANG = { "A+": "⭐⭐⭐⭐⭐", A: "⭐⭐⭐⭐", B: "⭐⭐⭐", C: "⭐⭐", D: "⭐" };
const SPINNER = '<span class="spinner" aria-hidden="true"></span>';
const IKON_STATUS = { ok: "✅", amaran: "⚠️", gagal: "❌" };

// Twelve Data mengenakan kos kredit yang SAMA tanpa mengira outputsize, jadi kita
// ambil sejarah yang mencukupi untuk backtest bermakna.
// 4J & Harian mesti meliputi julat masa 1J DITAMBAH ~260 lilin pemanasan EMA200,
// jika tidak bar backtest awal akan kehilangan data TF-tinggi dan digate keluar.
//   1J 5000  ≈ 208 hari
//   4J 2000  ≈ 333 hari  ✅ meliputi julat 1J + pemanasan
//   D  1000  ≈ 1000 hari ✅
const SAIZ = { 60: 5000, 240: 2000, D: 1000 };

// % perubahan harian dari lilin (tutup terakhir vs sebelum).
function perubahanHarian(candles) {
  if (!candles || candles.length < 2) return null;
  const a = candles[candles.length - 2].c;
  const b = candles[candles.length - 1].c;
  return a ? ((b - a) / a) * 100 : null;
}

// Arah trend satu TF untuk paparan (label manusia + kelas warna).
function labelTrend(ind) {
  if (!ind || ind.harga == null || ind.ema200 == null) return { teks: "—", kelas: "" };
  const naik = ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200 && ind.harga > ind.ema200;
  const turun = ind.ema20 < ind.ema50 && ind.ema50 < ind.ema200 && ind.harga < ind.ema200;
  if (naik) return { teks: "BULLISH", kelas: "verdict-buy" };
  if (turun) return { teks: "BEARISH", kelas: "verdict-sell" };
  return { teks: "Neutral", kelas: "verdict-wait" };
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
    aras: null,
    zon: null,
    kekuatan: null,
    candles1h: null,
    candles4h: null,
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
      ambilOHLC(p.id, "60", { outputsize: SAIZ["60"] }),
      ambilOHLC(p.id, "240", { outputsize: SAIZ["240"] }),
      ambilOHLC(p.id, "D", { outputsize: SAIZ.D }),
    ]);
    st.candles1h = r1.candles || null;
    st.candles4h = r4.candles || null;
    st.candlesD = rd.candles || null;
    st.ind1h = r1.candles ? ringkasanIndikator(r1.candles) : null;
    st.ind4h = r4.candles ? ringkasanIndikator(r4.candles) : null;
    st.indD = rd.candles ? ringkasanIndikator(rd.candles) : null;
    st.smc = r1.candles ? analisaSMC(r1.candles) : null;

    // Paras & zon dikira dari 1J menggunakan ATR 1J sebagai skala toleransi.
    const atrNilai = st.ind1h ? st.ind1h.atr : null;
    st.aras = r1.candles && atrNilai ? arasSR(r1.candles, atrNilai) : null;
    st.zon = r1.candles && atrNilai ? zonSupplyDemand(r1.candles, atrNilai) : null;

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
    statusEl.textContent = `Sumber: ${r1.sumber} · ${st.candles1h.length} lilin 1J.`;
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
    const berita = jarakAcara(now);
    const hasil = skorSetup({
      pairId: p.id,
      ind1h: st.ind1h,
      ind4h: st.ind4h,
      indD: st.indD,
      candles1h: st.candles1h,
      kekuatan: st.kekuatan,
      smc: st.smc,
      aras: st.aras,
      zon: st.zon,
      statusSesi,
      berita,
      pasaranTutup: pasaranTutup(now),
    });
    lukis(hasil, statusSesi, berita);
  }

  // --- Bahagian render ---

  function htmlKeputusan(hasil) {
    const kelasV = KELAS_VERDICT[hasil.verdict] || "";
    const prob = bacaJalur(hasil.skor);
    const probHtml = prob.cukup
      ? `<div class="db-prob"><b>Kadar menang sejarah: ${(prob.kadar * 100).toFixed(0)}%</b>
           <span class="db-prob-selang">jalur ${prob.nama} · ${prob.n} dagangan · selang ${(prob.bawah * 100).toFixed(0)}–${(prob.atas * 100).toFixed(0)}%</span></div>`
      : `<div class="db-prob db-prob-kurang">Kebarangkalian: <b>data tidak mencukupi</b>
           <span class="db-prob-selang">${prob.nama ? `jalur ${prob.nama} · ` : ""}${prob.n}/${prob.min} dagangan direkod — jalankan backtest untuk kumpul</span></div>`;

    const gateHtml = hasil.gate.lulus
      ? ""
      : `<ul class="db-gate">${hasil.gate.sebab.map((s) => `<li>⛔ ${escapeHtml(s)}</li>`).join("")}</ul>`;

    return `<div class="kotak db-confidence ${kelasV}">
        <div class="db-conf-atas">
          <div>
            <div class="db-verdict">${hasil.verdict} ${hasil.skor}%</div>
            <div class="db-gred">${BINTANG[hasil.gred] || ""} Gred ${hasil.gred} · arah ${hasil.arah}</div>
          </div>
        </div>
        ${gateHtml}
        ${probHtml}
        <p class="db-jelas">${escapeHtml(jelaskan(hasil))}</p>
      </div>`;
  }

  // Pelan dagangan — guna semula kiraDagangan() supaya matematik pip/lot hanya
  // wujud di satu tempat (calculator.js), bukan diduakan di sini.
  function htmlPelan(hasil) {
    if (!st.ind1h || !(st.ind1h.atr > 0) || !(st.ind1h.harga > 0)) return "";
    if (hasil.verdict === "NO TRADE") {
      return `<div class="kotak db-pelan db-pelan-mati">
        <h3>Pelan Dagangan</h3>
        <p class="nota">Tiada pelan — gate keselamatan aktif. Betulkan sebab di atas dahulu.</p>
      </div>`;
    }
    const d = kiraDagangan({
      pairId: p.id,
      arah: hasil.arah,
      entry: st.ind1h.harga,
      atr: st.ind1h.atr,
    });
    if (d.ralat) return "";
    const dgt = p.digit;
    const params = new URLSearchParams({
      pair: p.id,
      arah: hasil.arah,
      entry: String(st.ind1h.harga),
      atr: String(st.ind1h.atr),
    });
    const tentatif = hasil.verdict === "WAIT" ? ` <span class="db-tentatif">(tentatif — verdict WAIT)</span>` : ""; // prettier-ignore
    return `<div class="kotak db-pelan">
        <h3>Pelan Dagangan${tentatif}</h3>
        <div class="db-pelan-grid">
          <div class="db-pelan-baris"><span>Entry</span><b>${d.entry.toFixed(dgt)}</b></div>
          <div class="db-pelan-baris db-sl"><span>Stop Loss</span><b>${d.sl.toFixed(dgt)}</b><i>${d.slPip} pip</i></div>
          <div class="db-pelan-baris db-tp"><span>TP1 · 1:${d.rr}</span><b>${d.tp1.toFixed(dgt)}</b><i>${d.tp1Pip} pip</i></div>
          <div class="db-pelan-baris db-tp"><span>TP2 · 1:${d.rr2}</span><b>${d.tp2.toFixed(dgt)}</b><i>${d.tp2Pip} pip</i></div>
          <div class="db-pelan-baris db-tp"><span>TP3 · 1:${d.rr3}</span><b>${d.tp3.toFixed(dgt)}</b><i>${d.tp3Pip} pip</i></div>
        </div>
        <p class="nota">SL = ATR(14) × 1.5. Saiz lot bergantung baki akaun & risiko % — tetapkan di Kalkulator.</p>
        <a class="btn-kecil" href="#calc?${params.toString()}">Buka di Kalkulator →</a>
      </div>`;
  }

  function htmlSebab(hasil) {
    const baris = hasil.firedRules
      .map(
        (r) =>
          `<li class="sebab-${r.status}"><span class="sebab-ikon">${IKON_STATUS[r.status]}</span>
             <span class="sebab-teks"><b>${escapeHtml(r.label)}</b> — ${escapeHtml(r.sebab)}</span>
             <span class="sebab-markah">${r.markah}/${r.maks}</span></li>`
      )
      .join("");
    const amaran = hasil.amaran
      .map(
        (a) =>
          `<li class="sebab-amaran"><span class="sebab-ikon">⚠️</span>
             <span class="sebab-teks">${escapeHtml(a)}</span><span class="sebab-markah"></span></li>`
      )
      .join("");
    return `<div class="kotak">
        <h3>Sebab</h3>
        <ul class="db-sebab">${baris}${amaran}</ul>
      </div>`;
  }

  function lukis(hasil, statusSesi, berita) {
    const { ind1h, ind4h, indD, smc, kekuatan, aras } = st;
    const tfRows = [
      ["Harian", indD],
      ["4 Jam", ind4h],
      ["1 Jam", ind1h],
    ]
      .map(([lbl, ind]) => {
        const t = labelTrend(ind);
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
    const tk = hasil.tekanan;

    const smcRows = smc
      ? `<tr><td>BOS</td><td class="${smc.bos.arah ? (smc.bos.arah === "bull" ? "verdict-buy" : "verdict-sell") : ""}">${smc.bos.arah ? smc.bos.arah + " ✅" : "—"}</td></tr>
         <tr><td>CHoCH</td><td>${smc.choch.arah ? smc.choch.arah : "—"}</td></tr>
         <tr><td>Order Block</td><td>${smc.ob.length ? smc.ob[0].jenis + " ✅" : "—"}</td></tr>
         <tr><td>Liquidity Grab</td><td>${smc.grab.length ? smc.grab[0].arah + " ✅" : "—"}</td></tr>`
      : `<tr><td colspan="2">Tiada data SMC.</td></tr>`;

    const arasRows = aras
      ? `<tr><td>Rintangan</td><td>${aras.rintangan.length ? `${aras.rintangan[0].harga.toFixed(p.digit)} <i class="nota">(${aras.rintangan[0].sentuhan}×)</i>` : "—"}</td></tr>
         <tr><td>Sokongan</td><td>${aras.sokongan.length ? `${aras.sokongan[0].harga.toFixed(p.digit)} <i class="nota">(${aras.sokongan[0].sentuhan}×)</i>` : "—"}</td></tr>
         <tr><td>Zon</td><td>${hasil.kedudukan && hasil.kedudukan.dalamZon ? escapeHtml(hasil.kedudukan.dalamZon.jenis) : "luar zon"}</td></tr>`
      : `<tr><td colspan="2">Paras belum dikira.</td></tr>`;

    const beritaRows = berita.senarai.length
      ? berita.senarai
          .slice(0, 5)
          .map(
            (a) =>
              `<tr><td>${escapeHtml(a.mataWang || "—")} ${escapeHtml(a.nama)}</td>
                 <td class="${a.bahaya ? "verdict-sell" : ""}">${a.lalu ? `${Math.abs(Math.round(a.minit))} min lalu` : `${Math.round(a.minit)} min lagi`}${a.bahaya ? " ⛔" : ""}</td></tr>`
          )
          .join("")
      : `<tr><td colspan="2">Tiada acara direkod. <a href="#chart/${p.id}">Tambah di skrin Carta →</a></td></tr>`;

    isiEl.innerHTML = `
      ${htmlKeputusan(hasil)}
      ${htmlPelan(hasil)}
      ${htmlSebab(hasil)}

      <div class="db-grid">
        <div class="kotak">
          <h3>Trend (MTF)</h3>
          <table class="hasil">${tfRows}</table>
        </div>
        <div class="kotak">
          <h3>Momentum (1J)</h3>
          <table class="hasil">
            <tr><td>RSI(14)</td><td class="${rsiKelas}">${ind1h && ind1h.rsi != null ? ind1h.rsi.toFixed(1) : "—"}</td></tr>
            <tr><td>MACD hist</td><td class="${macdKelas}">${ind1h ? num(ind1h.macdHist) : "—"}</td></tr>
            <tr><td>ADX(14)</td><td class="${adxKuat ? "adx-kuat" : ""}">${ind1h && ind1h.adx != null ? ind1h.adx.toFixed(1) + (adxKuat ? " ▲" : "") : "—"}</td></tr>
            <tr><td>ATR(14)</td><td>${ind1h ? num(ind1h.atr, p.digit) : "—"}</td></tr>
            <tr><td>Tekanan Pasaran</td><td class="db-tekanan">${tk ? `${Math.round(tk.skorFrac * 100)}% <i class="nota">(${tk.ekspansi.toFixed(1)}× ATR)</i>` : "—"}</td></tr>
          </table>
          <p class="nota">"Tekanan Pasaran" ialah proxy dari julat &amp; badan lilin — <b>bukan volume sebenar</b>. Forex spot tiada volume berpusat.</p>
        </div>
        <div class="kotak">
          <h3>Smart Money <span class="nota">(heuristik)</span></h3>
          <table class="hasil">${smcRows}</table>
        </div>
        <div class="kotak">
          <h3>Paras &amp; Zon</h3>
          <table class="hasil">${arasRows}</table>
        </div>
        <div class="kotak">
          <h3>Corak Lilin (1J)</h3>
          <table class="hasil">
            <tr><td>Corak</td><td class="db-corak">${hasil.corak ? escapeHtml(hasil.corak.nama) : "—"}</td></tr>
            <tr><td>Arah</td><td class="${hasil.corak ? (hasil.corak.arah === "bull" ? "verdict-buy" : "verdict-sell") : ""}">${hasil.corak ? hasil.corak.arah : "—"}</td></tr>
          </table>
        </div>
        <div class="kotak">
          <h3>Kekuatan Mata Wang</h3>
          ${barKekuatan}
        </div>
        <div class="kotak">
          <h3>Sesi &amp; Berita</h3>
          <table class="hasil">
            <tr><td>Kecairan sesi</td><td>${escapeHtml(statusSesi.label || statusSesi.tahap)}</td></tr>
            ${beritaRows}
          </table>
        </div>
      </div>

      <div class="kotak" id="db-backtest">
        <h3>Backtest (1J, enjin v3 penuh)</h3>
        <p class="nota">Main semula enjin yang <b>sama</b> atas ${st.candles1h ? st.candles1h.length : 0} lilin 1J (≈ ${st.candles1h ? Math.round(st.candles1h.length / 24) : 0} hari), dengan 4J &amp; Harian dijana semula dari 1J. Keputusan mengisi jalur kebarangkalian di atas. <b>In-sample</b> — prestasi sejarah, bukan ramalan.</p>
        <button class="btn-kecil" id="jalan-backtest">▶ Jalankan backtest</button>
        <div id="db-bt-hasil"></div>
      </div>`;

    const kkBtn = isiEl.querySelector("#muat-kekuatan");
    if (kkBtn) kkBtn.addEventListener("click", muatKekuatan);
    const btBtn = isiEl.querySelector("#jalan-backtest");
    if (btBtn) btBtn.addEventListener("click", jalanBacktest);
  }

  async function jalanBacktest() {
    const out = isiEl.querySelector("#db-bt-hasil");
    const btn = isiEl.querySelector("#jalan-backtest");
    if (!st.candles1h || st.candles1h.length < 260) {
      out.innerHTML = `<p class="nota">⚠️ Data 1J tak cukup untuk backtest (perlu ≥260 lilin untuk pemanasan EMA200).</p>`;
      return;
    }
    if (!st.candles4h || !st.candlesD) {
      out.innerHTML = `<p class="nota">⚠️ Data 4J / Harian tiada — backtest memerlukan ketiga-tiga timeframe untuk menguji gate MTF yang sama seperti dagangan langsung.</p>`;
      return;
    }
    btn.disabled = true;
    out.innerHTML = `<p class="nota">${SPINNER} Mengira… <span id="bt-maju">0%</span></p>`;
    const majuEl = out.querySelector("#bt-maju");

    // skorFn v3 PENUH — enjin yang SAMA seperti dagangan langsung, termasuk gate MTF.
    // Siri 4J & Harian dibina oleh mtf.js: lilin lengkap sebenar sebelum tempoh
    // semasa + lilin separa dibina dari 1J sehingga bar ini sahaja. Tiada lookahead.
    // Berita sejarah tidak dapat diketahui → senarai kosong (bias konsisten
    // merentas semua bar, jadi jalur kebarangkalian kekal boleh dibandingkan).
    const skorFn = (win) => {
      const ts = win[win.length - 1].t;
      const now = new Date(ts);
      const s4 = siriPadaMasa(st.candles4h, win, ts, TEMPOH_4J);
      const sD = siriPadaMasa(st.candlesD, win, ts, TEMPOH_HARI);
      const atrSiri = kiraAtr(win, 14);
      const atrNilai = atrSiri ? atrSiri[atrSiri.length - 1] : null;
      const h = skorSetup({
        pairId: p.id,
        ind1h: ringkasanIndikator(win),
        ind4h: s4.length ? ringkasanIndikator(s4) : null,
        indD: sD.length ? ringkasanIndikator(sD) : null,
        candles1h: win,
        smc: analisaSMC(win),
        aras: atrNilai ? arasSR(win, atrNilai) : null,
        zon: atrNilai ? zonSupplyDemand(win, atrNilai) : null,
        statusSesi: statusMasaOrder(now),
        berita: { senarai: [], bahaya: false, amaran: false, seterusnya: null },
        pasaranTutup: pasaranTutup(now),
      });
      return { verdict: h.verdict, skor: h.skor };
    };

    const trades = await backtestAsync(
      st.candles1h,
      { skorFn, pairId: p.id, mula: 260, lookback: 400 },
      (frac) => {
        if (majuEl) majuEl.textContent = `${Math.round(frac * 100)}%`;
      }
    );

    btn.disabled = false;
    const r = ringkasan(trades);
    if (!trades.length) {
      out.innerHTML = `<p class="nota">Tiada isyarat lulus gate + ambang ${70} dalam tetingkap ini. Dengan gate MTF, ini normal untuk pasangan yang bercampur arah.</p>`;
      return;
    }

    // Simpan dikunci pasangan + cap masa lilin terakhir → jalankan semula pada data
    // sama akan MENGGANTIKAN, bukan menggandakan sampel.
    const tsData = st.candles1h[st.candles1h.length - 1].t;
    simpanSnapshot(p.id, tsData, kumpulJalur(trades));

    const jalur = kumpulJalur(trades);
    const jalurRows = Object.entries(jalur)
      .map(
        ([nama, v]) =>
          `<tr><td>Jalur ${nama}</td><td>${v.n ? `${v.menang}/${v.n} (${Math.round((v.menang / v.n) * 100)}%)` : "—"}</td></tr>`
      )
      .join("");

    out.innerHTML = `
      <table class="hasil">
        <tr><td>Dagangan</td><td>${r.ditutup}</td></tr>
        <tr><td>Menang / Kalah</td><td>${r.menang} / ${r.kalah}</td></tr>
        <tr><td>Kadar menang</td><td>${r.kadarMenang}%</td></tr>
        <tr><td>Expectancy (R)</td><td class="${r.expectancyR > 0 ? "verdict-buy" : "verdict-sell"}">${r.expectancyR != null ? r.expectancyR.toFixed(2) : "—"}</td></tr>
        <tr><td>Profit factor</td><td>${r.profitFactor === Infinity ? "∞" : r.profitFactor != null ? r.profitFactor.toFixed(2) : "—"}</td></tr>
        ${jalurRows}
      </table>
      <p class="nota">Simulasi entri pada tutup lilin, SL/TP ikut ATR. Bar yang menyentuh SL &amp; TP dikira kalah (konservatif). Keputusan disimpan ke jalur kebarangkalian.</p>`;

    kiraDanLukis(); // segarkan kad keputusan supaya kebarangkalian terkini muncul
  }

  // Init: papar kuota; auto-muat jika kunci ada, jika tidak beri panduan.
  lukisKuota();
  if (adaKunciApi()) muat();
  else statusEl.innerHTML = `Tekan <b>Muat data</b> selepas set kunci API di <a href="#calc">Kalkulator → ⚙️</a>.`; // prettier-ignore
}
