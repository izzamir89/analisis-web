// Log verdict langsung — rekod apa yang enjin KATA, kemudian semak apa yang BERLAKU.
//
// KENAPA MODUL INI WUJUD: backtest adalah in-sample; walk-forward mengecilkan bias itu
// tetapi masih menala atas sejarah yang sama. Ujian sebenar satu-satunya ialah: enjin
// mengeluarkan verdict pada masa T, tanpa mengetahui masa depan, dan kemudian masa depan
// berlaku. Tiada penalaan boleh menipu rekod itu, kerana verdict ditulis sebelum lilin
// seterusnya wujud.
//
// Ini menjadi bukti luar-sampel yang benar-benar tulen yang terkumpul secara automatik
// semasa anda menggunakan app. Selepas ~40 rekod ia lebih bermakna daripada keseluruhan
// backtest.
//
// Rekod DINYAHDUPLIKASI mengikut lilin: membuka semula skrin lima kali pada lilin yang
// sama mesti menghasilkan satu rekod, bukan lima — jika tidak log ini akan mewarisi
// pepijat inflasi-sampel yang sama yang telah dibetulkan dalam kebarangkalian.js.

import { bacaJSON, simpanJSON } from "./store.js";

const KUNCI = "verdict_log";
export const MAKS_REKOD = 500; // paling lama dibuang dahulu; storan tempatan tidak kekal

export function baca() {
  const v = bacaJSON(KUNCI, []);
  return Array.isArray(v) ? v : [];
}

function simpan(list) {
  simpanJSON(KUNCI, list.slice(-MAKS_REKOD));
}

export function padamSemua() {
  simpanJSON(KUNCI, []);
}

// Kunci unik satu keputusan: mod + pasangan + cap masa lilin.
function kunciRekod(r) {
  return `${r.modId}:${r.pairId}:${r.tsLilin}`;
}

// Rekod satu verdict langsung. Pulang rekod yang disimpan, atau null jika dilangkau.
//
// Hanya verdict BOLEH-DAGANG dilog. WAIT dan NO TRADE tidak menghasilkan dagangan, jadi
// merekodkannya akan mencipta "keputusan" yang tiada hasil untuk disemak — dan kita
// sudah tahu enjin banyak berkata tunggu.
export function rekod({
  modId,
  pairId,
  verdict,
  skor,
  skorTerasNorm,
  arah,
  harga,
  atr,
  slMult,
  rr,
  tsLilin,
  kosHarga = 0,
}) {
  if (verdict !== "BUY" && verdict !== "SELL") return null;
  if (!(harga > 0) || !(atr > 0) || !(slMult > 0) || !(rr > 0)) return null;

  const list = baca();
  const calon = { modId, pairId, tsLilin };
  if (list.some((r) => kunciRekod(r) === kunciRekod(calon))) return null; // sudah dilog

  const naik = verdict === "BUY";
  const jarakSL = atr * slMult;
  const r = {
    id: `${kunciRekod(calon)}`,
    modId,
    pairId,
    ts: Date.now(),
    tsLilin,
    verdict,
    arah,
    skor,
    skorTerasNorm,
    entry: harga,
    sl: naik ? harga - jarakSL : harga + jarakSL,
    tp: naik ? harga + jarakSL * rr : harga - jarakSL * rr,
    rr,
    kosR: jarakSL > 0 ? kosHarga / jarakSL : 0,
    hasil: "open",
  };
  list.push(r);
  simpan(list);
  return r;
}

// Selesaikan rekod terbuka terhadap lilin yang tiba SELEPAS keputusan dibuat.
//
// SL disemak dahulu pada bar yang menyentuh kedua-duanya — anggapan konservatif yang
// sama seperti backtest.js, supaya kedua-dua nombor boleh dibandingkan secara adil.
// Tulen: menerima rekod & lilin, memulangkan rekod baharu. Pemanggil yang menyimpan.
export function selesaikanSatu(r, candles) {
  if (!r || r.hasil !== "open" || !Array.isArray(candles)) return r;
  const naik = r.verdict === "BUY";
  for (const c of candles) {
    const t = typeof c.t === "number" ? c.t : Date.parse(c.t);
    if (!(t > r.tsLilin)) continue; // hanya lilin selepas keputusan
    if (naik) {
      if (c.l <= r.sl) return { ...r, hasil: "loss", rSebenar: -1 - r.kosR, tsSelesai: t };
      if (c.h >= r.tp) return { ...r, hasil: "win", rSebenar: r.rr - r.kosR, tsSelesai: t };
    } else {
      if (c.h >= r.sl) return { ...r, hasil: "loss", rSebenar: -1 - r.kosR, tsSelesai: t };
      if (c.l <= r.tp) return { ...r, hasil: "win", rSebenar: r.rr - r.kosR, tsSelesai: t };
    }
  }
  return r;
}

// Selesaikan semua rekod terbuka bagi satu pasangan+mod terhadap lilin segar. Pulang
// bilangan yang baru diselesaikan.
export function selesaikan(modId, pairId, candles) {
  const list = baca();
  let kira = 0;
  const baharu = list.map((r) => {
    if (r.modId !== modId || r.pairId !== pairId || r.hasil !== "open") return r;
    const s = selesaikanSatu(r, candles);
    if (s.hasil !== "open") kira++;
    return s;
  });
  if (kira) simpan(baharu);
  return kira;
}

// Rekod ditapis untuk paparan / analitik. Bentuknya sepadan dengan entri jurnal, jadi
// ringkasan() & ikutKumpulan() dari analytics.js boleh digunakan terus.
export function untukAnalitik(modId = null) {
  return baca()
    .filter((r) => modId == null || r.modId === modId)
    .map((r) => ({
      pairId: r.pairId,
      arah: r.arah,
      hasil: r.hasil,
      rr: r.rr,
      rSebenar: r.rSebenar,
      ts: new Date(r.tsLilin).toISOString(),
      skorTerasNorm: r.skorTerasNorm,
    }));
}
