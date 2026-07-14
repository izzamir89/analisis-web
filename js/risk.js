// Pengurus risiko — 100% tempatan & tulen. Guna data jurnal (posisi terbuka & loss harian).

// Pendedahan bersih setiap mata wang dari posisi TERBUKA (hasil === "open").
// Buy XXXYYY → +1 XXX, −1 YYY; Sell → sebaliknya. Berat = saiz lot jika ada (lalai 1).
// Guna untuk kesan pendedahan berkorelasi (cth long EURUSD + long GBPUSD = terdedah USD berganda).
export function pendedahanMataWang(trades) {
  const net = {};
  const tambah = (mw, nilai) => {
    net[mw] = (net[mw] || 0) + nilai;
  };
  for (const e of trades) {
    if (e.hasil !== "open") continue;
    const id = String(e.pairId || "");
    if (id.length < 6) continue;
    const base = id.slice(0, 3);
    const quote = id.slice(3, 6);
    const berat = Number(e.lot) > 0 ? Number(e.lot) : 1;
    const arah = e.arah === "Sell" ? -1 : 1;
    tambah(base, arah * berat);
    tambah(quote, -arah * berat);
  }
  // Buang mata wang yang net ~0 (bulatkan halus).
  for (const k of Object.keys(net)) {
    net[k] = Math.round(net[k] * 100) / 100;
    if (net[k] === 0) delete net[k];
  }
  return net;
}

// Amaran pendedahan: mata wang dengan |net| ≥ ambang (lalai 2 "unit").
export function amaranPendedahan(trades, ambang = 2) {
  const net = pendedahanMataWang(trades);
  return Object.entries(net)
    .filter(([, v]) => Math.abs(v) >= ambang)
    .map(([mw, v]) => ({ mataWang: mw, net: v, arah: v > 0 ? "long" : "short" }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

// Adakah dua cap masa jatuh pada hari kalendar tempatan yang sama?
function hariSama(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Baki bajet risiko harian: jumlahkan `amaunRisiko` bagi dagangan KALAH hari ini
// (anggap SL kena = kerugian penuh risiko yang dirancang) berbanding had.
// Pulang { digunakan, had, baki, melebihi, peratus }.
export function bakiRisikoHarian(trades, now, had) {
  const nowD = now instanceof Date ? now : new Date(now);
  let digunakan = 0;
  for (const e of trades) {
    if (e.hasil !== "loss") continue;
    if (!e.ts) continue;
    if (!hariSama(new Date(e.ts), nowD)) continue;
    const risiko = Number(e.amaunRisiko);
    if (risiko > 0) digunakan += risiko;
  }
  digunakan = Math.round(digunakan * 100) / 100;
  const adaHad = Number(had) > 0;
  const baki = adaHad ? Math.round((had - digunakan) * 100) / 100 : null;
  return {
    digunakan,
    had: adaHad ? Number(had) : null,
    baki,
    melebihi: adaHad ? digunakan >= had : false,
    peratus: adaHad ? Math.min(100, Math.round((digunakan / had) * 100)) : null,
  };
}
