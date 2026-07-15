// Smart Money Concepts — 100% tulen & HEURISTIK (pengesanan corak, BUKAN aliran
// order institusi sebenar). Dikira dari titik ayun (swing) lilin OHLC.
// Papar di UI sebagai isyarat konfluens sahaja, bukan kepastian.

// Titik ayun fraktal: lilin yang high/low-nya melampaui k jiran di kiri & kanan.
export function swingPoints(candles, k = 2) {
  const n = Array.isArray(candles) ? candles.length : 0;
  const highs = [];
  const lows = [];
  for (let i = k; i < n - k; i++) {
    let hi = true;
    let lo = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (candles[j].h >= candles[i].h) hi = false;
      if (candles[j].l <= candles[i].l) lo = false;
    }
    if (hi) highs.push({ i, price: candles[i].h });
    if (lo) lows.push({ i, price: candles[i].l });
  }
  return { highs, lows };
}

// Break of Structure — harga tutup menembusi ayun terkini (sambungan trend).
export function detectBOS(candles, swings) {
  const n = candles.length;
  if (!n) return { arah: null };
  const close = candles[n - 1].c;
  const ah = swings.highs[swings.highs.length - 1];
  const al = swings.lows[swings.lows.length - 1];
  if (ah && close > ah.price) return { arah: "bull", i: n - 1, aras: ah.price };
  if (al && close < al.price) return { arah: "bear", i: n - 1, aras: al.price };
  return { arah: null };
}

// Change of Character — pecah PERTAMA menentang urutan ayun (kemungkinan pusingan).
export function detectCHoCH(candles, swings) {
  const n = candles.length;
  if (n < 2) return { arah: null };
  const close = candles[n - 1].c;
  const H = swings.highs;
  const L = swings.lows;
  if (H.length < 2 || L.length < 2) return { arah: null };
  const naik = H[H.length - 1].price > H[H.length - 2].price && L[L.length - 1].price > L[L.length - 2].price; // prettier-ignore
  const turun = H[H.length - 1].price < H[H.length - 2].price && L[L.length - 1].price < L[L.length - 2].price; // prettier-ignore
  const al = L[L.length - 1];
  const ah = H[H.length - 1];
  if (naik && close < al.price) return { arah: "bear", aras: al.price };
  if (turun && close > ah.price) return { arah: "bull", aras: ah.price };
  return { arah: null };
}

// Order Block — lilin warna bertentangan terakhir sebelum impuls yang cetus BOS.
export function orderBlocks(candles, swings) {
  const bos = detectBOS(candles, swings);
  const n = candles.length;
  if (!bos.arah || !n) return [];
  for (let i = n - 2; i >= Math.max(0, n - 20); i--) {
    const c = candles[i];
    const bearish = c.c < c.o;
    const bullish = c.c > c.o;
    if (bos.arah === "bull" && bearish) return [{ i, atas: c.h, bawah: c.l, jenis: "bull" }];
    if (bos.arah === "bear" && bullish) return [{ i, atas: c.h, bawah: c.l, jenis: "bear" }];
  }
  return [];
}

// Liquidity Grab — sumbu menembusi ayun (di mana stop berkumpul) lalu tutup kembali.
export function liquidityGrabs(candles, swings) {
  const n = candles.length;
  const out = [];
  if (n < 2) return out;
  const last = candles[n - 1];
  const ah = swings.highs[swings.highs.length - 1];
  const al = swings.lows[swings.lows.length - 1];
  if (ah && last.h > ah.price && last.c < ah.price) out.push({ i: n - 1, arah: "bear", aras: ah.price }); // prettier-ignore
  if (al && last.l < al.price && last.c > al.price) out.push({ i: n - 1, arah: "bull", aras: al.price }); // prettier-ignore
  return out;
}

// Gabung semua → bias + sebab Bahasa Melayu untuk penerangan.
export function analisaSMC(candles, k = 2) {
  const n = Array.isArray(candles) ? candles.length : 0;
  if (n < 2 * k + 2) {
    return {
      bias: "neutral",
      bos: { arah: null },
      choch: { arah: null },
      ob: [],
      grab: [],
      sebab: ["Data tak cukup untuk SMC."],
    };
  }
  const swings = swingPoints(candles, k);
  const bos = detectBOS(candles, swings);
  const choch = detectCHoCH(candles, swings);
  const ob = orderBlocks(candles, swings);
  const grab = liquidityGrabs(candles, swings);

  const sebab = [];
  let skor = 0;
  if (bos.arah) {
    sebab.push(`BOS ${bos.arah}`);
    skor += bos.arah === "bull" ? 1 : -1;
  }
  if (choch.arah) {
    sebab.push(`CHoCH ${choch.arah}`);
    skor += choch.arah === "bull" ? 1 : -1;
  }
  if (ob.length) sebab.push(`Order block ${ob[0].jenis}`);
  if (grab.length) {
    sebab.push(`Liquidity grab ${grab[0].arah}`);
    skor += grab[0].arah === "bull" ? 0.5 : -0.5;
  }
  const bias = skor > 0 ? "bull" : skor < 0 ? "bear" : "neutral";
  if (!sebab.length) sebab.push("Tiada isyarat SMC jelas.");
  return { bias, bos, choch, ob, grab, sebab };
}
