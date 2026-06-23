/* ============================================================
   store.js — local accounts + persisted watchlists
   Each account (or guest) owns multiple named lists; one is active.
   NOTE: this is a *local demo* auth (localStorage). It is NOT
   secure and is meant for preview only. The production path is
   real auth (e.g. Supabase) swapped in behind the same API.
   ============================================================ */

const KEY = "tape.v2";

const DEFAULT_WATCH = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "GOOGL", "JPM"];

function nowISO() { return new Date().toISOString(); }

let _seq = 0;
function uid() { return "l" + Date.now().toString(36) + (_seq++).toString(36) + Math.floor(Math.random() * 1e6).toString(36); }

function makeList(name, symbols, sort) {
  return { id: uid(), name, symbols: [...(symbols || [])], sort: sort || "manual" };
}

/* tiny non-cryptographic digest — demo only */
function digest(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

class Store {
  constructor() {
    this.data = this._load();
    if (!this.data.activeUser && !this.data.guest) {
      this.data.guest = { lists: [makeList("Watchlist", DEFAULT_WATCH)], since: nowISO() };
      this.data.guest.activeListId = this.data.guest.lists[0].id;
    }
    // migrate any bucket still on the old single-watchlist shape
    if (this.data.guest) this._ensureLists(this.data.guest);
    Object.values(this.data.users || {}).forEach((u) => this._ensureLists(u));

    this.settings = this.data.settings || { provider: "sim", apiKey: "", liveUpdates: true, flash: true };
    this.data.settings = this.settings;
    this._save();
  }

  _ensureLists(bucket) {
    if (!bucket) return;
    if (!Array.isArray(bucket.lists) || !bucket.lists.length) {
      bucket.lists = [makeList("Watchlist", bucket.watchlist || DEFAULT_WATCH, bucket.sort)];
    }
    if (!bucket.activeListId || !bucket.lists.some((l) => l.id === bucket.activeListId)) {
      bucket.activeListId = bucket.lists[0].id;
    }
    delete bucket.watchlist; delete bucket.sort;
  }

  _load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { users: {} }; }
    catch (_) { return { users: {} }; }
  }
  _save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (_) {} }

  /* ---- account bucket (active user or guest) ---- */
  get bucket() {
    if (this.data.activeUser) return this.data.users[this.data.activeUser];
    return this.data.guest;
  }
  get isAuthed() { return !!this.data.activeUser; }
  get email() { return this.data.activeUser || null; }
  get since() { return this.bucket?.since; }

  /* ---- lists ---- */
  get lists() { return this.bucket.lists; }
  get activeList() {
    const b = this.bucket;
    return b.lists.find((l) => l.id === b.activeListId) || b.lists[0];
  }
  get activeListId() { return this.bucket.activeListId; }
  get totalSymbols() { return this.bucket.lists.reduce((n, l) => n + l.symbols.length, 0); }

  setActiveList(id) {
    if (this.bucket.lists.some((l) => l.id === id)) { this.bucket.activeListId = id; this._save(); }
  }
  createList(name) {
    name = (name || "").trim() || `List ${this.bucket.lists.length + 1}`;
    const l = makeList(name, []);
    this.bucket.lists.push(l);
    this.bucket.activeListId = l.id;
    this._save();
    return l;
  }
  renameList(id, name) {
    const l = this.bucket.lists.find((x) => x.id === id);
    if (l && (name || "").trim()) { l.name = name.trim(); this._save(); return true; }
    return false;
  }
  deleteList(id) {
    if (this.bucket.lists.length <= 1) return false;     // always keep at least one
    this.bucket.lists = this.bucket.lists.filter((l) => l.id !== id);
    if (this.bucket.activeListId === id) this.bucket.activeListId = this.bucket.lists[0].id;
    this._save();
    return true;
  }

  /* ---- active list symbols / sort ---- */
  get watchlist() { return this.activeList.symbols; }
  set watchlist(list) { this.activeList.symbols = list; this._save(); }
  get sort() { return this.activeList.sort || "manual"; }
  set sort(v) { this.activeList.sort = v; this._save(); }

  has(sym) { return this.watchlist.includes(sym); }
  add(sym) {
    if (this.has(sym)) return false;
    this.activeList.symbols = [sym, ...this.activeList.symbols];
    this._save(); return true;
  }
  remove(sym) {
    this.activeList.symbols = this.activeList.symbols.filter((s) => s !== sym);
    this._save();
  }
  reorder(newOrder) { this.activeList.symbols = newOrder; this.activeList.sort = "manual"; this._save(); }

  /* ---- settings ---- */
  setSetting(k, v) { this.settings[k] = v; this._save(); }

  /* ---- auth (local demo) ---- */
  signup(email, pass) {
    email = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, err: "Enter a valid email address." };
    if (pass.length < 6) return { ok: false, err: "Password must be at least 6 characters." };
    if (this.data.users[email]) return { ok: false, err: "An account with that email already exists." };
    // carry the guest's lists over to the new account
    const guest = this.data.guest;
    const lists = (guest && guest.lists && guest.lists.length)
      ? guest.lists.map((l) => makeList(l.name, l.symbols, l.sort))
      : [makeList("Watchlist", DEFAULT_WATCH)];
    const gIdx = guest && guest.lists ? guest.lists.findIndex((l) => l.id === guest.activeListId) : 0;
    this.data.users[email] = {
      pass: digest(pass), lists,
      activeListId: (lists[gIdx] || lists[0]).id, since: nowISO(),
    };
    this.data.activeUser = email;
    this._save();
    return { ok: true };
  }
  login(email, pass) {
    email = email.trim().toLowerCase();
    const u = this.data.users[email];
    if (!u) return { ok: false, err: "No account found for that email." };
    if (u.pass !== digest(pass)) return { ok: false, err: "Incorrect password." };
    this.data.activeUser = email;
    this._save();
    return { ok: true };
  }
  logout() { this.data.activeUser = null; this._save(); }
}

export const store = new Store();
