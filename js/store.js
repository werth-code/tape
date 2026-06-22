/* ============================================================
   store.js — local accounts + persisted watchlist state
   NOTE: this is a *local demo* auth (localStorage). It is NOT
   secure and is meant for preview only. The production path is
   real auth (e.g. Supabase) swapped in behind the same API.
   ============================================================ */

const KEY = "tape.v2";

const DEFAULT_WATCH = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "GOOGL", "JPM"];

function nowISO() { return new Date().toISOString(); }

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
      this.data.guest = { watchlist: [...DEFAULT_WATCH], sort: "manual", since: nowISO() };
    }
    this.settings = this.data.settings || { provider: "sim", apiKey: "", liveUpdates: true, flash: true };
    this.data.settings = this.settings;
    this._save();
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

  get watchlist() { return this.bucket.watchlist; }
  set watchlist(list) { this.bucket.watchlist = list; this._save(); }
  get sort() { return this.bucket.sort || "manual"; }
  set sort(v) { this.bucket.sort = v; this._save(); }

  has(sym) { return this.watchlist.includes(sym); }
  add(sym) {
    if (this.has(sym)) return false;
    this.bucket.watchlist = [sym, ...this.bucket.watchlist];
    this._save(); return true;
  }
  remove(sym) {
    this.bucket.watchlist = this.bucket.watchlist.filter((s) => s !== sym);
    this._save();
  }
  reorder(newOrder) { this.bucket.watchlist = newOrder; this.bucket.sort = "manual"; this._save(); }

  /* ---- settings ---- */
  setSetting(k, v) { this.settings[k] = v; this._save(); }

  /* ---- auth (local demo) ---- */
  signup(email, pass) {
    email = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, err: "Enter a valid email address." };
    if (pass.length < 6) return { ok: false, err: "Password must be at least 6 characters." };
    if (this.data.users[email]) return { ok: false, err: "An account with that email already exists." };
    const guestList = this.data.guest ? this.data.guest.watchlist : [...DEFAULT_WATCH];
    this.data.users[email] = { pass: digest(pass), watchlist: [...guestList], sort: "manual", since: nowISO() };
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
