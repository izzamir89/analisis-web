import { describe, it, expect, beforeEach } from "vitest";
import {
  simbolProvider,
  petaInterval,
  normalTwelveData,
  simpanCache,
  bacaCache,
  bacaTetapanApi,
  simpanTetapanApi,
  adaKunciApi,
  kuotaBaki,
  kuotaHarian,
  statusKuota,
} from "../js/marketdata.js";
import { cariPair } from "../js/pairs.js";

beforeEach(() => localStorage.clear());

describe("simbolProvider & petaInterval", () => {
  it("guna medan td (bentuk slash) untuk Twelve Data", () => {
    expect(simbolProvider(cariPair("EURUSD"))).toBe("EUR/USD");
    expect(simbolProvider(cariPair("XAUUSD"))).toBe("XAU/USD");
  });
  it("peta interval dalaman ke simbol Twelve Data", () => {
    expect(petaInterval("60")).toBe("1h");
    expect(petaInterval("240")).toBe("4h");
    expect(petaInterval("D")).toBe("1day");
    expect(petaInterval("xx")).toBe("1h"); // fallback
  });
});

describe("normalTwelveData", () => {
  it("balikkan susunan menurun → menaik & tukar ke nombor", () => {
    const json = {
      status: "ok",
      values: [
        { datetime: "2026-01-02", open: "2", high: "3", low: "1", close: "2.5" },
        { datetime: "2026-01-01", open: "1", high: "2", low: "0.5", close: "1.5" },
      ],
    };
    const { candles, ralat } = normalTwelveData(json);
    expect(ralat).toBeUndefined();
    expect(candles).toHaveLength(2);
    expect(candles[0].t).toBe("2026-01-01"); // paling awal dahulu
    expect(candles[1].c).toBe(2.5);
  });
  it("pulang ralat pada status error", () => {
    expect(normalTwelveData({ status: "error", message: "had" }).ralat).toBe("had");
  });
  it("pulang ralat bila values kosong / hilang", () => {
    expect(normalTwelveData({ values: [] }).ralat).toBeTruthy();
    expect(normalTwelveData(null).ralat).toBeTruthy();
  });
});

describe("cache (tulen)", () => {
  it("simpan lalu baca bila masih segar", () => {
    const c = [{ t: "x", o: 1, h: 1, l: 1, c: 1 }];
    simpanCache("twelvedata", "EUR/USD", "60", c, 1000);
    expect(bacaCache("twelvedata", "EUR/USD", "60", 1500, 1000)).toEqual(c);
  });
  it("pulang null bila melebihi TTL", () => {
    simpanCache("twelvedata", "EUR/USD", "60", [{ c: 1 }], 1000);
    expect(bacaCache("twelvedata", "EUR/USD", "60", 5000, 1000)).toBeNull();
  });
  it("ttl null = abai umur", () => {
    simpanCache("twelvedata", "EUR/USD", "60", [{ c: 1 }], 1000);
    expect(bacaCache("twelvedata", "EUR/USD", "60", 9e9, null)).not.toBeNull();
  });
});

describe("tetapan API", () => {
  it("lalai provider twelvedata, tiada kunci", () => {
    expect(bacaTetapanApi().provider).toBe("twelvedata");
    expect(adaKunciApi()).toBe(false);
  });
  it("simpan & baca kunci", () => {
    simpanTetapanApi({ apikey: "ABC" });
    expect(adaKunciApi()).toBe(true);
    expect(bacaTetapanApi().apikey).toBe("ABC");
  });
});

describe("kuota", () => {
  it("penuh bila tiada rekod", () => {
    expect(kuotaBaki(0)).toBe(7);
    expect(kuotaHarian(0).baki).toBe(800);
  });

  it("statusKuota gabung min + hari dari rekod tersimpan", () => {
    // Rekod dalam minit & hari yang sama dengan now=0.
    localStorage.setItem(
      "md_kuota",
      JSON.stringify({ minit: 0, kiraMinit: 3, hari: 0, kiraHari: 10 })
    );
    const s = statusKuota(0);
    expect(s.minitBaki).toBe(4); // 7 − 3
    expect(s.hariDigunakan).toBe(10);
    expect(s.hariHad).toBe(800);
  });

  it("kiraan minit tetap semula bila minit bertukar, harian kekal", () => {
    localStorage.setItem(
      "md_kuota",
      JSON.stringify({ minit: 0, kiraMinit: 7, hari: 0, kiraHari: 10 })
    );
    const nowMinitBaru = 90_000; // 1.5 minit, hari sama
    expect(kuotaBaki(nowMinitBaru)).toBe(7); // minit reset
    expect(kuotaHarian(nowMinitBaru).digunakan).toBe(10); // hari kekal
  });
});
