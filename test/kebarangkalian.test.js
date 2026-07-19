import { describe, it, expect, beforeEach } from "vitest";
import {
  JALUR,
  MIN_SAMPEL,
  namaJalur,
  kumpulJalur,
  gabungSnapshot,
  kadarWilson,
  simpanSnapshot,
  bacaJalur,
  agregat,
  padamSnapshot,
} from "../js/kebarangkalian.js";

beforeEach(() => {
  localStorage.clear();
});

const dagang = (skor, hasil) => ({ skor, hasil });

describe("namaJalur", () => {
  it("petakan skor ke jalur; luar julat → null", () => {
    expect(namaJalur(75)).toBe("70-79");
    expect(namaJalur(80)).toBe("80-89");
    expect(namaJalur(100)).toBe("90-100");
    expect(namaJalur(69)).toBe(null);
    expect(namaJalur(101)).toBe(null);
  });
});

describe("kumpulJalur", () => {
  it("kira n & menang setiap jalur", () => {
    const j = kumpulJalur([
      dagang(72, "win"),
      dagang(75, "loss"),
      dagang(85, "win"),
      dagang(95, "win"),
    ]);
    expect(j["70-79"]).toEqual({ n: 2, menang: 1 });
    expect(j["80-89"]).toEqual({ n: 1, menang: 1 });
    expect(j["90-100"]).toEqual({ n: 1, menang: 1 });
  });

  it("dagangan tanpa skor atau di bawah ambang diabaikan", () => {
    const j = kumpulJalur([dagang(65, "win"), { hasil: "win" }, dagang(null, "win")]);
    for (const [b, a] of JALUR) expect(j[`${b}-${a}`]).toEqual({ n: 0, menang: 0 });
  });

  it("input tak sah → jalur kosong, tiada throw", () => {
    expect(kumpulJalur(null)["70-79"]).toEqual({ n: 0, menang: 0 });
  });
});

describe("gabungSnapshot", () => {
  it("jumlahkan merentas snapshot", () => {
    const g = gabungSnapshot([
      { "70-79": { n: 10, menang: 6 } },
      { "70-79": { n: 5, menang: 2 }, "80-89": { n: 3, menang: 3 } },
    ]);
    expect(g["70-79"]).toEqual({ n: 15, menang: 8 });
    expect(g["80-89"]).toEqual({ n: 3, menang: 3 });
  });

  it("snapshot null / kunci hilang tidak memecahkan agregat", () => {
    const g = gabungSnapshot([null, {}, { "90-100": { n: 2, menang: 1 } }]);
    expect(g["90-100"]).toEqual({ n: 2, menang: 1 });
    expect(g["70-79"]).toEqual({ n: 0, menang: 0 });
  });
});

describe("kadarWilson", () => {
  it("kira selang yang munasabah untuk sampel sederhana", () => {
    const w = kadarWilson(30, 50);
    expect(w.kadar).toBeCloseTo(0.6, 5);
    expect(w.bawah).toBeGreaterThan(0.45);
    expect(w.atas).toBeLessThan(0.74);
    expect(w.bawah).toBeLessThan(w.kadar);
    expect(w.atas).toBeGreaterThan(w.kadar);
  });

  it("sempadan sentiasa kekal dalam 0..1 walaupun pada kes melampau", () => {
    const semua = kadarWilson(5, 5);
    expect(semua.atas).toBeLessThanOrEqual(1);
    expect(semua.bawah).toBeGreaterThanOrEqual(0);
    const tiada = kadarWilson(0, 5);
    expect(tiada.bawah).toBeGreaterThanOrEqual(0);
    expect(tiada.atas).toBeLessThanOrEqual(1);
  });

  it("sampel kosong → null, bukan NaN", () => {
    expect(kadarWilson(0, 0)).toEqual({ kadar: null, bawah: null, atas: null });
  });

  it("sampel kecil menghasilkan selang jauh lebih lebar daripada sampel besar", () => {
    const kecil = kadarWilson(6, 10);
    const besar = kadarWilson(600, 1000);
    expect(kecil.atas - kecil.bawah).toBeGreaterThan(besar.atas - besar.bawah);
  });
});

describe("snapshot — keidempotenan", () => {
  it("simpan semula kunci SAMA menggantikan, tidak menggandakan sampel", () => {
    const jalur = { "70-79": { n: 40, menang: 24 } };
    simpanSnapshot("EURUSD", 12345, jalur);
    expect(agregat()["70-79"].n).toBe(40);
    // Jalankan backtest sekali lagi pada data yang sama.
    simpanSnapshot("EURUSD", 12345, jalur);
    simpanSnapshot("EURUSD", 12345, jalur);
    expect(agregat()["70-79"].n).toBe(40);
  });

  it("pasangan berbeza atau data lebih baharu berkumpul", () => {
    simpanSnapshot("EURUSD", 111, { "70-79": { n: 20, menang: 10 } });
    simpanSnapshot("GBPUSD", 111, { "70-79": { n: 15, menang: 9 } });
    simpanSnapshot("EURUSD", 222, { "70-79": { n: 5, menang: 3 } });
    expect(agregat()["70-79"]).toEqual({ n: 40, menang: 22 });
  });

  it("padamSnapshot mengosongkan agregat", () => {
    simpanSnapshot("EURUSD", 111, { "70-79": { n: 20, menang: 10 } });
    padamSnapshot();
    expect(agregat()["70-79"]).toEqual({ n: 0, menang: 0 });
  });
});

describe("bacaJalur — kejujuran sampel", () => {
  it(`di bawah ${MIN_SAMPEL} sampel → cukup:false`, () => {
    simpanSnapshot("EURUSD", 1, { "80-89": { n: MIN_SAMPEL - 1, menang: 20 } });
    const r = bacaJalur(85);
    expect(r.cukup).toBe(false);
    expect(r.n).toBe(MIN_SAMPEL - 1);
    expect(r.min).toBe(MIN_SAMPEL);
  });

  it("pada atau melebihi minimum → cukup:true dengan kadar & selang", () => {
    simpanSnapshot("EURUSD", 1, { "80-89": { n: 50, menang: 30 } });
    const r = bacaJalur(85);
    expect(r.cukup).toBe(true);
    expect(r.kadar).toBeCloseTo(0.6, 5);
    expect(r.bawah).toBeLessThan(r.kadar);
    expect(r.atas).toBeGreaterThan(r.kadar);
    expect(r.nama).toBe("80-89");
  });

  it("skor di bawah ambang masuk → tiada jalur, tidak mencukupi", () => {
    const r = bacaJalur(55);
    expect(r.nama).toBe(null);
    expect(r.cukup).toBe(false);
  });

  it("tiada snapshot langsung → n 0, cukup:false", () => {
    const r = bacaJalur(85);
    expect(r.n).toBe(0);
    expect(r.cukup).toBe(false);
  });
});
