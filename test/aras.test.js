import { describe, it, expect } from "vitest";
import { arasSR, zonSupplyDemand, kedudukanAras } from "../js/aras.js";

const c = (t, o, h, l, cl) => ({ t, o, h, l, c: cl });

// Zigzag yang menyentuh ~110 tiga kali (rintangan) dan ~90 dua kali (sokongan),
// dengan tutup terakhir di tengah.
function zigzag() {
  const s = [];
  let t = 0;
  const kitar = [
    [100, 110.0, 99, 108],
    [108, 109, 90.2, 92],
    [92, 110.3, 91, 108],
    [108, 109, 90.0, 92],
    [92, 109.8, 91, 100],
  ];
  for (const [o, h, l, cl] of kitar) {
    s.push(c(t++, o, h - 1, l + 1, (o + cl) / 2)); // lilin pengapit
    s.push(c(t++, o, h, l, cl)); // lilin ayun
    s.push(c(t++, cl, h - 1, l + 1, cl)); // lilin pengapit
  }
  return s;
}

describe("arasSR", () => {
  it("kelompokkan ayun berdekatan jadi satu paras dan kira sentuhan", () => {
    const s = zigzag();
    const a = arasSR(s, 5, 1, 0.5); // toleransi 2.5 → 110.0/110.3/109.8 satu kelompok
    const r = a.rintangan[0];
    expect(r).toBeTruthy();
    expect(r.harga).toBeGreaterThan(109);
    expect(r.harga).toBeLessThan(111);
    expect(r.sentuhan).toBeGreaterThanOrEqual(2);
  });

  it("sokongan di bawah harga, rintangan di atas, diisih dari terdekat", () => {
    const s = zigzag();
    const a = arasSR(s, 5, 1, 0.5);
    const harga = s[s.length - 1].c;
    for (const x of a.sokongan) expect(x.harga).toBeLessThan(harga);
    for (const x of a.rintangan) expect(x.harga).toBeGreaterThan(harga);
    for (let i = 1; i < a.rintangan.length; i++) {
      expect(a.rintangan[i].harga).toBeGreaterThanOrEqual(a.rintangan[i - 1].harga);
    }
  });

  it("ATR tiada atau data pendek → paras kosong, tiada throw", () => {
    expect(arasSR(zigzag(), null)).toEqual({ sokongan: [], rintangan: [] });
    expect(arasSR([c(0, 1, 2, 0, 1)], 1)).toEqual({ sokongan: [], rintangan: [] });
    expect(arasSR(null, 1)).toEqual({ sokongan: [], rintangan: [] });
  });
});

describe("zonSupplyDemand", () => {
  it("lilin impuls naik → zon demand pada lilin asas sebelumnya", () => {
    const s = [c(0, 100, 101, 99, 100), c(1, 100, 100.5, 99.5, 100), c(2, 100, 110, 99, 109)];
    const z = zonSupplyDemand(s, 2);
    expect(z[0].jenis).toBe("demand");
    expect(z[0].atas).toBe(100.5);
    expect(z[0].bawah).toBe(99.5);
    expect(z[0].i).toBe(1);
  });

  it("lilin impuls turun → zon supply", () => {
    const s = [c(0, 100, 101, 99, 100), c(1, 100, 100.5, 99.5, 100), c(2, 100, 101, 90, 91)];
    expect(zonSupplyDemand(s, 2)[0].jenis).toBe("supply");
  });

  it("tiada impuls → kosong; input tak sah → kosong", () => {
    const rata = Array.from({ length: 10 }, (_, i) => c(i, 100, 100.5, 99.5, 100));
    expect(zonSupplyDemand(rata, 2)).toEqual([]);
    expect(zonSupplyDemand(null, 2)).toEqual([]);
    expect(zonSupplyDemand(rata, null)).toEqual([]);
  });
});

describe("kedudukanAras", () => {
  const aras = { sokongan: [{ harga: 95, sentuhan: 3 }], rintangan: [{ harga: 101, sentuhan: 2 }] };

  it("kesan hampir rintangan dalam 0.5 × ATR", () => {
    const k = kedudukanAras(100.8, aras, 1);
    expect(k.hampirRintangan).toBe(true);
    expect(k.hampirSokongan).toBe(false);
    expect(k.jarakRintangan).toBeCloseTo(0.2, 5);
  });

  it("kesan hampir sokongan", () => {
    const k = kedudukanAras(95.3, aras, 1);
    expect(k.hampirSokongan).toBe(true);
    expect(k.hampirRintangan).toBe(false);
  });

  it("di tengah → tiada yang hampir", () => {
    const k = kedudukanAras(98, aras, 1);
    expect(k.hampirSokongan).toBe(false);
    expect(k.hampirRintangan).toBe(false);
  });

  it("kesan harga dalam zon", () => {
    const zon = [{ atas: 99, bawah: 97, jenis: "demand", i: 4 }];
    expect(kedudukanAras(98, aras, 1, zon).dalamZon.jenis).toBe("demand");
    expect(kedudukanAras(96, aras, 1, zon).dalamZon).toBe(null);
  });

  it("input tak sah → objek kosong, tiada throw", () => {
    const k = kedudukanAras(null, aras, 1);
    expect(k.hampirRintangan).toBe(false);
    expect(k.sokongan).toBe(null);
    expect(kedudukanAras(100, null, 1).rintangan).toBe(null);
  });
});
