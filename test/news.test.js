import { describe, it, expect, beforeEach } from "vitest";
import {
  jarakBerita,
  simpanBerita,
  bacaBerita,
  bacaAcara,
  simpanAcara,
  padamAcara,
  jarakAcara,
  AMARAN_MINIT,
} from "../js/news.js";

beforeEach(() => {
  localStorage.clear();
});

const acara = (nama, impak, iso, mataWang = "USD") => ({
  id: nama,
  nama,
  mataWang,
  impak,
  masa: iso,
});

describe("simpanAcara / bacaAcara", () => {
  it("simpan berbilang acara dan pulangkan diisih menaik ikut masa", () => {
    simpanAcara([
      acara("NFP", "tinggi", "2026-01-14T15:00:00Z"),
      acara("PMI", "sederhana", "2026-01-14T13:00:00Z"),
    ]);
    const a = bacaAcara();
    expect(a.map((x) => x.nama)).toEqual(["PMI", "NFP"]);
    expect(a[1].impak).toBe("tinggi");
  });

  it("acara tanpa masa sah ditapis keluar", () => {
    simpanAcara([acara("Baik", "tinggi", "2026-01-14T15:00:00Z"), { nama: "Rosak" }]);
    expect(bacaAcara()).toHaveLength(1);
  });

  it("impak tak dikenali jatuh ke 'tinggi' (selamat secara lalai)", () => {
    simpanAcara([{ id: "x", nama: "X", impak: "entah", masa: "2026-01-14T15:00:00Z" }]);
    expect(bacaAcara()[0].impak).toBe("tinggi");
  });

  it("senarai kosong / null mengosongkan storan", () => {
    simpanAcara([acara("NFP", "tinggi", "2026-01-14T15:00:00Z")]);
    simpanAcara([]);
    expect(bacaAcara()).toEqual([]);
  });

  it("padamAcara buang satu sahaja", () => {
    simpanAcara([
      acara("NFP", "tinggi", "2026-01-14T15:00:00Z"),
      acara("PMI", "sederhana", "2026-01-14T13:00:00Z"),
    ]);
    padamAcara("NFP");
    expect(bacaAcara().map((x) => x.nama)).toEqual(["PMI"]);
  });

  it("JSON rosak dalam storan → array kosong, tiada throw", () => {
    localStorage.setItem("forex_news_events", "{bukan json");
    expect(bacaAcara()).toEqual([]);
  });
});

describe("migrasi dari format lama", () => {
  it("forex_news_next lama ditukar jadi satu acara impak tinggi", () => {
    localStorage.setItem("forex_news_next", "2026-01-14T15:00:00.000Z");
    const a = bacaAcara();
    expect(a).toHaveLength(1);
    expect(a[0].impak).toBe("tinggi");
    expect(new Date(a[0].masa).toISOString()).toBe("2026-01-14T15:00:00.000Z");
    // Kunci lama dipadam supaya migrasi tidak berulang.
    expect(localStorage.getItem("forex_news_next")).toBeNull();
    expect(bacaAcara()).toHaveLength(1);
  });

  it("nilai lama tak sah tidak mencipta acara", () => {
    localStorage.setItem("forex_news_next", "bukan-tarikh");
    expect(bacaAcara()).toEqual([]);
  });
});

describe("jarakAcara", () => {
  const now = new Date("2026-01-14T12:00:00Z");

  it("acara impak tinggi dalam 30 min → bahaya", () => {
    simpanAcara([acara("CPI", "tinggi", "2026-01-14T12:18:00Z")]);
    const r = jarakAcara(now);
    expect(r.bahaya).toBe(true);
    expect(r.seterusnya.nama).toBe("CPI");
    expect(r.senarai[0].minit).toBeCloseTo(18, 1);
  });

  it("acara impak sederhana dalam zonnya → amaran, BUKAN bahaya", () => {
    simpanAcara([acara("PMI", "sederhana", "2026-01-14T12:10:00Z")]);
    const r = jarakAcara(now);
    expect(r.bahaya).toBe(false);
    expect(r.amaran).toBe(true);
  });

  it("acara impak rendah tidak pernah menggate", () => {
    simpanAcara([acara("Ucapan", "rendah", "2026-01-14T12:01:00Z")]);
    const r = jarakAcara(now);
    expect(r.bahaya).toBe(false);
    expect(r.amaran).toBe(false);
    expect(r.senarai[0].bahaya).toBe(false);
  });

  it("acara jauh → selamat, seterusnya menunjuk acara akan datang", () => {
    simpanAcara([acara("NFP", "tinggi", "2026-01-14T16:00:00Z")]);
    const r = jarakAcara(now);
    expect(r.bahaya).toBe(false);
    expect(r.seterusnya.nama).toBe("NFP");
  });

  it("acara impak tinggi yang baru berlalu masih bahaya", () => {
    simpanAcara([acara("CPI", "tinggi", "2026-01-14T11:50:00Z")]);
    const r = jarakAcara(now);
    expect(r.bahaya).toBe(true);
    expect(r.senarai[0].lalu).toBe(true);
  });

  it("satu acara bahaya antara banyak sudah cukup menggate", () => {
    simpanAcara([
      acara("Jauh", "tinggi", "2026-01-14T20:00:00Z"),
      acara("Dekat", "tinggi", "2026-01-14T12:05:00Z"),
    ]);
    expect(jarakAcara(now).bahaya).toBe(true);
  });

  it("tiada acara → tidak bahaya, seterusnya null", () => {
    const r = jarakAcara(now);
    expect(r.bahaya).toBe(false);
    expect(r.seterusnya).toBe(null);
    expect(r.senarai).toEqual([]);
  });
});

// API lama masih dipakai checklist.js & app.js — mesti kekal berfungsi.
describe("jimat-belakang: simpanBerita / bacaBerita / jarakBerita", () => {
  const now = new Date("2026-01-14T12:00:00Z");

  it("simpan & baca semula sebagai Date", () => {
    const t = new Date("2026-01-14T15:00:00Z");
    simpanBerita(t);
    expect(bacaBerita().getTime()).toBe(t.getTime());
  });

  it("null memadam masa tersimpan", () => {
    simpanBerita(new Date("2026-01-14T15:00:00Z"));
    simpanBerita(null);
    expect(bacaBerita()).toBeNull();
  });

  it("nilai tak sah diabaikan", () => {
    simpanBerita("bukan-tarikh");
    expect(bacaBerita()).toBeNull();
  });

  it("padam berita tidak memusnahkan acara impak lain", () => {
    simpanAcara([acara("PMI", "sederhana", "2026-01-14T13:00:00Z")]);
    simpanBerita(new Date("2026-01-14T15:00:00Z"));
    simpanBerita(null);
    expect(bacaAcara().map((x) => x.nama)).toEqual(["PMI"]);
  });

  it("ada:false bila tiada masa diset", () => {
    expect(jarakBerita(now)).toEqual({ ada: false });
  });

  it("bahaya bila berita dalam ±30 minit akan datang", () => {
    simpanBerita(new Date("2026-01-14T12:10:00Z"));
    const r = jarakBerita(now);
    expect(r.ada).toBe(true);
    expect(r.bahaya).toBe(true);
    expect(r.lalu).toBe(false);
    expect(r.minit).toBeCloseTo(10, 1);
  });

  it("selamat bila berita lebih jauh dari AMARAN_MINIT", () => {
    simpanBerita(new Date("2026-01-14T13:00:00Z"));
    const r = jarakBerita(now);
    expect(r.ada).toBe(true);
    expect(r.bahaya).toBe(false);
    expect(r.minit).toBeGreaterThan(AMARAN_MINIT);
  });

  it("kesan berita yang baru berlalu (masih dalam zon bahaya)", () => {
    simpanBerita(new Date("2026-01-14T11:55:00Z"));
    const r = jarakBerita(now);
    expect(r.lalu).toBe(true);
    expect(r.bahaya).toBe(true);
    expect(r.minit).toBeLessThan(0);
  });
});
