# TAPE — Stock Tracker

> *Read the market.* A mobile-first, installable stock tracker with live-feeling
> prices, custom charts, news and earnings. Built as a static site so it previews
> on GitHub Pages today and can be wrapped for the App Store later.

![Made with vanilla JS](https://img.shields.io/badge/stack-vanilla%20JS-34d399) ![No build step](https://img.shields.io/badge/build-none-e6b450)

---

## What it does

| Requirement | Where it lives |
|---|---|
| Search & add tickers | **Search** tab — type a symbol or company name, tap `+` |
| Remove & reorder + presets | **Watchlist** → `Edit` (drag handles + remove) and the sort bar (`Manual · A–Z · Gainers · Losers · Price`) |
| Price, $ & % gain/loss, click-through | Every watchlist row; tap to open the stock |
| PE ratio + historical charts | **Stock detail** — interactive chart with `1D…5Y` ranges + a stats grid (P/E, EPS, market cap, ranges…) |
| Accounts that keep state | **Account** tab — create/sign in; watchlist persists per account (and for guests) |
| Deep data + news + earnings | **Stock detail** scroll, plus the **Research** desk (movers & sectors) |

Bonus: continuous ticker tape, live tick flashes, market-open clock, pull-to-detail
scrubbing on charts, and an installable PWA manifest.

---

## Run it locally

It's a static site — any static server works (ES modules need `http://`, not `file://`):

```bash
cd stock-tracker
python3 -m http.server 8000
# open http://localhost:8000
```

On a desktop browser it renders inside a phone frame; on a phone it's full-bleed.
For the real device feel, open it on your phone and **Add to Home Screen**.

---

## Data: simulated by default, real when you want it

The preview ships with a **realistic simulation** (deterministic per-symbol prices
that random-walk live, plus generated history, news and earnings). This is honest
about being a demo and means the GitHub Pages preview works with **zero API keys
and zero backend**.

To switch on **real live data**:

1. Get a free key at <https://finnhub.io> (60 req/min free tier).
2. In the app: **Account → Data source → toggle "Live market data" → paste your key.**

Real quotes, company profile (incl. P/E), and company news come from Finnhub.
Historical candles are a Finnhub *premium* endpoint, so chart shape stays simulated
but is anchored to the real current price. The provider abstraction lives in
[`js/data.js`](js/data.js) — swap in any quote API there.

> **Accounts** are a local demo (stored in `localStorage`, not secure). The code is
> structured so real auth (e.g. Supabase) drops into [`js/store.js`](js/store.js)
> behind the same interface.

---

## Deploy to GitHub Pages

```bash
git init && git add . && git commit -m "TAPE stock tracker"
git branch -M main
git remote add origin https://github.com/<you>/tape.git
git push -u origin main
# GitHub → Settings → Pages → Deploy from branch: main / root
```

No build step, no bundler — Pages serves it as-is.

---

## Path to the App Store

This is a clean PWA. To ship natively, wrap it with **Capacitor**:

```bash
npm i -g @capacitor/cli
npx cap init TAPE com.you.tape --web-dir .
npx cap add ios
npx cap open ios   # build & submit from Xcode
```

The viewport, safe-area insets, status-bar styling, standalone display mode and
icons are already in place for that transition.

---

## Project layout

```
index.html        app shell (status bar, tape, viewport, tab bar)
styles.css        the whole design system
js/data.js        market universe + Sim & Finnhub providers
js/store.js       local accounts + persisted watchlist
js/charts.js      custom SVG sparklines + interactive detail chart
js/app.js         routing, views, live updates, drag-reorder
manifest.json     PWA / installability
```

**Design:** editorial broadsheet × night-trading terminal —
*Instrument Serif* (display) · *IBM Plex Mono* (data) · *Schibsted Grotesk* (UI),
warm ink + phosphor-mint gains / coral losses / gold accent.
