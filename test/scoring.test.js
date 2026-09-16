import { describe, it, expect } from "vitest";
import {
  skorSetup,
  skorSetupTerbaik,
  gredDariSkor,
  arahDominan,
  jelaskan,
  arahTf,
} from "../js/scoring.js";

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
    expect(m).toEqual({ trend: 40, momentum: 25, smartMoney: 25, lilin: 5, berita: 5 });
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
    expect(r.pecahan.momentum).toBe(25); // RSI + MACD + ADX + tekanan penuh
    expect(r.pecahan.smartMoney).toBe(25); // bias 10 + sokongan 9 + zon 6
    expect(r.pecahan.berita).toBe(5);
    expect(r.pecahan.lilin).toBeGreaterThan(2.5); // engulfing + konfluens sokongan
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
    expect(selari - lawan).toBe(10);
  });

  it("corak lilin menentang arah → 0 markah lilin", () => {
    // Guna siri bullish tetapi nilai arah Sell: corak bull tidak boleh membantu Sell.
    const r = skorSetup({ ...asasBuy, arah: "Sell", ind1h: bear, ind4h: bear, indD: bear });
    expect(r.pecahan.lilin).toBe(0);
  });

  it("acara impak sederhana berdekatan → separuh markah berita", () => {
    const r = skorSetup({ ...asasBuy, berita: { senarai: [], bahaya: false, amaran: true } });
    expect(r.pecahan.berita).toBe(2.5);
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

// Mod dagangan (scalp) menyalurkan label/berat/ambang TF sendiri. Default (tiada param)
// mesti kekal SAMA seperti swing 1J/4J/Harian — semua ujian di atas ialah bukti regresi.
describe("parametrize mod — tfLabel / bobotTrend / gate", () => {
  it("tfLabel diguna dalam sebab trend (mis. label scalp M5/M15/H1)", () => {
    const r = skorSetup({ ...asasBuy, tfLabel: { hi: "H1", mid: "M15", lo: "M5" } });
    const sebabTrend = r.firedRules.find((x) => x.id === "trend").sebab;
    expect(sebabTrend).toContain("H1");
    expect(sebabTrend).toContain("M15");
    expect(sebabTrend).toContain("M5");
    // Tanpa param → label lalai (regresi).
    expect(skorSetup(asasBuy).firedRules.find((x) => x.id === "trend").sebab).toContain("Harian");
  });

  it("bobotTrend menukar taburan markah trend (jumlah kekal 40)", () => {
    // Satu TF (mid) neutral supaya berat mempengaruhi markah.
    const asas = { ...asasBuy, ind4h: neutral };
    const lalai = skorSetup(asas).pecahan.trend; // 20 + 4 + 10 = 34
    const beratLain = skorSetup({ ...asas, bobotTrend: { hi: 10, mid: 10, lo: 20 } }).pecahan.trend;
    expect(lalai).toBe(34);
    expect(beratLain).toBe(34); // 10 + 4 + 20 = 34 (mid neutral 10×0.4)
    // Beri berat besar pada TF neutral → markah turun.
    const beratKeMid = skorSetup({ ...asas, bobotTrend: { hi: 10, mid: 25, lo: 5 } }).pecahan.trend;
    expect(beratKeMid).toBe(25); // 10 + (25×0.4=10) + 5
  });

  it("atrMelonjak lebih rendah (scalp) menggate ATR yang swing benarkan", () => {
    const indSederhana = { ...bull, atr: 0.0066 }; // ≈0.6% dari harga 1.1
    // Swing (ambang 0.012) → lulus.
    expect(skorSetup({ ...asasBuy, ind1h: indSederhana }).gate.lulus).toBe(true);
    // Scalp (ambang 0.004) → NO TRADE.
    const r = skorSetup({ ...asasBuy, ind1h: indSederhana, atrMelonjak: 0.004 });
    expect(r.gate.lulus).toBe(false);
    expect(r.gate.sebab.join(" ")).toContain("Volatiliti melonjak");
  });

  it("ambangMasuk lebih tinggi menurunkan verdict BUY → WAIT pada skor sama", () => {
    const skor = skorSetup(asasBuy).skor; // kira skor sebenar dahulu
    const r = skorSetup({ ...asasBuy, ambangMasuk: skor + 1 }); // ambang melebihi skor
    expect(r.gate.lulus).toBe(true);
    expect(r.verdict).toBe("WAIT");
    // Ambang tepat pada skor → masih cukup untuk BUY.
    expect(skorSetup({ ...asasBuy, ambangMasuk: skor }).verdict).toBe("BUY");
  });
});

describe("gate kos — setup yang matematiknya kalah tidak boleh diluluskan", () => {
  const kosGate = {
    gate: true,
    amaran: false,
    kosR: 0.33,
    sebab:
      "Kos (spread+komisen 1.0 pip) ialah 33% daripada risiko — SL terlalu rapat untuk berbaloi.",
  };
  const kosAmaran = {
    gate: false,
    amaran: true,
    kosR: 0.2,
    sebab: "Kos 1.0 pip = 20% daripada risiko — jidar nipis.",
  };

  it("kos melebihi ambang → NO TRADE walaupun skor tinggi", () => {
    const tanpaKos = skorSetup(asasBuy);
    expect(tanpaKos.verdict).toBe("BUY"); // setup ini memang bagus...

    const r = skorSetup({ ...asasBuy, kos: kosGate });
    expect(r.verdict).toBe("NO TRADE"); // ...tetapi tidak selepas kos dikira
    expect(r.gate.sebab.join(" ")).toContain("terlalu rapat");
    // Skor tidak berubah — hanya kebenaran masuk yang ditarik.
    expect(r.skor).toBe(tanpaKos.skor);
  });

  it("kos pada paras amaran → masih boleh dagang, tetapi disebut", () => {
    const r = skorSetup({ ...asasBuy, kos: kosAmaran });
    expect(r.gate.lulus).toBe(true);
    expect(r.amaran.join(" ")).toContain("jidar nipis");
  });

  it("tiada maklumat kos → kelakuan tidak berubah", () => {
    expect(skorSetup({ ...asasBuy, kos: null }).verdict).toBe("BUY");
  });
});

describe("gate modal — had harian & kalah berturut", () => {
  it("bajet risiko harian habis → NO TRADE", () => {
    const r = skorSetup({
      ...asasBuy,
      risikoHarian: { melebihi: true, digunakan: 30, had: 30, baki: 0, peratus: 100 },
    });
    expect(r.verdict).toBe("NO TRADE");
    expect(r.gate.sebab.join(" ")).toContain("Bajet risiko harian habis");
  });

  it("bajet masih ada → tiada gate", () => {
    const r = skorSetup({
      ...asasBuy,
      risikoHarian: { melebihi: false, digunakan: 10, had: 30, baki: 20, peratus: 33 },
    });
    expect(r.gate.lulus).toBe(true);
  });

  it("3 kalah berturut hari ini → berhenti paksa", () => {
    expect(skorSetup({ ...asasBuy, kalahBerturut: 2 }).verdict).toBe("BUY");
    const r = skorSetup({ ...asasBuy, kalahBerturut: 3 });
    expect(r.verdict).toBe("NO TRADE");
    expect(r.gate.sebab.join(" ")).toContain("kalah berturut");
  });
});

describe("skor teras — sepadan antara backtest & dagangan langsung", () => {
  it("skor teras membuang sumbangan berita", () => {
    const r = skorSetup(asasBuy); // senarai berita kosong → berita 10/10
    expect(r.pecahan.berita).toBe(5);
    expect(r.skorTeras).toBe(Math.round((r.skor - 5) * 10) / 10);
    expect(r.maksTeras).toBe(95);
  });

  it("setup teknikal SAMA menghasilkan skor teras sama walau status berita berbeza", () => {
    // Backtest tidak tahu kalendar sejarah → berita penuh.
    const backtest = skorSetup(asasBuy);
    // Dagangan langsung dengan acara impak tinggi berdekatan → berita separuh.
    const langsung = skorSetup({
      ...asasBuy,
      berita: {
        senarai: [{ nama: "NFP", impak: "tinggi", minit: 45, lalu: false }],
        bahaya: false,
        amaran: false,
        seterusnya: { nama: "NFP", impak: "tinggi", minit: 45, lalu: false, mataWang: "USD" },
      },
    });
    // Skor penuh berbeza (itulah punca pemetaan jalur cacat sebelum ini)...
    expect(langsung.skor).toBeLessThan(backtest.skor);
    // ...tetapi skor teras identik, jadi jalur kebarangkalian membandingkan benda sama.
    expect(langsung.skorTeras).toBe(backtest.skorTeras);
  });
});

describe("peraturan ruang 1R — menggantikan ambang 0.5×ATR sembarangan", () => {
  // ATR 0.0009, slPengganda 1.5 → 1R = 0.00135. Harga 1.1.
  const asas = { ...asasBuy, slPengganda: 1.5 };

  it("paras berstruktur dalam 1R → WAIT dengan sebab konkrit", () => {
    const r = skorSetup({
      ...asas,
      aras: {
        sokongan: [{ harga: 1.095, sentuhan: 3 }],
        rintangan: [{ harga: 1.1008, sentuhan: 4 }],
      },
    });
    expect(r.verdict).toBe("WAIT");
    expect(r.amaran.join(" ")).toContain("tiada ruang untuk 1R");
  });

  it("paras 1-SENTUHAN dalam 1R tidak menyekat — ayun terpencil bukan struktur", () => {
    const r = skorSetup({
      ...asas,
      aras: {
        sokongan: [{ harga: 1.095, sentuhan: 3 }],
        rintangan: [{ harga: 1.1008, sentuhan: 1 }],
      },
    });
    expect(r.verdict).not.toBe("WAIT");
  });

  it("ruang antara 1R dan 2R → boleh dagang, tetapi amaran potong sasaran", () => {
    // Rintangan 1.1020 = 0.0020 jauh ≈ 1.48R
    const r = skorSetup({
      ...asas,
      aras: {
        sokongan: [{ harga: 1.095, sentuhan: 3 }],
        rintangan: [{ harga: 1.102, sentuhan: 4 }],
      },
    });
    expect(r.gate.lulus).toBe(true);
    expect(r.verdict).not.toBe("WAIT");
    expect(r.amaran.join(" ")).toContain("potong sasaran");
  });

  it("SL lebih lebar menjadikan paras yang sama terlalu dekat", () => {
    const aras = {
      sokongan: [{ harga: 1.095, sentuhan: 3 }],
      rintangan: [{ harga: 1.102, sentuhan: 4 }],
    };
    // slPengganda 1.5 → 1R = 0.00135, ruang 0.0020 = 1.48R → boleh dagang.
    expect(skorSetup({ ...asasBuy, aras, slPengganda: 1.5 }).verdict).not.toBe("WAIT");
    // slPengganda 3.0 → 1R = 0.0027, ruang 0.0020 = 0.74R → tiada ruang.
    expect(skorSetup({ ...asasBuy, aras, slPengganda: 3.0 }).verdict).toBe("WAIT");
  });
});

describe("gate volatiliti relatif", () => {
  it("ATR jauh melebihi median → NO TRADE, walaupun ATR% mutlak kecil", () => {
    // ATR 0.0009 pada harga 1.1 = 0.08% — jauh di bawah mana-mana ambang mutlak.
    const r = skorSetup({ ...asasBuy, atrMedian: 0.0003 }); // 3× median
    expect(r.gate.lulus).toBe(false);
    expect(r.gate.sebab.join(" ")).toContain("median terkini");
  });

  it("ATR berhampiran median → lulus", () => {
    expect(skorSetup({ ...asasBuy, atrMedian: 0.0008 }).gate.lulus).toBe(true);
  });

  it("tanpa median, jatuh balik ke ambang mutlak lama", () => {
    const indBergelora = { ...bull, atr: 0.0066 }; // 0.6% dari 1.1
    expect(skorSetup({ ...asasBuy, ind1h: indBergelora, atrMelonjak: 0.004 }).gate.lulus).toBe(
      false
    );
  });
});

describe("skorSetupTerbaik — nilai kedua-dua arah", () => {
  it("memilih arah yang lulus gate, bukan arah yang diteka", () => {
    // Semua timeframe BEARISH, tetapi undian momentum condong ke Buy.
    const input = {
      ...asasBuy,
      arah: undefined,
      ind1h: bear,
      ind4h: bear,
      indD: bear,
      smc: { bias: "bear" },
      kekuatan: { EUR: 2, USD: 9 },
      aras: { sokongan: [{ harga: 1.09, sentuhan: 3 }], rintangan: [{ harga: 1.12, sentuhan: 3 }] },
    };
    const r = skorSetupTerbaik(input);
    expect(r.arah).toBe("Sell");
    expect(r.gate.lulus).toBe(true);
  });

  it("menghormati arah yang ditetapkan pengguna", () => {
    const r = skorSetupTerbaik({ ...asasBuy, arah: "Sell" });
    expect(r.arah).toBe("Sell");
  });

  it("kedua-dua arah tersekat → pulangkan yang halangannya paling sedikit", () => {
    const r = skorSetupTerbaik({ ...asasBuy, arah: undefined, pasaranTutup: true });
    expect(r.gate.lulus).toBe(false);
    expect(r.gate.sebab.join(" ")).toContain("Pasaran tutup");
  });
});
