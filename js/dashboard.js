// Skrin Dashboard "AI Score v3" — gabung data pasaran sebenar + indikator + SMC
// + paras S/R + corak lilin + berita jadi SATU KEPUTUSAN, bukan sekadar paparan.
//
// Enjin di sebelah dalam ialah peraturan deterministik (scoring.js), bukan AI/ML.
// Fetch dicetus pengguna supaya kuota API dikawal. Degradasi anggun bila data tiada.

import { PAIRS, cariPair } from "./pairs.js";
import { ambilOHLC, adaKunciApi, statusKuota } from "./marketdata.js";
import { ringkasanIndikator, kekuatanMataWang, atr as kiraAtr, atrMedian } from "./indicators.js";
import { analisaSMC } from "./smc.js";
import { arasSR, zonSupplyDemand } from "./aras.js";
import { skorSetupTerbaik, jelaskan } from "./scoring.js";
import { backtestAsync } from "./backtest.js";
import { kumpulJalur, simpanSnapshot, bacaJalur } from "./kebarangkalian.js";
import { siriPadaMasa, tempohDariInterval } from "./mtf.js";
import { ambilMod } from "./mod.js";
import { kiraDagangan } from "./calculator.js";
import { ringkasan, kalahBerturutHariIni } from "./analytics.js";
import { statusMasaOrder, pasaranTutup } from "./sessions.js";
import { jarakAcara } from "./news.js";
import { escapeHtml, bacaJSON } from "./store.js";
import { bacaKos, kosPip, nilaiKos } from "./kos.js";
import { rekod as rekodVerdict, selesaikan as selesaikanVerdict } from "./verdictlog.js";
import { walkForward, penilaian, MIN_DAGANGAN } from "./walkforward.js";
import { bakiRisikoHarian } from "./risk.js";
import { baca as bacaJurnal } from "./journal.js";

const KELAS_VERDICT = {
  BUY: "verdict-buy",
  SELL: "verdict-sell",
  WAIT: "verdict-wait",
  "NO TRADE": "verdict-notrade",
};
const BINTANG = { "A+": "⭐⭐⭐⭐⭐", A: "⭐⭐⭐⭐", B: "⭐⭐⭐", C: "⭐⭐", D: "⭐" };
const SPINNER = '<span class="spinner" aria-hidden="true"></span>';
const IKON_STATUS = { ok: "✅", amaran: "⚠️", gagal: "❌" };

// Saiz muatan setiap timeframe — tetapan konservatif.
//
// KEKANGAN YANG TIDAK BOLEH DILANGGAR: 4J & Harian mesti meliputi julat masa 1J
// DITAMBAH ~260 lilin pemanasan EMA200. Jika tidak, bar backtest awal kehilangan
// data TF-tinggi, gate "data tidak lengkap" menyala pada setiap bar, dan backtest
// menghasilkan SIFAR dagangan (pepijat sebenar yang pernah berlaku — lihat mtf.js).
//
//   1J 1500 ≈ 62 hari
//   4J  750 ≈ 125 hari  — perlu 62 + 33 (260 lilin) = 95 hari  ✅
//   D   400 ≈ 400 hari  — perlu 62 + 260           = 322 hari  ✅
//
// Untuk sampel backtest lebih besar (jalur kebarangkalian matang lebih cepat),
// naikkan berkadar: 1J 5000 / 4J 2000 / D 1000 masih memenuhi kekangan di atas.
// Semak baris kuota selepas "Muat data" sebelum menaikkannya.
//
// Saiz muatan kini per-mod dalam js/mod.js (mod.saiz.lo/mid/hi) supaya mod scalp
// (M5/M15/H1) boleh guna nilai sendiri yang memenuhi kekangan liputan yang sama.

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

// Bilangan lilin sehari untuk satu interval dalaman — untuk anggaran "≈ N hari".
function lilinSehari(interval) {
  if (interval === "D") return 1;
  return 1440 / Number(interval); // 1440 minit/hari ÷ minit selilin (60→24, 5→288)
}

export function renderDashboard(host, pairId, modId = "swing") {
  const mod = ambilMod(modId);
  const p = cariPair(pairId);
  try {
    localStorage.setItem(mod.ingatKunci, p.id); // ingat pasangan terakhir dilihat (per-mod)
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
    ${
      mod.id === "scalp"
        ? `<p class="nota db-nota-scalp">⚡ <b>Scalping (${mod.tfLabel.lo}/${mod.tfLabel.mid}/${mod.tfLabel.hi})</b> — analisis atas-permintaan (tier percuma tak boleh live-refresh); spread/komisen <b>tidak dimodelkan</b>; kadar-menang in-sample &amp; optimistik. Sokongan keputusan, bukan isyarat auto.</p>`
        : ""
    }
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
    location.hash = `#${mod.rute}/${e.target.value}`;
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
    statusEl.innerHTML = `${SPINNER} Mengambil OHLC (${mod.tfLabel.lo}, ${mod.tfLabel.mid}, ${mod.tfLabel.hi})…`;

    const [r1, r4, rd] = await Promise.all([
      ambilOHLC(p.id, mod.tf.lo, { outputsize: mod.saiz.lo }),
      ambilOHLC(p.id, mod.tf.mid, { outputsize: mod.saiz.mid }),
      ambilOHLC(p.id, mod.tf.hi, { outputsize: mod.saiz.hi }),
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
        <p class="nota">${escapeHtml(r1.ralat || `Gagal ambil data ${mod.tfLabel.lo}.`)} Semak kunci API / kuota, atau cuba sebentar lagi. Emas & sesetengah pasangan mungkin liputan berbeza di tier percuma.</p>
      </div>`;
      return;
    }
    statusEl.textContent = `Sumber: ${r1.sumber} · ${st.candles1h.length} lilin ${mod.tfLabel.lo}.`;
    kiraDanLukis();
  }

  // Kira kekuatan mata wang — 7 pasangan lagi (opt-in, ≈7 kredit, cache 6 jam).
  async function muatKekuatan() {
    const btn = isiEl.querySelector("#muat-kekuatan");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `${SPINNER} Mengira 1/${PAIRS.length}…`;
    }
    const perubahan = {};
    let hilang = 0;
    // Kekuatan mata wang guna % perubahan HARIAN. Guna semula candles pasangan semasa
    // hanya jika slot-hi mod ialah Harian (swing); dalam mod scalp st.candlesD memegang
    // H1, jadi ambil "D" sebenar supaya % kekal harian, bukan setiap jam.
    //
    // ambilOHLC() kini tunggu-&-cuba-semula sendiri bila kuota-seminit ketat (≤ ~60s
    // setiap kali), supaya "Kira kekuatan" tak kehilangan sebahagian pasangan hanya
    // sebab ia dipanggil sejurus lepas "Muat data" guna kuota dalam minit yang sama.
    let i = 0;
    for (const pr of PAIRS) {
      i++;
      if (btn) btn.innerHTML = `${SPINNER} Mengira ${i}/${PAIRS.length}…`;
      const rr =
        pr.id === p.id && mod.tf.hi === "D" && st.candlesD
          ? { candles: st.candlesD }
          : await ambilOHLC(pr.id, "D", { outputsize: 30 });
      const ch = perubahanHarian(rr.candles);
      if (ch != null) perubahan[pr.id] = ch;
      else hilang++;
      lukisKuota();
    }
    st.kekuatan = kekuatanMataWang(perubahan);
    if (hilang > 0 && statusEl) {
      statusEl.innerHTML += `<div class="nota">⚠️ Kekuatan mata wang: ${hilang}/${PAIRS.length} pasangan gagal ambil data (kuota/rangkaian) — anggaran mungkin tidak lengkap.</div>`;
    }
    kiraDanLukis();
  }

  // Penilaian kos untuk setup semasa. Jarak SL mengikut mod (ATR × pengganda),
  // ditukar ke pip supaya boleh dibandingkan dengan spread broker.
  function nilaiKosSemasa(now = new Date()) {
    const atrNilai = st.ind1h ? st.ind1h.atr : null;
    if (!(atrNilai > 0)) return null;
    const slPip = (atrNilai * mod.kalk.pengganda) / p.pip;
    return nilaiKos({ pairId: p.id, slPip, rr: mod.kalk.rr, now });
  }

  // Kira skor dari keadaan semasa (sesi/berita segar) & lukis semua panel.
  function kiraDanLukis() {
    const now = new Date();
    const statusSesi = statusMasaOrder(now);
    const berita = jarakAcara(now);
    const jurnal = bacaJurnal();
    const had = Number(bacaJSON("risk_daily_limit", 0)) || 0;
    // skorSetupTerbaik menilai KEDUA-DUA arah dan memilih yang terbaik, bukan hanya
    // arah yang diteka. Pullback di mana tekaan bercanggah dengan susunan EMA dulu
    // menghasilkan NO TRADE walaupun arah bertentangan ialah setup yang bersih.
    const hasil = skorSetupTerbaik({
      kos: nilaiKosSemasa(now),
      risikoHarian: had > 0 ? bakiRisikoHarian(jurnal, now, had) : null,
      kalahBerturut: kalahBerturutHariIni(jurnal, now),
      slPengganda: mod.kalk.pengganda,
      atrMedian: st.candles1h ? atrMedian(st.candles1h, 14, 100) : null,
      pairId: p.id,
      ind1h: st.ind1h,
      ind4h: st.ind4h,
      indD: st.indD,
      candles1h: st.candles1h,
      kekuatan: st.kekuatan,
      smc: st.smc,
      aras: st.aras,
      zon: st.zon,
      tfLabel: mod.tfLabel,
      bobotTrend: mod.bobotTrend,
      ambangMasuk: mod.ambangMasuk,
      atrMelonjak: mod.atrMelonjak,
      statusSesi,
      berita,
      pasaranTutup: pasaranTutup(now),
    });

    // Log keputusan boleh-dagang, dan selesaikan yang lama terhadap lilin segar.
    // Berlaku SEBELUM render supaya panel prestasi menunjukkan kiraan terkini.
    if (st.candles1h && st.candles1h.length) {
      selesaikanVerdict(mod.id, p.id, st.candles1h);
      const akhir = st.candles1h[st.candles1h.length - 1];
      rekodVerdict({
        modId: mod.id,
        pairId: p.id,
        verdict: hasil.verdict,
        skor: hasil.skor,
        skorTerasNorm: hasil.skorTerasNorm,
        arah: hasil.arah,
        harga: st.ind1h ? st.ind1h.harga : null,
        atr: st.ind1h ? st.ind1h.atr : null,
        slMult: mod.kalk.pengganda,
        rr: mod.kalk.rr,
        kosHarga: kosPip(p.id, bacaKos()) * p.pip,
        tsLilin: typeof akhir.t === "number" ? akhir.t : Date.parse(akhir.t),
      });
    }

    lukis(hasil, statusSesi, berita);
  }

  // --- Bahagian render ---

  function htmlKeputusan(hasil) {
    const kelasV = KELAS_VERDICT[hasil.verdict] || "";
    // Jalur dibaca atas skor TERAS dan ditapis mengikut MOD — jalur swing dan scalp
    // tidak lagi berkongsi kolam yang sama.
    const prob = bacaJalur(hasil.skorTerasNorm, mod.id);
    // "kolam", bukan "dari": senarai ini ialah pasangan yang menyumbang kepada agregat
    // MOD ini, bukan semestinya kepada jalur khusus ini. Menamakannya "dari" akan
    // menyiratkan ketepatan yang data ini tidak ada.
    const asal =
      prob.pasangan && prob.pasangan.length ? ` · kolam: ${prob.pasangan.join(", ")}` : "";
    const probHtml = prob.cukup
      ? `<div class="db-prob"><b>Kadar menang sejarah: ${(prob.kadar * 100).toFixed(0)}%</b>
           <span class="db-prob-selang">jalur teras ${prob.nama} · mod ${mod.label} · ${prob.n} dagangan${asal} · selang ${(prob.bawah * 100).toFixed(0)}–${(prob.atas * 100).toFixed(0)}% · <b>in-sample</b></span></div>`
      : `<div class="db-prob db-prob-kurang">Kebarangkalian: <b>data tidak mencukupi</b>
           <span class="db-prob-selang">${prob.nama ? `jalur teras ${prob.nama} · ` : ""}${prob.n}/${prob.min} dagangan direkod untuk mod ${mod.label} — jalankan backtest untuk kumpul</span></div>`;

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

    // WAIT tidak mendapat pelan. Sebelum ini skrin ini memapar entry/SL/TP penuh
    // berlabel "(tentatif)" beserta pautan ke kalkulator — app berkata jangan masuk
    // sambil menghulurkan segala-galanya yang diperlukan untuk masuk. Sekarang ia
    // memapar SYARAT yang mesti dipenuhi dahulu, jadi "tunggu" ada maksud konkrit.
    if (hasil.verdict === "WAIT") return htmlSyarat(hasil);
    const d = kiraDagangan({
      pairId: p.id,
      arah: hasil.arah,
      entry: st.ind1h.harga,
      atr: st.ind1h.atr,
      pengganda: mod.kalk.pengganda,
      rr: mod.kalk.rr,
    });
    if (d.ralat) return "";
    const dgt = p.digit;
    const params = new URLSearchParams({
      pair: p.id,
      arah: hasil.arah,
      entry: String(st.ind1h.harga),
      atr: String(st.ind1h.atr),
      pengganda: String(mod.kalk.pengganda),
      rr: String(mod.kalk.rr),
    });
    // RR bersih selepas kos — nombor yang awak sebenarnya dagangkan.
    const kos = hasil.kos;
    const kosHtml =
      kos && kos.kosR != null
        ? `<p class="nota db-kos">Kos: ${kos.kosPip.toFixed(1)} pip (${Math.round(kos.kosR * 100)}% daripada risiko) →
             <b>R:R bersih 1:${kos.rrBersih.toFixed(2)}</b>${kos.kadarPulangModal != null ? ` · perlu menang ${Math.round(kos.kadarPulangModal * 100)}% untuk pulang modal` : ""}.
             <a href="#calc">Betulkan spread →</a></p>`
        : "";
    return `<div class="kotak db-pelan">
        <h3>Pelan Dagangan</h3>
        <div class="db-pelan-grid">
          <div class="db-pelan-baris"><span>Entry</span><b>${d.entry.toFixed(dgt)}</b></div>
          <div class="db-pelan-baris db-sl"><span>Stop Loss</span><b>${d.sl.toFixed(dgt)}</b><i>${d.slPip} pip</i></div>
          <div class="db-pelan-baris db-tp"><span>TP1 · 1:${d.rr}</span><b>${d.tp1.toFixed(dgt)}</b><i>${d.tp1Pip} pip</i></div>
          <div class="db-pelan-baris db-tp"><span>TP2 · 1:${d.rr2}</span><b>${d.tp2.toFixed(dgt)}</b><i>${d.tp2Pip} pip</i></div>
          <div class="db-pelan-baris db-tp"><span>TP3 · 1:${d.rr3}</span><b>${d.tp3.toFixed(dgt)}</b><i>${d.tp3Pip} pip</i></div>
        </div>
        <p class="nota">SL = ATR(14) × ${mod.kalk.pengganda}. Saiz lot bergantung baki akaun & risiko % — tetapkan di Kalkulator.</p>
        ${kosHtml}
        <a class="btn-kecil" href="#calc?${params.toString()}">Buka di Kalkulator →</a>
      </div>`;
  }

  // Apa yang mesti BERLAKU sebelum verdict ini boleh jadi BUY/SELL.
  // Menggantikan "pelan tentatif" lama: awak dapat syarat konkrit untuk diperhati,
  // bukan harga masuk yang app sendiri tidak sokong.
  function htmlSyarat(hasil) {
    const dgt = p.digit;
    const syarat = [];

    // Sebab 1: harga tersepit pada paras bertentangan.
    const k = hasil.kedudukan;
    if (k) {
      const hampirLawan = hasil.arah === "Buy" ? k.hampirRintangan : k.hampirSokongan;
      const paras = hasil.arah === "Buy" ? k.rintangan : k.sokongan;
      if (hampirLawan && paras) {
        syarat.push(
          `Harga tutup ${mod.tfLabel.lo} <b>${hasil.arah === "Buy" ? "di atas" : "di bawah"} ${paras.harga.toFixed(dgt)}</b>
           (${paras.sentuhan} sentuhan) — breakout paras bertentangan.`
        );
      }
    }

    // Sebab 2: skor belum sampai ambang. Tunjukkan baldi mana yang paling banyak
    // kehilangan markah, supaya "tunggu" jadi sesuatu yang boleh diperhati.
    const jurang = mod.ambangMasuk - hasil.skor;
    if (jurang > 0) {
      const lemah = [...hasil.firedRules]
        .map((r) => ({ ...r, hilang: r.maks - r.markah }))
        .filter((r) => r.hilang > 0)
        .sort((a, b) => b.hilang - a.hilang)
        .slice(0, 2);
      syarat.push(
        `Skor naik <b>${jurang.toFixed(1)} mata</b> ke ambang ${mod.ambangMasuk} — kekurangan terbesar:
         ${lemah.map((r) => `${escapeHtml(r.label)} (−${r.hilang.toFixed(1)})`).join(", ")}.`
      );
    }

    if (!syarat.length) syarat.push("Tunggu keadaan bertambah baik pada lilin berikutnya.");

    return `<div class="kotak db-pelan db-pelan-tunggu">
        <h3>⏳ Tunggu — syarat untuk aktif</h3>
        <ul class="db-syarat">${syarat.map((s) => `<li>${s}</li>`).join("")}</ul>
        <p class="nota">Tiada harga masuk dipapar semasa WAIT. Kalau setup ini betul-betul bagus, ia akan masih ada selepas syarat dipenuhi.</p>
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
      [mod.tfLabel.hi, indD],
      [mod.tfLabel.mid, ind4h],
      [mod.tfLabel.lo, ind1h],
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
         <button class="btn-kecil" id="muat-kekuatan">⤓ Kira kekuatan (≈7 kredit)</button>
         <p class="nota">Boleh ambil masa sehingga ~1 minit jika kuota seminit ketat (auto-tunggu, bukan macet).</p>`;

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
          <h3>Momentum (${mod.tfLabel.lo})</h3>
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
          <h3>Corak Lilin (${mod.tfLabel.lo})</h3>
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
        <h3>Backtest (${mod.tfLabel.lo}, enjin v3 penuh)</h3>
        <p class="nota">Main semula enjin yang <b>sama</b> atas ${st.candles1h ? st.candles1h.length : 0} lilin ${mod.tfLabel.lo} (≈ ${st.candles1h ? Math.round(st.candles1h.length / lilinSehari(mod.tf.lo)) : 0} hari), dengan ${mod.tfLabel.mid} &amp; ${mod.tfLabel.hi} dijana semula dari ${mod.tfLabel.lo}. Keputusan mengisi jalur kebarangkalian di atas. <b>In-sample</b> — prestasi sejarah, bukan ramalan.</p>
        <button class="btn-kecil" id="jalan-backtest">▶ Jalankan backtest</button>
        <div id="db-bt-hasil"></div>
      </div>

      <div class="kotak" id="db-wf">
        <h3>Walk-forward (luar sampel)</h3>
        <p class="nota">Semua angka backtest di atas ialah <b>in-sample</b> — ambang ditala atas data yang sama yang mengujinya.
          Walk-forward memotong sejarah pada 70%, memilih ambang menggunakan bahagian AWAL sahaja, kemudian melapor prestasi
          atas 30% terakhir yang tidak pernah dilihat semasa pemilihan. Kalau lajur uji runtuh, ambang itu memuatkan bunyi bising.</p>
        <button class="btn-kecil" id="jalan-wf">▶ Jalankan walk-forward (lebih lama)</button>
        <div id="db-wf-hasil"></div>
      </div>`;

    const kkBtn = isiEl.querySelector("#muat-kekuatan");
    if (kkBtn) kkBtn.addEventListener("click", muatKekuatan);
    const btBtn = isiEl.querySelector("#jalan-backtest");
    if (btBtn) btBtn.addEventListener("click", jalanBacktest);
    const wfBtn = isiEl.querySelector("#jalan-wf");
    if (wfBtn) wfBtn.addEventListener("click", jalanWalkForward);
  }

  // Kilang skorFn v3 PENUH — enjin yang SAMA seperti dagangan langsung, termasuk gate
  // MTF. Siri TF-tinggi (mid & hi mengikut mod) dibina oleh mtf.js: lilin lengkap
  // sebenar sebelum tempoh semasa + lilin separa dibina dari TF-entry sehingga bar ini
  // sahaja. Tiada lookahead. Berita sejarah tidak dapat diketahui → senarai kosong
  // (bias konsisten merentas semua bar, jadi jalur kekal boleh dibandingkan).
  //
  // Diparameterkan oleh ambang supaya walk-forward boleh menyapu ambang menggunakan
  // enjin yang SAMA — menapis skor selepas fakta akan menguji perkara berbeza daripada
  // yang app sebenarnya jalankan.
  function buatSkorFn(ambangMasuk) {
    const tempohMid = tempohDariInterval(mod.tf.mid);
    const tempohHi = tempohDariInterval(mod.tf.hi);
    return (win) => {
      const ts = win[win.length - 1].t;
      const now = new Date(ts);
      const s4 = siriPadaMasa(st.candles4h, win, ts, tempohMid);
      const sD = siriPadaMasa(st.candlesD, win, ts, tempohHi);
      const atrSiri = kiraAtr(win, 14);
      const atrNilai = atrSiri ? atrSiri[atrSiri.length - 1] : null;
      // skorSetupTerbaik — sama seperti dagangan langsung. Backtest yang menjalankan
      // enjin berbeza daripada enjin langsung ialah backtest yang bohong.
      const h = skorSetupTerbaik({
        slPengganda: mod.kalk.pengganda,
        atrMedian: atrMedian(win, 14, 100),
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
        tfLabel: mod.tfLabel,
        bobotTrend: mod.bobotTrend,
        ambangMasuk,
        atrMelonjak: mod.atrMelonjak,
      });
      return {
        verdict: h.verdict,
        skor: h.skor,
        skorTeras: h.skorTeras,
        skorTerasNorm: h.skorTerasNorm,
      };
    };
  }

  // Prasyarat data yang dikongsi backtest & walk-forward.
  function semakDataBacktest(out) {
    if (!st.candles1h || st.candles1h.length < 260) {
      out.innerHTML = `<p class="nota">⚠️ Data ${mod.tfLabel.lo} tak cukup (perlu ≥260 lilin untuk pemanasan EMA200).</p>`;
      return false;
    }
    if (!st.candles4h || !st.candlesD) {
      out.innerHTML = `<p class="nota">⚠️ Data ${mod.tfLabel.mid} / ${mod.tfLabel.hi} tiada — perlu ketiga-tiga timeframe untuk menguji gate MTF yang sama seperti dagangan langsung.</p>`;
      return false;
    }
    return true;
  }

  async function jalanWalkForward() {
    const out = isiEl.querySelector("#db-wf-hasil");
    const btn = isiEl.querySelector("#jalan-wf");
    if (!semakDataBacktest(out)) return;
    btn.disabled = true;
    out.innerHTML = `<p class="nota">${SPINNER} Menyapu ambang… <span id="wf-maju">0%</span></p>`;
    const majuEl = out.querySelector("#wf-maju");

    const kosHargaWf = kosPip(p.id, bacaKos()) * p.pip;
    const { tsPisah, jadual, terbaik } = await walkForward(
      st.candles1h,
      {
        pairId: p.id,
        mula: mod.backtest.mula,
        lookback: mod.backtest.lookback,
        slMult: mod.kalk.pengganda,
        rr: mod.kalk.rr,
        kosHarga: kosHargaWf,
      },
      {
        buatSkorFn,
        onKemajuan: (frac) => {
          if (majuEl) majuEl.textContent = `${Math.round(frac * 100)}%`;
        },
      }
    );
    btn.disabled = false;

    const nilai = penilaian(terbaik);
    const kelasNilai =
      { bertahan: "verdict-buy", lemah: "verdict-wait", gagal: "verdict-sell" }[nilai.status] || "";
    const fmt = (s) =>
      s.cukup && s.expectancyR != null
        ? `${s.expectancyR >= 0 ? "+" : ""}${s.expectancyR.toFixed(2)}R <i class="nota">(${s.n} dgn, ${s.kadarMenang ?? "—"}%)</i>`
        : `<i class="nota">${s.n} dgn — tidak cukup</i>`;

    const baris = jadual
      .map(
        (b) => `<tr class="${terbaik && b.ambang === terbaik.ambang ? "wf-terbaik" : ""}">
          <td>${b.ambang}${terbaik && b.ambang === terbaik.ambang ? " ←" : ""}</td>
          <td>${fmt(b.latih)}</td>
          <td>${fmt(b.uji)}</td>
        </tr>`
      )
      .join("");

    out.innerHTML = `
      <table class="hasil">
        <tr><th>Ambang</th><th>Latih (70%)</th><th>Uji (30%)</th></tr>
        ${baris}
      </table>
      <p class="db-wf-nilai ${kelasNilai}"><b>${escapeHtml(nilai.teks)}</b></p>
      <p class="nota">Ambang dipilih menggunakan lajur <b>latih</b> sahaja. Lajur <b>uji</b> ialah data yang tidak pernah dilihat
        semasa pemilihan — bandingkan keduanya. Pisahan pada ${tsPisah ? new Date(tsPisah).toISOString().slice(0, 10) : "—"}.
        Segmen perlu ≥${MIN_DAGANGAN} dagangan sebelum dilaporkan.
        ${terbaik && terbaik.ambang !== mod.ambangMasuk ? `<br>Ambang semasa app ialah <b>${mod.ambangMasuk}</b>; latih memilih <b>${terbaik.ambang}</b>.` : ""}</p>`;
  }

  async function jalanBacktest() {
    const out = isiEl.querySelector("#db-bt-hasil");
    const btn = isiEl.querySelector("#jalan-backtest");
    if (!semakDataBacktest(out)) return;
    btn.disabled = true;
    out.innerHTML = `<p class="nota">${SPINNER} Mengira… <span id="bt-maju">0%</span></p>`;
    const majuEl = out.querySelector("#bt-maju");

    const skorFn = buatSkorFn(mod.ambangMasuk);

    // PENTING: hantar SL/RR mod. Sebelum ini panggilan ini tidak menghantar apa-apa,
    // jadi backtest.js jatuh ke lalainya (1.5×ATR / RR 2) — nilai SWING. Tab Scalp
    // memapar pelan 1.0×ATR / RR 1.5 tetapi kadar menang yang dipaparkan diukur dari
    // pelan yang sama sekali berbeza. Kos juga dihantar supaya expectancy yang
    // dilaporkan ialah expectancy selepas spread, bukan sebelum.
    const kosHargaBt = kosPip(p.id, bacaKos()) * p.pip;
    const trades = await backtestAsync(
      st.candles1h,
      {
        skorFn,
        pairId: p.id,
        mula: mod.backtest.mula,
        lookback: mod.backtest.lookback,
        slMult: mod.kalk.pengganda,
        rr: mod.kalk.rr,
        kosHarga: kosHargaBt,
      },
      (frac) => {
        if (majuEl) majuEl.textContent = `${Math.round(frac * 100)}%`;
      }
    );

    btn.disabled = false;
    const r = ringkasan(trades);
    if (!trades.length) {
      out.innerHTML = `<p class="nota">Tiada isyarat lulus gate + ambang ${mod.ambangMasuk} dalam tetingkap ini. Dengan gate MTF, ini normal untuk pasangan yang bercampur arah.</p>`;
      return;
    }

    // Dikunci mod + pasangan. Menjalankan semula (pada data lama ATAU data baharu)
    // MENGGANTIKAN snapshot pasangan ini — sampel tidak lagi menggelembung setiap
    // kali awak tekan butang pada hari yang berlainan.
    const tsData = st.candles1h[st.candles1h.length - 1].t;
    simpanSnapshot(mod.id, p.id, kumpulJalur(trades), {
      tsData,
      bilLilin: st.candles1h.length,
    });

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
      <p class="nota">Simulasi entri pada tutup lilin · SL ${mod.kalk.pengganda}×ATR · TP 1:${mod.kalk.rr} (sama seperti pelan yang dipapar di atas) ·
        kos ${(kosHargaBt / p.pip).toFixed(1)} pip ditolak setiap dagangan. Bar yang menyentuh SL &amp; TP dikira kalah (konservatif).
        Jalur dikumpul atas <b>skor teras</b> (tanpa berita) supaya sepadan dengan skor langsung. <b>In-sample</b> — bukan ramalan.</p>`;

    kiraDanLukis(); // segarkan kad keputusan supaya kebarangkalian terkini muncul
  }

  // Init: papar kuota; auto-muat jika kunci ada, jika tidak beri panduan.
  lukisKuota();
  if (adaKunciApi()) muat();
  else statusEl.innerHTML = `Tekan <b>Muat data</b> selepas set kunci API di <a href="#calc">Kalkulator → ⚙️</a>.`; // prettier-ignore
}
