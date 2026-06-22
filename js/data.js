/* ============================================================
   data.js — market data layer
   Two providers behind one async interface:
     • SimProvider   (default)  — deterministic, realistic, offline.
     • FinnhubProvider (opt-in)  — real live quotes/profile/news.
   Flip providers from the Account screen (or config below).
   ============================================================ */

/* ---- deterministic PRNG so a symbol always "looks" the same ---- */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) { // Box–Muller
  let u = 0, v = 0;
  while (u === 0) u = rng(); while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---- the universe: well-known tickers with plausible fundamentals ---- */
const U = (sym, name, sector, base, pe, eps, div, beta, mcap, exch = "NASDAQ", desc) =>
  ({ sym, name, sector, base, pe, eps, div, beta, mcap, exch, desc });

export const UNIVERSE = [
  U("AAPL","Apple Inc.","Technology",214.3,32.6,6.57,0.45,1.28,3320,"NASDAQ","Designs and sells iPhone, Mac, iPad and wearables, with a fast-growing services business spanning the App Store, iCloud and Apple Pay."),
  U("MSFT","Microsoft Corp.","Technology",441.6,36.2,12.2,0.71,0.91,3280,"NASDAQ","Cloud (Azure), productivity (Microsoft 365), Windows, gaming (Xbox) and a defining position in enterprise AI through its OpenAI partnership."),
  U("NVDA","NVIDIA Corp.","Semiconductors",126.9,58.4,2.17,0.03,1.66,3120,"NASDAQ","The dominant designer of GPUs powering the AI data-center build-out, alongside gaming, automotive and professional visualization."),
  U("GOOGL","Alphabet Inc.","Technology",178.2,24.1,7.39,0.00,1.03,2190,"NASDAQ","Parent of Google Search, YouTube, Android, Google Cloud and the Gemini family of AI models."),
  U("AMZN","Amazon.com Inc.","Consumer","198.5",43.7,4.54,0.00,1.15,2060,"NASDAQ","Global e-commerce, the AWS cloud leader, advertising, and a growing logistics and devices footprint."),
  U("META","Meta Platforms","Technology",512.7,27.5,18.6,0.40,1.21,1300,"NASDAQ","Operator of Facebook, Instagram, WhatsApp and Threads, investing heavily in AI and the Reality Labs metaverse."),
  U("TSLA","Tesla Inc.","Automotive",248.4,62.8,3.95,0.00,2.31,792,"NASDAQ","Electric vehicles, energy storage and solar, plus autonomy and robotics ambitions through FSD and Optimus."),
  U("BRK.B","Berkshire Hathaway","Financials",448.9,9.8,45.8,0.00,0.87,968,"NYSE","Warren Buffett's diversified holding company spanning insurance (GEICO), railroads (BNSF), energy and a large equity portfolio."),
  U("JPM","JPMorgan Chase","Financials",205.6,12.1,16.9,2.20,1.10,590,"NYSE","The largest U.S. bank by assets, spanning consumer banking, investment banking, asset and wealth management."),
  U("V","Visa Inc.","Financials",272.3,30.4,8.96,0.78,0.96,545,"NYSE","Operates the world's largest electronic payments network, earning fees on transaction volume across 200+ markets."),
  U("WMT","Walmart Inc.","Consumer",67.8,29.9,2.27,1.04,0.51,545,"NYSE","The world's largest retailer by revenue, expanding fast in e-commerce, advertising and membership."),
  U("MA","Mastercard Inc.","Financials",460.1,35.1,13.1,0.59,1.05,425,"NYSE","Global payments technology company operating one of the two dominant card networks alongside Visa."),
  U("UNH","UnitedHealth Group","Healthcare",492.4,18.7,26.3,1.52,0.55,452,"NYSE","Largest U.S. health insurer, paired with the fast-growing Optum health-services arm."),
  U("XOM","Exxon Mobil","Energy",114.6,13.9,8.24,3.36,0.86,512,"NYSE","Integrated oil and gas major spanning upstream production, refining, chemicals and low-carbon ventures."),
  U("JNJ","Johnson & Johnson","Healthcare",146.2,15.4,9.49,3.34,0.52,352,"NYSE","Diversified healthcare across pharmaceuticals and medical devices following the Kenvue consumer spin-off."),
  U("PG","Procter & Gamble","Consumer",167.9,27.1,6.19,2.39,0.41,395,"NYSE","Consumer staples giant behind Tide, Pampers, Gillette and dozens of billion-dollar household brands."),
  U("HD","Home Depot","Consumer",345.2,23.6,14.6,2.61,1.02,343,"NYSE","The largest home-improvement retailer, serving both DIY consumers and professional contractors."),
  U("COST","Costco Wholesale","Consumer",855.4,52.1,16.4,0.52,0.79,379,"NASDAQ","Membership warehouse retailer prized for low prices, high renewal rates and durable pricing power."),
  U("AVGO","Broadcom Inc.","Semiconductors",1642.0,68.2,24.1,1.28,1.18,765,"NASDAQ","Designs networking, broadband and custom AI silicon, with a large infrastructure-software arm (VMware)."),
  U("AMD","Advanced Micro Devices","Semiconductors",158.7,201.2,0.79,0.00,1.69,257,"NASDAQ","Designs CPUs and GPUs competing with Intel and NVIDIA across PCs, servers and AI accelerators."),
  U("NFLX","Netflix Inc.","Communications",678.3,42.9,15.8,0.00,1.26,290,"NASDAQ","The leading streaming-video service, now scaling ad-supported tiers and live programming."),
  U("CRM","Salesforce Inc.","Technology",267.4,46.3,5.78,0.60,1.29,258,"NYSE","The dominant enterprise CRM platform, expanding into data, analytics and Agentforce AI."),
  U("KO","Coca-Cola Co.","Consumer",62.9,25.3,2.49,3.05,0.59,271,"NYSE","The world's largest non-alcoholic beverage company with an unmatched global distribution system."),
  U("PEP","PepsiCo Inc.","Consumer",169.5,23.8,7.12,3.18,0.52,233,"NASDAQ","Snacks (Frito-Lay) and beverages powerhouse with a diversified global brand portfolio."),
  U("ADBE","Adobe Inc.","Technology",548.7,44.1,12.4,0.00,1.31,243,"NASDAQ","Creative, document and experience software, integrating generative AI across Photoshop and Firefly."),
  U("BAC","Bank of America","Financials",39.8,12.9,3.08,2.51,1.33,308,"NYSE","One of the four largest U.S. banks, with leading consumer and wealth-management franchises."),
  U("DIS","Walt Disney Co.","Communications",91.4,38.2,2.39,0.99,1.40,167,"NYSE","Media and entertainment spanning studios, streaming (Disney+), parks, and ESPN sports."),
  U("INTC","Intel Corp.","Semiconductors",30.8,0,-0.55,1.62,1.05,131,"NASDAQ","Legacy chip leader investing heavily to rebuild process leadership and a foundry business."),
  U("CSCO","Cisco Systems","Technology",47.6,18.4,2.59,3.28,0.83,191,"NASDAQ","Networking hardware and software leader pivoting toward security and recurring software revenue."),
  U("ORCL","Oracle Corp.","Technology",142.1,38.7,3.67,1.13,1.02,392,"NYSE","Enterprise databases and applications scaling a fast-growing cloud-infrastructure (OCI) business."),
  U("MCD","McDonald's Corp.","Consumer",258.9,24.6,11.5,2.59,0.66,186,"NYSE","The world's largest restaurant chain by revenue, operating a high-margin franchised model."),
  U("ABBV","AbbVie Inc.","Healthcare",178.3,61.4,2.90,3.49,0.61,315,"NYSE","Biopharma behind Humira's successors Skyrizi and Rinvoq, plus aesthetics (Botox) and oncology."),
  U("WFC","Wells Fargo","Financials",59.7,11.8,5.06,2.34,1.16,200,"NYSE","Large diversified U.S. bank working through regulatory remediation and efficiency gains."),
  U("LLY","Eli Lilly","Healthcare",892.6,118.4,7.54,0.59,0.42,848,"NYSE","Pharma leader riding blockbuster GLP-1 drugs Mounjaro and Zepbound for diabetes and obesity."),
  U("QCOM","Qualcomm Inc.","Semiconductors",171.2,22.3,7.68,1.95,1.31,190,"NASDAQ","Designs mobile chipsets and licenses wireless IP, expanding into automotive and PC silicon."),
  U("TXN","Texas Instruments","Semiconductors",196.4,35.8,5.49,2.78,1.04,179,"NASDAQ","Analog and embedded-processing chipmaker prized for cash generation and dividend growth."),
  U("NKE","Nike Inc.","Consumer",75.3,21.7,3.47,1.97,1.10,113,"NYSE","The world's largest athletic footwear and apparel brand, navigating a direct-to-consumer reset."),
  U("PYPL","PayPal Holdings","Financials",68.9,16.4,4.21,0.00,1.45,69,"NASDAQ","Digital-payments platform (PayPal, Venmo, Braintree) focused on margins and branded checkout."),
  U("BA","Boeing Co.","Industrials",181.7,0,-7.10,0.00,1.49,112,"NYSE","Aerospace giant working to stabilize 737 MAX production and rebuild quality and cash flow."),
  U("SBUX","Starbucks Corp.","Consumer",96.2,27.3,3.52,2.36,0.94,109,"NASDAQ","Global coffeehouse chain working to revive U.S. traffic and China performance."),
  U("PLTR","Palantir Technologies","Technology",28.4,214.0,0.13,0.00,2.62,64,"NYSE","Data-analytics and AI software for government and, increasingly, commercial customers (AIP)."),
  U("UBER","Uber Technologies","Technology",72.6,32.1,2.26,0.00,1.34,151,"NYSE","Global ride-hailing and delivery platform, now consistently profitable and generating free cash flow."),
  U("SHOP","Shopify Inc.","Technology",64.8,77.2,0.84,0.00,2.05,83,"NYSE","Commerce platform powering merchants of every size, expanding payments and B2B."),
  U("INTU","Intuit Inc.","Technology",632.5,57.9,10.9,0.61,1.21,177,"NASDAQ","Small-business and consumer finance software (QuickBooks, TurboTax, Credit Karma, Mailchimp)."),
  U("AMAT","Applied Materials","Semiconductors",207.3,22.9,9.05,0.86,1.49,172,"NASDAQ","The largest semiconductor-equipment maker, a key enabler of leading-edge chip manufacturing."),
  U("GS","Goldman Sachs","Financials",478.2,15.6,30.6,2.51,1.36,156,"NYSE","Premier investment bank in advisory and trading, refocusing on its core institutional franchise."),
  U("CAT","Caterpillar Inc.","Industrials",337.8,16.2,20.9,1.62,0.98,162,"NYSE","The world's leading maker of construction and mining equipment, a bellwether for global capex."),
  U("T","AT&T Inc.","Communications",19.2,11.4,1.68,5.78,0.64,138,"NYSE","Telecom carrier focused on wireless and fiber after exiting media, prioritizing debt reduction."),
  U("F","Ford Motor Co.","Automotive",11.4,11.9,0.96,5.26,1.55,45,"NYSE","Legacy automaker balancing profitable trucks (F-Series) with a costly EV and software transition."),
  U("SOFI","SoFi Technologies","Financials",7.8,0,-0.04,0.00,1.86,8,"NASDAQ","Digital-finance app bundling lending, banking and investing, pushing toward GAAP profitability."),
];

const BY_SYM = Object.fromEntries(UNIVERSE.map((s) => [s.sym, s]));

/* ---- range definitions: points & volatility scale ---- */
const RANGES = {
  "1D": { points: 78,  vol: 0.0016, label: "1 Day" },
  "1W": { points: 70,  vol: 0.010,  label: "1 Week" },
  "1M": { points: 66,  vol: 0.022,  label: "1 Month" },
  "3M": { points: 64,  vol: 0.040,  label: "3 Months" },
  "1Y": { points: 80,  vol: 0.075,  label: "1 Year" },
  "5Y": { points: 90,  vol: 0.190,  label: "5 Years" },
};
export const RANGE_KEYS = Object.keys(RANGES);

/* ===========================================================
   Simulated provider
   =========================================================== */
class SimProvider {
  constructor() {
    this.name = "sim";
    this.quotes = {};       // sym -> live quote
    this.subs = new Set();
    UNIVERSE.forEach((s) => this._seed(s));
  }

  _seed(s) {
    const base = parseFloat(s.base);
    const rng = mulberry32(hash(s.sym + "seed"));
    // previous close fixed; today's open gaps a little
    const prevClose = +(base * (0.985 + rng() * 0.03)).toFixed(2);
    const openGap = (gauss(rng) * 0.006);
    const price = +(prevClose * (1 + openGap)).toFixed(2);
    this.quotes[s.sym] = {
      sym: s.sym, name: s.name, prevClose, price,
      open: price, dayHigh: Math.max(price, prevClose), dayLow: Math.min(price, prevClose),
      _drift: gauss(rng) * 0.00006,
    };
  }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  _emit(sym) { this.subs.forEach((fn) => fn(sym, this.quotes[sym])); }

  /* advance one or all symbols by a small random walk */
  tick(symbols) {
    const list = symbols || Object.keys(this.quotes);
    list.forEach((sym) => {
      const q = this.quotes[sym]; if (!q) return;
      const rng = mulberry32(hash(sym) ^ (q.price * 1000 | 0));
      const shock = gauss(rng) * q.price * 0.0013 + q.price * q._drift;
      q.price = Math.max(0.5, +(q.price + shock).toFixed(2));
      q.dayHigh = Math.max(q.dayHigh, q.price);
      q.dayLow = Math.min(q.dayLow, q.price);
      this._emit(sym);
    });
  }

  async quote(sym) {
    const q = this.quotes[sym]; if (!q) return null;
    const change = +(q.price - q.prevClose).toFixed(2);
    const changePct = +((change / q.prevClose) * 100).toFixed(2);
    return { ...q, change, changePct };
  }

  async profile(sym) {
    const s = BY_SYM[sym]; if (!s) return null;
    const q = this.quotes[sym];
    const rng = mulberry32(hash(sym + "prof"));
    const hi52 = +(q.prevClose * (1.12 + rng() * 0.35)).toFixed(2);
    const lo52 = +(q.prevClose * (0.62 + rng() * 0.18)).toFixed(2);
    const avgVol = Math.round((s.mcap / s.base) * (0.002 + rng() * 0.01));
    return {
      sym: s.sym, name: s.name, sector: s.sector, exch: s.exch, desc: s.desc,
      pe: s.pe, eps: s.eps, div: s.div, beta: s.beta, marketCap: s.mcap * 1e9,
      hi52, lo52, avgVol, shares: Math.round((s.mcap * 1e9) / s.base),
    };
  }

  /* historical series, deterministic, ending near the live price */
  async history(sym, range) {
    const cfg = RANGES[range] || RANGES["1M"];
    const q = this.quotes[sym]; if (!q) return [];
    const rng = mulberry32(hash(sym + range));
    const n = cfg.points;
    // build a random walk with mild trend, then rescale so it ends at live price
    const startBias = (q.price / q.prevClose - 1);
    let v = q.prevClose * (1 - startBias * (range === "1D" ? 0.2 : 1.4));
    const trend = (gauss(rng)) * cfg.vol * q.prevClose / n;
    const raw = [];
    for (let i = 0; i < n; i++) {
      const shock = gauss(rng) * cfg.vol * q.prevClose * 0.5;
      v = Math.max(0.5, v + trend + shock / Math.sqrt(n));
      raw.push(v);
    }
    // anchor last point to the live price for continuity
    const drift = q.price - raw[raw.length - 1];
    return raw.map((p, i) => +(p + drift * (i / (n - 1))).toFixed(2));
  }

  search(query) {
    const ql = query.trim().toUpperCase();
    if (!ql) return [];
    return UNIVERSE
      .map((s) => {
        let score = -1;
        if (s.sym === ql) score = 100;
        else if (s.sym.startsWith(ql)) score = 80 - s.sym.length;
        else if (s.sym.includes(ql)) score = 50;
        else if (s.name.toUpperCase().includes(ql)) score = 30;
        return { s, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 25)
      .map((x) => x.s);
  }

  async news(sym) {
    const s = BY_SYM[sym]; if (!s) return [];
    const rng = mulberry32(hash(sym + "news"));
    const srcs = ["Bloomberg","Reuters","CNBC","WSJ","Barron's","MarketWatch","The Information","Seeking Alpha"];
    const templates = [
      [`${s.name} tops quarterly estimates as ${s.sector.toLowerCase()} demand holds`, "up"],
      [`Analysts lift ${s.sym} price target on improving margins`, "up"],
      [`${s.name} unveils strategy update at investor day`, "neutral"],
      [`Regulators open review touching ${s.sector.toLowerCase()} names including ${s.sym}`, "down"],
      [`${s.name} guidance disappoints, shares slip in premarket`, "down"],
      [`Why ${s.sym} keeps showing up in fund managers' top picks`, "neutral"],
      [`${s.name} expands buyback as cash flow strengthens`, "up"],
      [`Supply costs weigh on ${s.name}'s near-term outlook`, "down"],
    ];
    const n = 6;
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = templates[Math.floor(rng() * templates.length)];
      const hrs = Math.floor(rng() * 70) + i * 3 + 1;
      out.push({
        source: srcs[Math.floor(rng() * srcs.length)],
        headline: t[0], sentiment: t[1],
        time: hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`,
        _h: hrs,
      });
    }
    return out.sort((a, b) => a._h - b._h);
  }

  async earnings(sym) {
    const s = BY_SYM[sym]; if (!s) return [];
    const rng = mulberry32(hash(sym + "earn"));
    const baseEps = Math.max(0.1, s.eps / 4 || 0.5);
    // most recent reported quarter = Q1 2026; walk back 6, oldest first
    const startQ = 1, startYear = 2026;
    const out = [];
    for (let k = 5; k >= 0; k--) {
      let qNum = startQ - k, year = startYear;
      while (qNum <= 0) { qNum += 4; year -= 1; }
      const est = +(baseEps * (0.9 + rng() * 0.25)).toFixed(2);
      const surprise = gauss(rng) * 0.12;
      const act = +Math.max(0.01, est * (1 + surprise)).toFixed(2);
      out.push({
        label: `Q${qNum} '${String(year).slice(2)}`,
        est, act, beat: act >= est,
        surprisePct: +(((act - est) / est) * 100).toFixed(1),
      });
    }
    return out;
  }
}

/* ===========================================================
   Finnhub provider — REAL live data.
   Free endpoints used: /quote, /stock/profile2, /stock/metric,
   /company-news, /stock/earnings.  (Candles are premium, so
   history() falls back to the simulator for chart shape.)
   Enable by setting an API key in Account → Data source.
   =========================================================== */
class FinnhubProvider {
  constructor(apiKey, sim) {
    this.name = "finnhub";
    this.key = apiKey;
    this.sim = sim;                 // reuse simulator for charts + search index
    this.quotes = {};
    this.subs = new Set();
    this.base = "https://finnhub.io/api/v1";
  }
  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  _emit(sym) { this.subs.forEach((fn) => fn(sym, this.quotes[sym])); }

  async _get(path) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`${this.base}${path}${sep}token=${this.key}`);
    if (!r.ok) throw new Error(`finnhub ${r.status}`);
    return r.json();
  }

  async tick(symbols) {
    const list = symbols || Object.keys(this.quotes);
    await Promise.all(list.map(async (sym) => {
      try {
        const d = await this._get(`/quote?symbol=${encodeURIComponent(sym)}`);
        if (!d || !d.c) return;
        this.quotes[sym] = {
          sym, name: (BY_SYM[sym]?.name) || sym,
          price: d.c, prevClose: d.pc, open: d.o, dayHigh: d.h, dayLow: d.l,
        };
        this._emit(sym);
      } catch (_) {/* keep last value */}
    }));
  }

  async quote(sym) {
    if (!this.quotes[sym]) await this.tick([sym]);
    const q = this.quotes[sym]; if (!q) return null;
    const change = +(q.price - q.prevClose).toFixed(2);
    const changePct = +((change / q.prevClose) * 100).toFixed(2);
    return { ...q, change, changePct };
  }

  async profile(sym) {
    try {
      const [p, m] = await Promise.all([
        this._get(`/stock/profile2?symbol=${sym}`),
        this._get(`/stock/metric?symbol=${sym}&metric=all`),
      ]);
      const mm = m.metric || {};
      return {
        sym, name: p.name || sym, sector: p.finnhubIndustry || "—", exch: p.exchange || "—",
        desc: BY_SYM[sym]?.desc || "",
        pe: mm.peNormalizedAnnual ?? mm.peTTM ?? 0,
        eps: mm.epsNormalizedAnnual ?? 0,
        div: mm.dividendYieldIndicatedAnnual ?? 0,
        beta: mm.beta ?? 0,
        marketCap: (p.marketCapitalization || 0) * 1e6,
        hi52: mm["52WeekHigh"] ?? 0, lo52: mm["52WeekLow"] ?? 0,
        avgVol: mm["10DayAverageTradingVolume"] ? mm["10DayAverageTradingVolume"] * 1e6 : 0,
        shares: (p.shareOutstanding || 0) * 1e6,
      };
    } catch (_) { return this.sim.profile(sym); }
  }

  // candles are premium — use the simulator's shape anchored to the real last price
  async history(sym, range) {
    const q = await this.quote(sym);
    if (q && this.sim.quotes[sym]) { this.sim.quotes[sym].price = q.price; this.sim.quotes[sym].prevClose = q.prevClose; }
    return this.sim.history(sym, range);
  }

  search(query) { return this.sim.search(query); }

  async news(sym) {
    try {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 12096e5).toISOString().slice(0, 10); // 14d
      const d = await this._get(`/company-news?symbol=${sym}&from=${from}&to=${to}`);
      return (d || []).slice(0, 8).map((a) => ({
        source: a.source, headline: a.headline, sentiment: "neutral",
        url: a.url, time: "recent",
      }));
    } catch (_) { return this.sim.news(sym); }
  }

  async earnings(sym) {
    try {
      const d = await this._get(`/stock/earnings?symbol=${sym}`);
      return (d || []).slice(0, 6).reverse().map((e) => ({
        label: e.period?.slice(0, 7) || "",
        est: e.estimate, act: e.actual, beat: e.actual >= e.estimate,
        surprisePct: e.surprisePercent,
      }));
    } catch (_) { return this.sim.earnings(sym); }
  }
}

/* ===========================================================
   Market facade — the rest of the app talks only to this.
   =========================================================== */
class Market {
  constructor() {
    this.sim = new SimProvider();
    this.provider = this.sim;
    this._timer = null;
  }
  get mode() { return this.provider.name; }

  useSimulated() { this.provider = this.sim; }
  useFinnhub(apiKey) {
    if (!apiKey) return false;
    this.provider = new FinnhubProvider(apiKey, this.sim);
    return true;
  }

  subscribe(fn) { return this.provider.subscribe(fn); }
  start(getSymbols, intervalMs = 2600) {
    this.stop();
    const run = () => { try { this.provider.tick(getSymbols()); } catch (_) {} };
    run();
    this._timer = setInterval(run, intervalMs);
  }
  stop() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }

  quote(s)   { return this.provider.quote(s); }
  profile(s) { return this.provider.profile(s); }
  history(s, r) { return this.provider.history(s, r); }
  news(s)    { return this.provider.news(s); }
  earnings(s){ return this.provider.earnings(s); }
  search(q)  { return this.provider.search(q); }
}

export const market = new Market();
