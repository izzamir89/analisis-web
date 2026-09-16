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
  it("petakan skor TERAS ke jalur; luar julat → null", () => {
    expect(namaJalur(65)).toBe("60-69");
    expect(namaJalur(75)).toBe("70-79");
    expect(namaJalur(85)).toBe("80-89");
    expect(namaJalur(100)).toBe("90-100");
    expect(namaJalur(59)).toBe(null);
    expect(namaJalur(101)).toBe(null);
  });
});

describe("kumpulJalur", () => {
  it("kira n & menang setiap jalur", () => {
    const j = kumpulJalur([
      dagang(62, "win"),
      dagang(75, "loss"),
      dagang(75, "win"),
      dagang(85, "win"),
    ]);
    expect(j["60-69"]).toEqual({ n: 1, menang: 1 });
    expect(j["70-79"]).toEqual({ n: 2, menang: 1 });
    expect(j["80-89"]).toEqual({ n: 1, menang: 1 });
  });

  it("dagangan tanpa skor atau di bawah ambang diabaikan", () => {
    const j = kumpulJalur([dagang(55, "win"), { hasil: "win" }, dagang(null, "win")]);
    for (const [b, a] of JALUR) expect(j[`${b}-${a}`]).toEqual({ n: 0, menang: 0 });
  });

  it("input tak sah → jalur kosong, tiada throw", () => {
    expect(kumpulJalur(null)["70-79"]).toEqual({ n: 0, menang: 0 });
  });

  it("utamakan skorTeras berbanding skor bila kedua-duanya ada", () => {
    // Skor penuh 85 tetapi teras 75 (berita menyumbang 10) → mesti jatuh ke 70-79.
    const j = kumpulJalur([{ skor: 85, skorTeras: 75, hasil: "win" }]);
    expect(j["70-79"]).toEqual({ n: 1, menang: 1 });
    expect(j["80-89"]).toEqual({ n: 0, menang: 0 });
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
    const g = gabungSnapshot([null, {}, { "80-89": { n: 2, menang: 1 } }]);
    expect(g["80-89"]).toEqual({ n: 2, menang: 1 });
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
  it("simpan semula mod+pasangan SAMA menggantikan, tidak menggandakan sampel", () => {
    const jalur = { "70-79": { n: 40, menang: 24 } };
    simpanSnapshot("swing", "EURUSD", jalur, { tsData: 12345 });
    expect(agregat("swing")["70-79"].n).toBe(40);
    simpanSnapshot("swing", "EURUSD", jalur, { tsData: 12345 });
    simpanSnapshot("swing", "EURUSD", jalur, { tsData: 12345 });
    expect(agregat("swing")["70-79"].n).toBe(40);
  });

  // Ini pepijat yang dibetulkan: dalam v1 cap masa data ialah sebahagian kunci, jadi
  // menjalankan backtest semula esok mencipta sampel "baharu" walaupun dagangannya
  // hampir sepenuhnya bertindih — n menggelembung dan selang Wilson jadi palsu-sempit.
  it("backtest semula pada data LEBIH BAHARU menggantikan, bukan menambah", () => {
    simpanSnapshot("swing", "EURUSD", { "70-79": { n: 20, menang: 10 } }, { tsData: 111 });
    simpanSnapshot("swing", "EURUSD", { "70-79": { n: 22, menang: 12 } }, { tsData: 999 });
    expect(agregat("swing")["70-79"]).toEqual({ n: 22, menang: 12 });
  });

  it("pasangan berbeza dalam mod sama berkumpul", () => {
    simpanSnapshot("swing", "EURUSD", { "70-79": { n: 20, menang: 10 } });
    simpanSnapshot("swing", "GBPUSD", { "70-79": { n: 15, menang: 9 } });
    expect(agregat("swing")["70-79"]).toEqual({ n: 35, menang: 19 });
  });

  // Pepijat kedua yang dibetulkan: scalp M5 dan swing Harian pernah berkongsi kolam
  // yang sama, jadi "kadar menang" pada skrin Swing boleh berasal dari dagangan Scalp.
  it("mod berbeza TIDAK bercampur", () => {
    simpanSnapshot("swing", "EURUSD", { "70-79": { n: 20, menang: 16 } });
    simpanSnapshot("scalp", "EURUSD", { "70-79": { n: 50, menang: 10 } });
    expect(agregat("swing")["70-79"]).toEqual({ n: 20, menang: 16 });
    expect(agregat("scalp")["70-79"]).toEqual({ n: 50, menang: 10 });
  });

  it("padamSnapshot mengosongkan agregat", () => {
    simpanSnapshot("swing", "EURUSD", { "70-79": { n: 20, menang: 10 } });
    padamSnapshot();
    expect(agregat("swing")["70-79"]).toEqual({ n: 0, menang: 0 });
  });
});

describe("bacaJalur — kejujuran sampel", () => {
  it(`di bawah ${MIN_SAMPEL} sampel → cukup:false`, () => {
    simpanSnapshot("swing", "EURUSD", { "80-89": { n: MIN_SAMPEL - 1, menang: 20 } });
    const r = bacaJalur(85, "swing");
    expect(r.cukup).toBe(false);
    expect(r.n).toBe(MIN_SAMPEL - 1);
    expect(r.min).toBe(MIN_SAMPEL);
  });

  it("pada atau melebihi minimum → cukup:true dengan kadar & selang", () => {
    simpanSnapshot("swing", "EURUSD", { "80-89": { n: 50, menang: 30 } });
    const r = bacaJalur(85, "swing");
    expect(r.cukup).toBe(true);
    expect(r.kadar).toBeCloseTo(0.6, 5);
    expect(r.bawah).toBeLessThan(r.kadar);
    expect(r.atas).toBeGreaterThan(r.kadar);
    expect(r.nama).toBe("80-89");
    expect(r.pasangan).toEqual(["EURUSD"]);
  });

  it("skor teras di bawah ambang masuk → tiada jalur, tidak mencukupi", () => {
    const r = bacaJalur(45, "swing");
    expect(r.nama).toBe(null);
    expect(r.cukup).toBe(false);
  });

  it("tiada snapshot langsung → n 0, cukup:false", () => {
    const r = bacaJalur(85, "swing");
    expect(r.n).toBe(0);
    expect(r.cukup).toBe(false);
  });

  it("membaca mod yang salah tidak meminjam sampel mod lain", () => {
    simpanSnapshot("scalp", "EURUSD", { "80-89": { n: 80, menang: 60 } });
    expect(bacaJalur(85, "swing").n).toBe(0);
    expect(bacaJalur(85, "scalp").n).toBe(80);
  });
});
