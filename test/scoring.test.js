import { describe, it, expect } from "vitest";
import { skorSetup, gredDariSkor, arahDominan, jelaskan, arahTf } from "../js/scoring.js";

// Ringkasan indikator "bullish kuat" untuk EURUSD.
const bull = {
  harga: 1.1,
  ema20: 1.09,
  ema50: 1.08,
  ema200: 1.05,
  rsi: 58,
  macd: 0.001,
  signal: 0.0005,
  macdHist: 0.0005,
  adx: 30,
  plusDI: 30,
  minusDI: 10,
  atr: 0.0009,
};
// Cerminan bearish.
const bear = {
  ...bull,
  harga: 1.0,
  ema20: 1.01,
  ema50: 1.02,
  ema200: 1.05,
  rsi: 42,
  macdHist: -0.0005,
  plusDI: 10,
  minusDI: 30,
};
// Ada data, tetapi EMA berselirat — belum jelas ke mana.
const neutral = { ...bull, harga: 1.06, ema20: 1.055, ema50: 1.07, ema200: 1.05 };

// Lilin 1J: 20 lilin rata (ATR ≈ 0.001) + Bullish Engulfing lebar di hujung.
function lilinBullish() {
  const asas = Array.from({ length: 20 }, (_, i) => ({
    t: i * 3600000,
    o: 1.1,
    h: 1.1005,
    l: 1.0995,
    c: 1.1,
  }));
  asas.push({ t: 20 * 3600000, o: 1.1006, h: 1.1007, l: 1.0999, c: 1.1 }); // bearish
  asas.push({ t: 21 * 3600000, o: 1.0998, h: 1.1016, l: 1.0997, c: 1.1012 }); // menelan, lebar
  return asas;
}

// Harga 1.1, ATR 0.0009 → ambang "hampir" = 0.00045. Sokongan 1.0997 = hampir.
const arasHampirSokongan = {
  sokongan: [{ harga: 1.0997, sentuhan: 3 }],
  rintangan: [{ harga: 1.105, sentuhan: 2 }],
};
const arasHampirRintangan = {
  sokongan: [{ harga: 1.095, sentuhan: 3 }],
  rintangan: [{ harga: 1.1003, sentuhan: 4 }],
};
const zonDemand = [{ atas: 1.1005, bawah: 1.0995, jenis: "demand", i: 5 }];

const asasBuy = {
  pairId: "EURUSD",
  arah: "Buy",
  ind1h: bull,
  ind4h: bull,
  indD: bull,
  candles1h: lilinBullish(),
  kekuatan: { EUR: 9, USD: 2 },
  smc: { bias: "bull" },
  aras: arasHampirSokongan,
  zon: zonDemand,
  statusSesi: { tahap: "elok", sebab: "London–NY" },
  berita: { senarai: [], bahaya: false, amaran: false, seterusnya: null },
};

describe("arahTf", () => {
  it("bezakan bull / bear / neutral / tiada data", () => {
    expect(arahTf(bull)).toBe("bull");
    expect(arahTf(bear)).toBe("bear");
    expect(arahTf(neutral)).toBe("neutral");
    expect(arahTf(null)).toBe(null);
    expect(arahTf({ harga: 1.1 })).toBe(null); // EMA hilang ≠ neutral
  });
});

describe("gredDariSkor — sempadan", () => {
  it("peta skor ke gred betul", () => {
    expect(gredDariSkor(95)).toBe("A+");
    expect(gredDariSkor(94.9)).toBe("A");
    expect(gredDariSkor(85)).toBe("A");
    expect(gredDariSkor(84.9)).toBe("B");
    expect(gredDariSkor(70)).toBe("B");
    expect(gredDariSkor(69.9)).toBe("C");
    expect(gredDariSkor(50)).toBe("C");
    expect(gredDariSkor(49.9)).toBe("D");
  });
});

describe("struktur 100 mata", () => {
  it("jumlah maksimum semua baldi tepat 100", () => {
    const m = skorSetup(asasBuy).maks;
    expect(Object.values(m).reduce((a, b) => a + b, 0)).toBe(100);
    expect(m).toEqual({ trend: 40, momentum: 20, smartMoney: 20, lilin: 10, berita: 10 });
  });
});

describe("skorSetup — setup baik", () => {
  it("bullish selari sempurna → skor tinggi, BUY, gate lulus", () => {
    const r = skorSetup(asasBuy);
    expect(r.gate.lulus).toBe(true);
    expect(r.verdict).toBe("BUY");
    expect(r.skor).toBeGreaterThanOrEqual(95);
    expect(r.gred).toBe("A+");
  });

  it("setiap baldi mencapai maksimumnya pada setup sempurna", () => {
    const r = skorSetup(asasBuy);
    expect(r.pecahan.trend).toBe(40); // 20 + 10 + 10
    expect(r.pecahan.momentum).toBe(20); // RSI + MACD + ADX + tekanan penuh
    expect(r.pecahan.smartMoney).toBe(20); // bias 8 + sokongan 7 + zon 5
    expect(r.pecahan.berita).toBe(10);
    expect(r.pecahan.lilin).toBeGreaterThan(5); // engulfing + konfluens sokongan
  });

  it("bearish selari → verdict SELL", () => {
    const r = skorSetup({
      ...asasBuy,
      arah: "Sell",
      ind1h: bear,
      ind4h: bear,
      indD: bear,
      smc: { bias: "bear" },
      candles1h: null,
      aras: null,
      zon: [],
      kekuatan: { EUR: 2, USD: 9 },
    });
    expect(r.gate.lulus).toBe(true);
    expect(r.verdict).toBe("SELL");
  });
});

describe("gate MTF — dua tahap", () => {
  it("timeframe BERTENTANGAN → NO TRADE", () => {
    const r = skorSetup({ ...asasBuy, ind4h: bear });
    expect(r.verdict).toBe("NO TRADE");
    expect(r.gate.lulus).toBe(false);
    expect(r.gate.sebab.join(" ")).toContain("bertentangan");
  });

  it("timeframe NEUTRAL → markah separa, gate masih LULUS", () => {
    const r = skorSetup({ ...asasBuy, ind4h: neutral });
    expect(r.gate.lulus).toBe(true);
    expect(r.verdict).toBe("BUY");
    expect(r.pecahan.trend).toBe(34); // 20 + (10 × 0.4) + 10
  });

  it("timeframe TIADA DATA → NO TRADE, bukan markah separa", () => {
    const r = skorSetup({ ...asasBuy, indD: null });
    expect(r.verdict).toBe("NO TRADE");
    expect(r.pecahan.trend).toBe(20); // 0 untuk Harian, bukan separuh kredit
    expect(r.gate.sebab.join(" ")).toContain("tidak lengkap");
  });
});

describe("gate lain", () => {
  it("berita impak tinggi dalam zon bahaya → NO TRADE", () => {
    const r = skorSetup({ ...asasBuy, berita: { senarai: [], bahaya: true, amaran: false } });
    expect(r.verdict).toBe("NO TRADE");
    expect(r.pecahan.berita).toBe(0);
  });

  it("pasaran tutup → NO TRADE", () => {
    expect(skorSetup({ ...asasBuy, pasaranTutup: true }).verdict).toBe("NO TRADE");
  });

  it("volatiliti melonjak → NO TRADE", () => {
    const meletup = { ...bull, atr: 0.02 }; // 1.8% dari harga, jauh melebihi ambang
    const r = skorSetup({ ...asasBuy, ind1h: meletup });
    expect(r.verdict).toBe("NO TRADE");
    expect(r.gate.sebab.join(" ")).toContain("Volatiliti melonjak");
  });
});

describe("peraturan tunggu breakout", () => {
  it("Buy hampir rintangan → WAIT walaupun gate lulus & skor tinggi", () => {
    const r = skorSetup({ ...asasBuy, aras: arasHampirRintangan, zon: [] });
    expect(r.gate.lulus).toBe(true);
    expect(r.verdict).toBe("WAIT");
    expect(r.amaran.join(" ")).toContain("tunggu breakout");
  });

  it("Sell hampir sokongan → WAIT (simetri)", () => {
    const r = skorSetup({
      ...asasBuy,
      arah: "Sell",
      ind1h: bear,
      ind4h: bear,
      indD: bear,
      smc: { bias: "bear" },
      candles1h: null,
      // harga bear = 1.0, ATR 0.0009 → sokongan 0.9998 adalah "hampir"
      aras: { sokongan: [{ harga: 0.9998, sentuhan: 3 }], rintangan: [] },
      zon: [],
    });
    expect(r.verdict).toBe("WAIT");
    expect(r.amaran.join(" ")).toContain("tunggu breakout");
  });
});

describe("data hilang = 0 markah (pembetulan dari v2)", () => {
  it("input kosong sepenuhnya → skor sangat rendah, NO TRADE", () => {
    const r = skorSetup({ pairId: "EURUSD" });
    // v2 memberi ~26 markah percuma di sini. v3 hanya beri markah berita
    // (tiada acara direkod = benar-benar tiada berita).
    expect(r.skor).toBeLessThanOrEqual(10);
    expect(r.gred).toBe("D");
    expect(r.verdict).toBe("NO TRADE");
    expect(r.pecahan.trend).toBe(0);
    expect(r.pecahan.momentum).toBe(0);
    expect(r.pecahan.lilin).toBe(0);
  });

  it("momentum tanpa ind1h → 0, ditanda gagal dalam firedRules", () => {
    const r = skorSetup({ ...asasBuy, ind1h: null });
    expect(r.pecahan.momentum).toBe(0);
    expect(r.firedRules.find((x) => x.id === "momentum").status).toBe("gagal");
  });
});

describe("baldi individu", () => {
  it("smc menentang arah → kehilangan mata bias", () => {
    const selari = skorSetup(asasBuy).pecahan.smartMoney;
    const lawan = skorSetup({ ...asasBuy, smc: { bias: "bear" } }).pecahan.smartMoney;
    expect(selari - lawan).toBe(8);
  });

  it("corak lilin menentang arah → 0 markah lilin", () => {
    // Guna siri bullish tetapi nilai arah Sell: corak bull tidak boleh membantu Sell.
    const r = skorSetup({ ...asasBuy, arah: "Sell", ind1h: bear, ind4h: bear, indD: bear });
    expect(r.pecahan.lilin).toBe(0);
  });

  it("acara impak sederhana berdekatan → separuh markah berita", () => {
    const r = skorSetup({ ...asasBuy, berita: { senarai: [], bahaya: false, amaran: true } });
    expect(r.pecahan.berita).toBe(5);
    expect(r.gate.lulus).toBe(true); // amaran tidak menggate
  });
});

describe("amaran (tidak menggate)", () => {
  it("sesi kecairan rendah muncul sebagai amaran, bukan gate", () => {
    const r = skorSetup({ ...asasBuy, statusSesi: { tahap: "elak" } });
    expect(r.gate.lulus).toBe(true);
    expect(r.amaran.join(" ")).toContain("Kecairan sesi rendah");
  });

  it("kekuatan mata wang menentang muncul sebagai amaran", () => {
    const r = skorSetup({ ...asasBuy, kekuatan: { EUR: 2, USD: 9 } });
    expect(r.gate.lulus).toBe(true);
    expect(r.amaran.join(" ")).toContain("Kekuatan mata wang menentang");
  });
});

describe("firedRules", () => {
  it("setiap peraturan bawa maks & status untuk senarai sebab UI", () => {
    const r = skorSetup(asasBuy);
    expect(r.firedRules).toHaveLength(5);
    for (const f of r.firedRules) {
      expect(typeof f.label).toBe("string");
      expect(f.maks).toBeGreaterThan(0);
      expect(["ok", "amaran", "gagal"]).toContain(f.status);
    }
    expect(r.firedRules.find((x) => x.id === "trend").status).toBe("ok");
  });
});

describe("arahDominan", () => {
  it("isyarat bullish → Buy", () => {
    expect(arahDominan(asasBuy)).toBe("Buy");
  });
  it("isyarat bearish → Sell", () => {
    expect(
      arahDominan({ pairId: "EURUSD", ind1h: bear, ind4h: bear, kekuatan: { EUR: 2, USD: 9 } })
    ).toBe("Sell");
  });
});

describe("jelaskan", () => {
  it("hasilkan prosa mengandungi skor & verdict", () => {
    const teks = jelaskan(skorSetup(asasBuy));
    expect(teks).toContain("Skor");
    expect(teks).toContain("BUY");
  });

  it("bila gate gagal, terangkan SEBAB gate dahulu — bukan skor", () => {
    const teks = jelaskan(skorSetup({ ...asasBuy, ind4h: bear }));
    expect(teks).toContain("NO TRADE");
    expect(teks).toContain("bertentangan");
    expect(teks).toContain("tidak relevan");
  });
});
