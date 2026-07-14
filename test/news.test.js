import { describe, it, expect, beforeEach } from "vitest";
import { jarakBerita, simpanBerita, bacaBerita, AMARAN_MINIT } from "../js/news.js";

beforeEach(() => {
  localStorage.clear();
});

describe("simpanBerita / bacaBerita", () => {
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
});

describe("jarakBerita", () => {
  const now = new Date("2026-01-14T12:00:00Z");

  it("ada:false bila tiada masa diset", () => {
    expect(jarakBerita(now)).toEqual({ ada: false });
  });

  it("bahaya bila berita dalam ±30 minit akan datang", () => {
    simpanBerita(new Date("2026-01-14T12:10:00Z")); // +10 min
    const r = jarakBerita(now);
    expect(r.ada).toBe(true);
    expect(r.bahaya).toBe(true);
    expect(r.lalu).toBe(false);
    expect(r.minit).toBeCloseTo(10, 1);
  });

  it("selamat bila berita lebih jauh dari AMARAN_MINIT", () => {
    simpanBerita(new Date("2026-01-14T13:00:00Z")); // +60 min
    const r = jarakBerita(now);
    expect(r.ada).toBe(true);
    expect(r.bahaya).toBe(false);
    expect(r.minit).toBeGreaterThan(AMARAN_MINIT);
  });

  it("kesan berita yang baru berlalu (masih dalam zon bahaya)", () => {
    simpanBerita(new Date("2026-01-14T11:55:00Z")); // -5 min
    const r = jarakBerita(now);
    expect(r.lalu).toBe(true);
    expect(r.bahaya).toBe(true);
    expect(r.minit).toBeLessThan(0);
  });
});
