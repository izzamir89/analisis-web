import { describe, it, expect } from "vitest";
import {
  MIN_DAGANGAN,
  masaPisah,
  bahagiDagangan,
  statSegmen,
  walkForward,
  penilaian,
} from "../js/walkforward.js";

describe("masaPisah", () => {
  const c = Array.from({ length: 100 }, (_, i) => ({ t: i * 1000, o: 1, h: 1, l: 1, c: 1 }));

  it("memisah ikut indeks lilin, bukan bilangan dagangan", () => {
    expect(masaPisah(c, 0.7)).toBe(70 * 1000);
    expect(masaPisah(c, 0.5)).toBe(50 * 1000);
  });

  it("siri kosong → null", () => {
    expect(masaPisah([], 0.7)).toBe(null);
  });
});

describe("bahagiDagangan", () => {
  it("dagangan pada sempadan tepat tergolong dalam LATIH", () => {
    const { latih, uji } = bahagiDagangan([{ ts: 50 }, { ts: 100 }, { ts: 150 }], 100);
    expect(latih.map((t) => t.ts)).toEqual([50, 100]);
    expect(uji.map((t) => t.ts)).toEqual([150]);
  });

  it("input tak sah → dua segmen kosong", () => {
    expect(bahagiDagangan(null, 100)).toEqual({ latih: [], uji: [] });
  });
});

describe("statSegmen", () => {
  const menang = (n) =>
    Array.from({ length: n }, (_, i) => ({ hasil: "win", rr: 2, rSebenar: 2, ts: i }));

  it(`di bawah ${MIN_DAGANGAN} dagangan → cukup:false`, () => {
    expect(statSegmen(menang(MIN_DAGANGAN - 1)).cukup).toBe(false);
    expect(statSegmen(menang(MIN_DAGANGAN)).cukup).toBe(true);
  });

  it("mengira expectancy dari R sebenar", () => {
    const s = statSegmen([
      { hasil: "win", rr: 2, rSebenar: 1.9, ts: 1 },
      { hasil: "loss", rr: 2, rSebenar: -1.1, ts: 2 },
    ]);
    expect(s.expectancyR).toBeCloseTo(0.4, 6);
    expect(s.n).toBe(2);
  });
});

describe("walkForward", () => {
  // Lilin naik secara berperingkat supaya BUY sentiasa mencapai TP — memberi enjin
  // maya yang deterministik untuk menguji mekanik pemisahan, bukan keuntungan.
  const naik = Array.from({ length: 400 }, (_, i) => ({
    t: i * 3600000,
    o: 1 + i * 0.001,
    h: 1 + i * 0.001 + 0.02,
    l: 1 + i * 0.001 - 0.001,
    c: 1 + i * 0.001,
  }));

  // skorFn yang ambang-sedar: skor 70 tetap, jadi ambang ≤70 berdagang, >70 tidak.
  const buatSkorFn = (ambang) => () => ({
    verdict: ambang <= 70 ? "BUY" : "WAIT",
    skor: 70,
    skorTerasNorm: 74,
  });

  it("menghasilkan satu baris setiap ambang calon, dengan segmen latih & uji", async () => {
    const r = await walkForward(
      naik,
      { atrPeriod: 2, mula: 3, slMult: 1, rr: 2 },
      { buatSkorFn, ambangCalon: [65, 70, 75] }
    );
    expect(r.jadual.map((b) => b.ambang)).toEqual([65, 70, 75]);
    for (const b of r.jadual) {
      expect(b).toHaveProperty("latih");
      expect(b).toHaveProperty("uji");
    }
    // Ambang 75 menyekat semua dagangan.
    expect(r.jadual.find((b) => b.ambang === 75).latih.n).toBe(0);
  });

  it("memilih ambang menggunakan segmen LATIH sahaja", async () => {
    const r = await walkForward(
      naik,
      { atrPeriod: 2, mula: 3, slMult: 1, rr: 2 },
      { buatSkorFn, ambangCalon: [65, 75] }
    );
    // Hanya 65 mengumpul dagangan, jadi ia mesti dipilih — dan hanya jika cukup sampel.
    if (r.terbaik) {
      expect(r.terbaik.ambang).toBe(65);
      expect(r.terbaik.latih.cukup).toBe(true);
    }
  });

  it("tanpa buatSkorFn → pulang kosong, tiada throw", async () => {
    const r = await walkForward(naik, {}, {});
    expect(r.jadual).toEqual([]);
    expect(r.terbaik).toBe(null);
  });

  it("melaporkan kemajuan sehingga 1", async () => {
    let akhir = 0;
    await walkForward(
      naik,
      { atrPeriod: 2, mula: 3, slMult: 1, rr: 2 },
      { buatSkorFn, ambangCalon: [70], onKemajuan: (f) => (akhir = f) }
    );
    expect(akhir).toBe(1);
  });
});

describe("penilaian — kejujuran tentang apa yang data tunjuk", () => {
  const buat = (latihExp, ujiExp, ujiN = 50) => ({
    ambang: 70,
    latih: { cukup: true, expectancyR: latihExp, n: 100 },
    uji: { cukup: ujiN >= MIN_DAGANGAN, expectancyR: ujiExp, n: ujiN },
  });

  it("expectancy uji negatif → gagal, dinyatakan terus terang", () => {
    const p = penilaian(buat(0.5, -0.2));
    expect(p.status).toBe("gagal");
    expect(p.teks).toContain("memuatkan bunyi bising");
  });

  it("uji bertahan tetapi separuh → lemah", () => {
    expect(penilaian(buat(0.6, 0.2)).status).toBe("lemah");
  });

  it("uji hampir sama dengan latih → bertahan", () => {
    expect(penilaian(buat(0.4, 0.38)).status).toBe("bertahan");
  });

  it("segmen uji terlalu kecil → 'tidak tahu', bukan tuntutan palsu", () => {
    const p = penilaian(buat(0.5, 0.9, 5));
    expect(p.status).toBe("tidak-tahu");
    expect(p.teks).toContain("belum boleh disahkan");
  });

  it("tiada ambang layak → 'tiada'", () => {
    expect(penilaian(null).status).toBe("tiada");
  });
});
