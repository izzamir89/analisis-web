# Analisis Web — Forex TradingView (PWA)

Aplikasi web mudah alih (PWA) untuk analisis forex: **carta, screener, kalkulator dagangan, panel Go/No-Go, alert & jurnal** — dibina di sekeliling widget rasmi [TradingView](https://www.tradingview.com/).

> **100% tempatan.** Tiada backend, tiada AI, tiada API key. Semua pengiraan berlaku di peranti anda; jurnal & alert disimpan dalam `localStorage`. Data harga/carta datang terus dari TradingView.

Ini "adik ringan" kepada projek engine AI `analysisChart` — beberapa nilai dicermin (senarai pasangan `PAIRS`, nisbah R:R minimum, preset screener) tetapi tanpa kos token AI.

## Skrin

| Tab               | Fungsi                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 📋 **Watchlist**  | Jam sesi pasaran berbilang zon, badge "status masuk order" (kecairan sesi), ticker harga, tolok teknikal setiap pasangan |
| 🔎 **Screener**   | Senarai screener forex, heat map kekuatan mata wang, kadar silang, kalendar ekonomi                                      |
| 🧮 **Kalkulator** | Kira SL/TP dari ATR, saiz lot dari risiko %, amaran R:R < 1.5, **Pengurus Risiko** (had kerugian harian + pendedahan berkorelasi), **akaun bukan-USD**, **setup tersimpan** → simpan ke Jurnal |
| 🔔 **Alert**      | Alert harga ringkas (lihat had di bawah)                                                                                 |
| 📒 **Jurnal**     | **Analisis prestasi** (expectancy, profit factor, streak, keluk ekuiti, kadar menang ikut sesi/pasangan/arah), medan "R sebenar", eksport/import JSON |
| **Carta**         | Carta lilin penuh + RSI/MACD/Bollinger, countdown tutup lilin, panel **Go/No-Go** (item boleh-ubah), input masa berita merah |
| **MTF**           | Penjajaran multi-timeframe — tolok teknikal 1J/4J/Harian bersebelahan untuk konfluens trend (dari kad Watchlist)          |

### Metrik jurnal (edge-finder)

- **Expectancy (R)** — purata R setiap dagangan; >0 bermaksud sistem positif.
- **Profit factor** — jumlah untung R ÷ jumlah rugi R.
- **Keluk ekuiti** — R terkumpul ikut kronologi (sparkline SVG tempatan).
- **Pecahan ikut sesi/pasangan/arah** — cari _di mana_ anda paling untung.
- **R sebenar** (pilihan) tiap baris untuk ketepatan; kosong = dianggarkan (menang +R:R, kalah −1, BE 0). Sesi diderive dari cap masa, jadi entri lama pun dikira.

## Jalankan setempat

Tiada langkah build — sajikan folder ini dengan mana-mana pelayan HTTP statik:

```bash
python3 -m http.server 8080
# kemudian buka http://localhost:8080
```

Service worker (PWA) perlu **HTTPS** di produksi (atau `localhost` semasa pembangunan).

## Pembangunan

```bash
npm install        # pasang alat pembangunan (Vitest, ESLint, Prettier)
npm test           # jalankan ujian unit (Vitest)
npm run test:watch # ujian mod perhati
npm run lint       # ESLint + semak format Prettier
npm run format     # betulkan format automatik
```

Ujian meliputi fungsi tulen berisiko-senyap: logik sesi/timing ([`js/sessions.js`](js/sessions.js)), kalkulator dagangan ([`js/calculator.js`](js/calculator.js)) & jarak berita ([`js/news.js`](js/news.js)).

## Struktur

```
index.html            Shell + navigasi bawah
service-worker.js     Cache app-shell (stale-while-revalidate)
manifest.webmanifest  Metadata PWA
css/app.css           Gaya (tema gelap)
js/
  app.js        Router hash + susun atur skrin
  widgets.js    Pembina widget TradingView (embed rasmi)
  pairs.js      Senarai pasangan forex → simbol TradingView
  sessions.js   Sesi pasaran, status kecairan, timing tutup lilin, pasaran-tutup
  calculator.js SL/TP + saiz lot + amaran R:R + panel risiko + setup + akaun bukan-USD
  news.js       Jarak ke berita impak tinggi
  checklist.js  Panel Go/No-Go (sesi + timing + berita + R:R, item boleh-ubah)
  journal.js    Jurnal dagangan (localStorage) + eksport/import + analisis prestasi
  analytics.js  Metrik edge-finder (tulen): expectancy, PF, kumpulan, ekuiti, streak
  risk.js       Pendedahan mata wang & bajet risiko harian (tulen)
  alerts.js     Alert harga ringkas
  store.js      Helper localStorage + escape HTML (dikongsi)
test/           Ujian Vitest (sessions, calculator, news, analytics, risk)
```

## Had yang perlu diketahui (jujur)

- **Alert harga** guna [frankfurter.dev](https://frankfurter.dev) (kadar **harian** ECB): hanya berjalan semasa app dibuka, **bukan intraday**, dan **tiada emas (XAUUSD)**. Untuk alert masa-nyata sebenar, guna ikon loceng dalam carta TradingView (perlu akaun TV percuma).
- **Kalendar berita** ialah iframe paparan — tak boleh dibaca secara programatik. Anda **salin sekali** masa berita merah seterusnya ke panel berita; app kira jarak masa secara tempatan untuk menyuap Go/No-Go.
- **Timing tutup lilin harian** dianggap **21:00 UTC** (≈17:00 New York, waktu piawai). Broker berbeza mungkin ada offset sedikit berbeza.
- Status "masuk order" berdasarkan **kecairan sesi**, bukan isyarat arah Buy/Sell.

## Nota

Komen & teks UI dalam **Bahasa Melayu** — kekalkan bahasa itu bila menyunting.
