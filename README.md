# Analisis Web — Forex TradingView (PWA)

Aplikasi web mudah alih (PWA) untuk analisis forex: **carta, screener, kalkulator dagangan, panel Go/No-Go, alert & jurnal** — dibina di sekeliling widget rasmi [TradingView](https://www.tradingview.com/).

> **100% sisi-klien.** Tiada backend, tiada AI/LLM. Semua pengiraan berlaku di peranti anda; jurnal, alert & tetapan disimpan dalam `localStorage`. Carta datang dari TradingView.
>
> **Dashboard skor** ialah **enjin peraturan deterministik** (bukan AI/ML) — ia perlukan **kunci API data pasaran pilihan** (Twelve Data, tier percuma) untuk membaca OHLC dan mengira indikator. Tanpa kunci, app kekal berfungsi sepenuhnya dengan input manual.

Ini "adik ringan" kepada projek engine AI `analysisChart` — beberapa nilai dicermin (senarai pasangan `PAIRS`, nisbah R:R minimum, preset screener) tetapi tanpa kos token AI.

## Dashboard Skor (enjin peraturan)

Skrin **📊 Skor** (`#dashboard/EURUSD`) menggabungkan data pasaran sebenar jadi satu **skor 0–100 + Gred Kualiti Dagangan (A+/A/B/C/D)** dan verdict **BUY/SELL/WAIT**:

- **Indikator dikira tempatan** dari OHLC ([`js/indicators.js`](js/indicators.js)): EMA(20/50/200), RSI(14), MACD, ADX, ATR(14) — penghalusan Wilder, fungsi tulen berujian.
- **Kekuatan mata wang** dari % gerakan 8 pasangan; **Smart Money Concepts** (BOS/CHoCH/Order Block/Liquidity Grab, [`js/smc.js`](js/smc.js)) — **heuristik**, bukan aliran order institusi.
- **Skor berwajaran** ([`js/scoring.js`](js/scoring.js)): Trend 20 · Kekuatan 15 · ATR 10 · Sesi 10 · Berita 10 · SMC 5 · Teknikal 30. Berita merah / pasaran tutup = _hard-gate_ paksa WAIT. `jelaskan()` menghasilkan penerangan Bahasa Melayu bertemplat ("coach" deterministik).
- **Auto-ATR** di Kalkulator + **TP2** (nisbah R:R kedua). **Backtest tetingkap-pendek** memainkan semula enjin atas lilin dimuat → suap ke analitik jurnal sedia ada.

### Sediakan kunci API (pilihan)

1. Daftar kunci **percuma** di [twelvedata.com](https://twelvedata.com) (tier percuma: ~8 req/min, 800/hari).
2. Buka **Kalkulator → ⚙️ Kunci API data pasaran** dan tampal kunci.
3. Tekan **Auto** (ATR) atau **Muat data** (Dashboard).

> ⚠️ **Kunci terdedah:** app sisi-klien tak boleh sembunyikan kunci — sesiapa dengan akses peranti/devtools boleh melihatnya. Guna kunci **percuma tanpa bil**. Nilai indikator mungkin berbeza sedikit daripada broker anda. Data dicache tempatan (TTL ikut timeframe) untuk jimat kuota.

## Skrin

| Tab               | Fungsi                                                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📊 **Skor**       | Dashboard skor (enjin peraturan): AI Confidence (deterministik), Gred Kualiti Dagangan, trend MTF, kekuatan mata wang, RSI/MACD/ADX/ATR, SMC & backtest — perlu kunci API pilihan              |
| 📋 **Watchlist**  | Jam sesi pasaran berbilang zon, badge "status masuk order" (kecairan sesi), ticker harga, tolok teknikal setiap pasangan                                                                       |
| 🔎 **Screener**   | Senarai screener forex, heat map kekuatan mata wang, kadar silang, kalendar ekonomi                                                                                                            |
| 🧮 **Kalkulator** | Kira SL/TP dari ATR, saiz lot dari risiko %, amaran R:R < 1.5, **Pengurus Risiko** (had kerugian harian + pendedahan berkorelasi), **akaun bukan-USD**, **setup tersimpan** → simpan ke Jurnal |
| 🔔 **Alert**      | Alert harga ringkas (lihat had di bawah)                                                                                                                                                       |
| 📒 **Jurnal**     | **Analisis prestasi** (expectancy, profit factor, streak, keluk ekuiti, kadar menang ikut sesi/pasangan/arah), medan "R sebenar", eksport/import JSON                                          |
| **Carta**         | Carta lilin penuh + RSI/MACD/Bollinger, countdown tutup lilin, panel **Go/No-Go** (item boleh-ubah), input masa berita merah                                                                   |
| **MTF**           | Penjajaran multi-timeframe — tolok teknikal 1J/4J/Harian bersebelahan untuk konfluens trend (dari kad Watchlist)                                                                               |

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

Ujian meliputi fungsi tulen berisiko-senyap: logik sesi/timing ([`js/sessions.js`](js/sessions.js)), kalkulator dagangan ([`js/calculator.js`](js/calculator.js)), jarak berita ([`js/news.js`](js/news.js)), indikator ([`js/indicators.js`](js/indicators.js)), enjin skor ([`js/scoring.js`](js/scoring.js)), SMC ([`js/smc.js`](js/smc.js)), backtest ([`js/backtest.js`](js/backtest.js)) & lapisan data ([`js/marketdata.js`](js/marketdata.js)).

## Struktur

```
index.html            Shell + navigasi bawah
service-worker.js     Cache app-shell (stale-while-revalidate)
manifest.webmanifest  Metadata PWA
css/app.css           Gaya (tema gelap)
js/
  app.js        Router hash + susun atur skrin
  widgets.js    Pembina widget TradingView (embed rasmi)
  pairs.js      Senarai pasangan forex → simbol TradingView + Twelve Data (medan td)
  sessions.js   Sesi pasaran, status kecairan, timing tutup lilin, pasaran-tutup
  calculator.js SL/TP1-3 + auto-ATR + saiz lot + panel risiko + setup + akaun bukan-USD
  news.js       Senarai acara berita manual + jarak masa (adapter untuk API kelak)
  checklist.js  Panel Go/No-Go (sesi + timing + berita + R:R, item boleh-ubah)
  journal.js    Jurnal dagangan (localStorage) + eksport/import + analisis prestasi
  analytics.js  Metrik edge-finder (tulen): expectancy, PF, kumpulan, ekuiti, streak
  risk.js       Pendedahan mata wang & bajet risiko harian (tulen)
  alerts.js     Alert harga ringkas
  store.js      Helper localStorage + escape HTML (dikongsi)
  marketdata.js Lapisan data OHLC (Twelve Data): cache, kuota, fallback manual
  indicators.js EMA/RSI/MACD/ADX/ATR + kekuatan mata wang (tulen)
  smc.js        Smart Money Concepts — BOS/CHoCH/OB/liquidity (heuristik tulen)
  aras.js       Paras sokongan/rintangan + zon supply/demand + kedudukan (tulen)
  patterns.js   Corak lilin: engulfing/hammer/star, ambang berskala ATR (tulen)
  tekanan.js    "Tekanan Pasaran" — proxy penyertaan dari julat & badan lilin (tulen)
  mtf.js        Siri 4J/Harian "seperti dilihat pada masa T" — tanpa lookahead (tulen)
  kebarangkalian.js  Jalur skor + kadar menang + selang Wilson dari backtest (tulen)
  scoring.js    AI Score v3: enjin peraturan 100 mata + gate MTF/berita (tulen)
  backtest.js   Main semula enjin skor atas lilin sejarah → entri jurnal (tulen)
  dashboard.js  Skrin Skor: keputusan + pelan dagangan + sebab + backtest
test/           Ujian Vitest (199 ujian merentas semua modul tulen di atas)
```

### AI Score v3 — 100 mata

| Baldi       | Mata | Kandungan                                      |
| ----------- | ---- | ---------------------------------------------- |
| Trend (MTF) | 40   | Harian 20 · 4J 10 · 1J 10                      |
| Momentum    | 20   | RSI 5 · MACD 5 · ADX 5 · Tekanan Pasaran 5     |
| Smart Money | 20   | Bias struktur 8 · kedudukan vs paras 7 · zon 5 |
| Corak Lilin | 10   | Corak 6 · bonus konfluens dengan paras 4       |
| Berita      | 10   | Tiada acara impak tinggi berhampiran           |

**Gate `NO TRADE`** (skor menjadi tidak relevan): timeframe bertentangan arah · data
timeframe tidak lengkap · berita impak tinggi dalam zon bahaya · pasaran tutup ·
volatiliti melonjak (ATR > 1.2% harga). Timeframe _neutral_ hanya mengurangkan
markah — ia tidak menggate.

**Gate lembut `WAIT`**: harga dalam 0.5×ATR dari paras bertentangan → "tunggu breakout".

Data hilang memberi **0 markah**, bukan separuh kredit — skor yang dibina atas
ketidaktahuan tidak boleh dipercayai.

## Had yang perlu diketahui (jujur)

- **Alert harga** guna [frankfurter.dev](https://frankfurter.dev) (kadar **harian** ECB): hanya berjalan semasa app dibuka, **bukan intraday**, dan **tiada emas (XAUUSD)**. Untuk alert masa-nyata sebenar, guna ikon loceng dalam carta TradingView (perlu akaun TV percuma).
- **Kalendar berita** ialah iframe paparan — tak boleh dibaca secara programatik. Anda **salin acara** dari kalendar TV ke panel berita (nama, mata wang, impak, masa); app kira jarak masa secara tempatan untuk menyuap gate skor dan Go/No-Go. `bacaAcara()` dalam [`js/news.js`](js/news.js) ialah satu-satunya sempadan data — pemasangan API kalendar kelak hanya menggantikan fungsi itu.
- **Kebarangkalian berjaya** datang dari **backtest sebenar** yang dijalurkan ikut skor, bukan lengkung yang dipetakan dari skor. Di bawah 30 sampel ia berkata **"data tidak mencukupi"** dan bukan memberi nombor. Angka ini kekal **in-sample**: pemberat direka manusia lalu diuji pada data yang sama, jadi ia optimistik secara sistematik — baca sebagai prestasi sejarah, bukan ramalan.
- **"Tekanan Pasaran" bukan volume.** Forex spot tiada volume berpusat dan Twelve Data memulangkan 0/null untuknya. Metrik ini dikira dari pengembangan julat lilin berbanding ATR dan nisbah badan/sumbu — proxy penyertaan, bukan volume sebenar.
- **Timing tutup lilin harian** dianggap **21:00 UTC** (≈17:00 New York, waktu piawai). Broker berbeza mungkin ada offset sedikit berbeza.
- Status "masuk order" berdasarkan **kecairan sesi**, bukan isyarat arah Buy/Sell.

## Nota

Komen & teks UI dalam **Bahasa Melayu** — kekalkan bahasa itu bila menyunting.
