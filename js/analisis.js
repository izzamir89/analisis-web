// Pipeline analisis satu pasangan — lilin masuk, keputusan keluar.
//
// KENAPA MODUL INI WUJUD: langkah membina input enjin (indikator setiap TF, SMC, paras,
// zon, median ATR, kos) dulunya hidup di dalam dashboard.js. Menambah skrin kedua yang
// menjalankan analisis yang sama akan bermakna menyalin langkah-langkah itu — dan dua
// salinan pipeline akan hanyut, yang bermaksud skrin Scan dan skrin Skor akhirnya
// memberi jawapan berbeza untuk pasangan yang sama. Satu pipeline, dua pemanggil.
//
// Tulen kecuali untuk bacaan kos (localStorage) yang boleh disuntik oleh pemanggil.

import { cariPair } from "./pairs.js";
import { ringkasanIndikator, atrMedian } from "./indicators.js";
import { analisaSMC } from "./smc.js";
import { arasSR, zonSupplyDemand } from "./aras.js";
import { skorSetupTerbaik } from "./scoring.js";
import { statusMasaOrder, pasaranTutup } from "./sessions.js";
import { nilaiKos } from "./kos.js";

// Bina input enjin dan nilaikan.
//
//   mod        — preset dari mod.js
//   candlesLo  — lilin TF-entry (wajib)
//   candlesMid / candlesHi — lilin TF konteks (boleh null → gate data tidak lengkap)
//   berita     — jarakAcara(now); hantar senarai kosong untuk konteks tanpa berita
//   kos        — nilaiKos() sedia dikira, atau null untuk mengiranya di sini
//
// Pulang hasil skorSetupTerbaik(), atau null bila TF-entry tiada.
export function analisaPasangan({
  pairId,
  mod,
  candlesLo,
  candlesMid,
  candlesHi,
  now = new Date(),
  berita = { senarai: [], bahaya: false, amaran: false, seterusnya: null },
  kekuatan = null,
  kos,
  risikoHarian = null,
  kalahBerturut = 0,
  arah,
}) {
  if (!Array.isArray(candlesLo) || !candlesLo.length) return null;
  const p = cariPair(pairId);
  const indLo = ringkasanIndikator(candlesLo);
  if (!indLo) return null;

  const atrNilai = indLo.atr;
  const slPip = atrNilai > 0 ? (atrNilai * mod.kalk.pengganda) / p.pip : null;
  const kosDinilai =
    kos !== undefined
      ? kos
      : slPip != null
        ? nilaiKos({ pairId: p.id, slPip, rr: mod.kalk.rr, now })
        : null;

  return skorSetupTerbaik({
    pairId: p.id,
    arah,
    ind1h: indLo,
    ind4h: candlesMid && candlesMid.length ? ringkasanIndikator(candlesMid) : null,
    indD: candlesHi && candlesHi.length ? ringkasanIndikator(candlesHi) : null,
    candles1h: candlesLo,
    kekuatan,
    smc: analisaSMC(candlesLo),
    aras: atrNilai > 0 ? arasSR(candlesLo, atrNilai) : null,
    zon: atrNilai > 0 ? zonSupplyDemand(candlesLo, atrNilai) : null,
    statusSesi: statusMasaOrder(now),
    berita,
    pasaranTutup: pasaranTutup(now),
    tfLabel: mod.tfLabel,
    bobotTrend: mod.bobotTrend,
    ambangMasuk: mod.ambangMasuk,
    atrMelonjak: mod.atrMelonjak,
    slPengganda: mod.kalk.pengganda,
    atrMedian: atrMedian(candlesLo, 14, 100),
    kos: kosDinilai,
    risikoHarian,
    kalahBerturut,
  });
}

// Susun keputusan untuk paparan senarai: boleh-dagang dahulu (skor menurun), kemudian
// yang tersekat. Tulen.
//
// Isyarat boleh-dagang diutamakan berbanding skor mentah dengan sengaja: setup skor-90
// yang gate-nya gagal tidak berguna kepada anda hari ini, manakala setup skor-68 yang
// lulus boleh didagangkan.
export function susunKeputusan(senarai) {
  const bolehDagang = (r) => r.hasil && (r.hasil.verdict === "BUY" || r.hasil.verdict === "SELL");
  return [...senarai].sort((a, b) => {
    const ba = bolehDagang(a);
    const bb = bolehDagang(b);
    if (ba !== bb) return ba ? -1 : 1;
    const sa = a.hasil ? a.hasil.skor : -1;
    const sb = b.hasil ? b.hasil.skor : -1;
    return sb - sa;
  });
}

// Ringkasan satu baris kenapa pasangan ini tidak boleh didagangkan. Tulen.
export function sebabRingkas(hasil) {
  if (!hasil) return "Data tiada.";
  if (!hasil.gate.lulus) return hasil.gate.sebab[0] || "Gate keselamatan aktif.";
  if (hasil.verdict === "WAIT") {
    const tunggu = hasil.amaran.find((a) => a.includes("tiada ruang untuk 1R"));
    return tunggu || `Skor ${hasil.skor} di bawah ambang.`;
  }
  return "";
}
