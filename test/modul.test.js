import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";

// Ujian smoke: setiap modul mesti boleh diimport.
//
// Ujian unit hanya mengimport modul yang diujinya, jadi modul yang dipautkan ke UI
// (dashboard, scanner, kalkulator) boleh rosak — import yang tertinggal, eksport yang
// dinamakan salah, kebergantungan bulat — tanpa satu pun ujian menjadi merah, dan
// kegagalan itu hanya muncul sebagai skrin kosong dalam pelayar. Ini menangkapnya.
//
// Modul yang menyentuh DOM pada peringkat modul dikecualikan: ia memerlukan pelayar,
// bukan Node, dan dilindungi oleh semakan muat app di bawah.
const HANYA_DOM = new Set(["app.js"]);

const fail = readdirSync(new URL("../js", import.meta.url))
  .filter((f) => f.endsWith(".js"))
  .filter((f) => !HANYA_DOM.has(f))
  .sort();

describe("smoke modul", () => {
  it("menemui set modul yang dijangka", () => {
    expect(fail.length).toBeGreaterThan(20);
    expect(fail).toContain("scoring.js");
    expect(fail).toContain("kos.js");
    expect(fail).toContain("scanner.js");
  });

  for (const f of fail) {
    it(`${f} boleh diimport & mengeksport sesuatu`, async () => {
      const m = await import(`../js/${f}`);
      expect(Object.keys(m).length).toBeGreaterThan(0);
    });
  }
});

describe("kontrak eksport yang disandarkan UI", () => {
  it("dashboard mendedahkan renderDashboard", async () => {
    const m = await import("../js/dashboard.js");
    expect(typeof m.renderDashboard).toBe("function");
  });

  it("scanner mendedahkan renderScanner", async () => {
    const m = await import("../js/scanner.js");
    expect(typeof m.renderScanner).toBe("function");
  });

  it("jurnal mendedahkan renderJurnal", async () => {
    const m = await import("../js/journal.js");
    expect(typeof m.renderJurnal).toBe("function");
  });

  it("kalkulator mendedahkan renderKalkulator", async () => {
    const m = await import("../js/calculator.js");
    expect(typeof m.renderKalkulator).toBe("function");
  });
});
