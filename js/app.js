/* ============================================================
   app.js — views, routing, live updates, interactions
   ============================================================ */
import { market, RANGE_KEYS, UNIVERSE } from "./data.js";
import { store } from "./store.js";
import { sparkline, DetailChart } from "./charts.js";

/* ---------------- formatting ---------------- */
const fmtPrice = (n) => (n == null || isNaN(n)) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtSigned = (n) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2);
const fmtPct = (n) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const fmtMcap = (n) => {
  if (!n) return "—";
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  return "$" + n.toFixed(0);
};
const fmtVol = (n) => {
  if (!n) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
};
const dirClass = (n) => (n >= 0 ? "up" : "down");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------------- dom helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const viewport = $("#viewport");
const toastHost = $("#toast-host");
let lastPrice = {};          // sym -> last seen price (for tick direction)
let chartCtl = null;         // active DetailChart

function toast(msg, kind = "up") {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span class="dot" style="background:var(--${kind === "down" ? "down" : kind === "gold" ? "gold" : "up"})"></span>${esc(msg)}`;
  toastHost.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* ---------------- quotes ---------------- */
async function quotesFor(symbols) {
  const qs = await Promise.all(symbols.map(async (sym) => {
    const q = await market.quote(sym);
    const meta = UNIVERSE.find((u) => u.sym === sym);
    return q ? { ...q, name: meta?.name || q.name || sym } : null;
  }));
  return qs.filter(Boolean);
}

/* ---------------- live tick application ---------------- */
function applyTick(sym, q) {
  if (!q) return;
  const change = q.price - q.prevClose;
  const pct = (change / q.prevClose) * 100;
  const prev = lastPrice[sym];
  const flash = store.settings.flash && prev != null && prev !== q.price
    ? (q.price > prev ? "tick-up" : "tick-down") : null;
  lastPrice[sym] = q.price;

  document.querySelectorAll(`[data-px="${sym}"]`).forEach((el) => {
    el.textContent = fmtPrice(q.price);
    if (flash) { el.classList.remove("tick-up", "tick-down"); void el.offsetWidth; el.classList.add(flash); }
  });
  document.querySelectorAll(`[data-ch="${sym}"]`).forEach((el) => {
    el.textContent = `${fmtSigned(change)} (${fmtPct(pct)})`;
    el.classList.remove("up", "down"); el.classList.add(dirClass(change));
  });
  document.querySelectorAll(`[data-chp="${sym}"]`).forEach((el) => {
    el.textContent = fmtPct(pct);
    el.classList.remove("up", "down"); el.classList.add(dirClass(change));
  });
  document.querySelectorAll(`[data-tape-px="${sym}"]`).forEach((el) => { el.textContent = fmtPrice(q.price); });
  document.querySelectorAll(`[data-tape-ch="${sym}"]`).forEach((el) => {
    el.textContent = fmtPct(pct); el.style.color = `var(--${dirClass(change)})`;
  });
}
market.subscribe(applyTick);

/* ---------------- market clock ---------------- */
function marketState() {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const wd = get("weekday");
    const h = +get("hour"), m = +get("minute");
    const mins = h * 60 + m;
    const weekend = wd === "Sat" || wd === "Sun";
    if (weekend) return { open: false, label: "CLOSED" };
    if (mins >= 570 && mins < 960) return { open: true, label: "OPEN" };
    if (mins >= 240 && mins < 570) return { open: false, label: "PRE-MKT" };
    if (mins >= 960 && mins < 1200) return { open: false, label: "AFTER HRS" };
    return { open: false, label: "CLOSED" };
  } catch (_) { return { open: true, label: "OPEN" }; }
}
function paintClock() {
  const st = marketState();
  const wrap = $("#market-state");
  wrap.classList.toggle("open", st.open);
  $("#market-label").textContent = `MARKET ${st.label}`;
}

/* ---------------- ticker tape ---------------- */
async function renderTape() {
  const syms = ["AAPL","NVDA","MSFT","TSLA","AMZN","META","GOOGL","AMD","JPM","NFLX","AVGO","LLY"];
  const qs = await quotesFor(syms);
  const item = (q) => `<span class="tape-item">
      <span class="tape-sym">${q.sym}</span>
      <span class="tape-px" data-tape-px="${q.sym}">${fmtPrice(q.price)}</span>
      <span class="tape-ch" data-tape-ch="${q.sym}" style="color:var(--${dirClass(q.change)})">${fmtPct(q.changePct)}</span>
    </span>`;
  const html = qs.map(item).join("");
  $("#tape-track").innerHTML = html + html; // duplicate for seamless loop
}

/* ---------------- account chip ---------------- */
function paintAccountChip() {
  const chip = $("#account-initial");
  chip.textContent = store.isAuthed ? store.email[0].toUpperCase() : "·";
  $("#account-chip").style.color = store.isAuthed ? "var(--gold)" : "var(--paper)";
}

/* ================================================================
   WATCHLIST
   ================================================================ */
let editing = false;

function sortQuotes(qs, preset, manualOrder) {
  const arr = [...qs];
  switch (preset) {
    case "alpha": return arr.sort((a, b) => a.sym.localeCompare(b.sym));
    case "gainers": return arr.sort((a, b) => b.changePct - a.changePct);
    case "losers": return arr.sort((a, b) => a.changePct - b.changePct);
    case "price": return arr.sort((a, b) => b.price - a.price);
    default: // manual — follow stored order
      return arr.sort((a, b) => manualOrder.indexOf(a.sym) - manualOrder.indexOf(b.sym));
  }
}

async function viewWatchlist() {
  const symbols = store.watchlist;
  const view = document.createElement("div");
  view.className = "view view-enter";

  if (!symbols.length) {
    view.innerHTML = `
      <div class="page-head"><div class="eyebrow">Portfolio</div><h1 class="page-title">Your <span class="em">tape</span></h1></div>
      <div class="empty">
        <div class="empty-mark">∅</div>
        <p>No tickers yet. Add the symbols you want to follow and they'll live here.</p>
        <button class="btn btn-primary" id="go-add">+ Add your first ticker</button>
      </div>`;
    viewport.replaceChildren(view);
    $("#go-add").onclick = () => openAddSheet();
    return;
  }

  let qs = await quotesFor(symbols);
  qs = sortQuotes(qs, store.sort, symbols);

  // portfolio = equal-weight index of the watchlist (illustrative)
  const idxNow = qs.reduce((s, q) => s + q.price, 0) / qs.length;
  const idxPrev = qs.reduce((s, q) => s + q.prevClose, 0) / qs.length;
  const idxChg = idxNow - idxPrev;
  const idxPct = (idxChg / idxPrev) * 100;
  const gainers = qs.filter((q) => q.change >= 0).length;

  const heroSpark = await market.history(qs[0].sym, "1D");

  const presets = [["manual", "Manual"], ["alpha", "A–Z"], ["gainers", "Gainers"], ["losers", "Losers"], ["price", "Price"]];

  view.innerHTML = `
    <div class="page-head">
      <div class="eyebrow">Portfolio · ${symbols.length} symbols</div>
      <h1 class="page-title">Your <span class="em">tape</span></h1>
    </div>

    ${dataBanner()}

    <div class="hero">
      <div class="hero-label">Watchlist index · equal weight</div>
      <div class="hero-value">${fmtPrice(idxNow)}</div>
      <div class="hero-sub">
        <span class="chip ${dirClass(idxChg)}"><span class="arrow">${idxChg >= 0 ? "▲" : "▼"}</span>${fmtSigned(idxChg)} · ${fmtPct(idxPct)}</span>
        <span style="color:var(--paper-3)">${gainers}/${qs.length} advancing</span>
      </div>
      <div class="hero-spark">${sparkline(heroSpark, { w: 220, h: 70, up: idxChg >= 0 })}</div>
    </div>

    <div class="toolbar">
      <div class="seg" id="sort-seg">
        ${presets.map(([k, l]) => `<button class="seg-btn ${store.sort === k ? "active" : ""}" data-sort="${k}">${l}</button>`).join("")}
      </div>
      <button class="toolbtn ${editing ? "on" : ""}" id="edit-btn">${editing ? "Done" : "Edit"}</button>
    </div>

    <div class="rows stagger ${editing ? "editing" : ""}" id="rows"></div>
  `;
  viewport.replaceChildren(view);

  const rowsEl = $("#rows", view);
  for (const q of qs) rowsEl.appendChild(await rowEl(q));

  // stagger delays
  [...rowsEl.children].forEach((c, i) => { c.style.animationDelay = `${Math.min(i * 35, 400)}ms`; });

  // sort presets
  $("#sort-seg", view).querySelectorAll("[data-sort]").forEach((b) => {
    b.onclick = () => { store.sort = b.dataset.sort; if (editing) { editing = false; } render(); };
  });
  // edit toggle
  $("#edit-btn", view).onclick = () => { editing = !editing; render(); };

  if (editing) makeReorderable(rowsEl);
}

function dataBanner() {
  const live = market.mode === "finnhub";
  return `<div class="databar ${live ? "live" : ""}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
    ${live ? "Live data — Finnhub API connected." : "Simulated live data · realistic demo. Connect a free API key in Account → Data source."}
  </div>`;
}

function nameFor(sym) { return UNIVERSE.find((u) => u.sym === sym)?.name || sym; }

async function rowEl(q) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.sym = q.sym;
  const spark = await market.history(q.sym, "1D");
  row.innerHTML = `
    <div class="row-delete-bg" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      <span>Delete</span>
    </div>
    <div class="row-fg">
      <div class="row-handle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 7h.01M8 12h.01M8 17h.01M15 7h.01M15 12h.01M15 17h.01"/></svg></div>
      <div class="row-id">
        <div class="row-sym">${q.sym}</div>
        <div class="row-name">${esc(q.name)}</div>
      </div>
      <div class="row-spark">${sparkline(spark, { up: q.change >= 0 })}</div>
      <div class="row-px">
        <div class="row-price" data-px="${q.sym}">${fmtPrice(q.price)}</div>
        <div class="row-change ${dirClass(q.change)}" data-ch="${q.sym}">${fmtSigned(q.change)} (${fmtPct(q.changePct)})</div>
      </div>
      <button class="row-remove" aria-label="Remove ${q.sym}">−</button>
    </div>
  `;
  lastPrice[q.sym] = q.price;
  const fg = row.querySelector(".row-fg");

  // tap → open detail (suppressed right after a swipe; closes an open row first)
  fg.addEventListener("click", () => {
    if (editing) return;
    if (row._suppressClick) { row._suppressClick = false; return; }
    if (row.classList.contains("swiped")) { closeSwipe(row); return; }
    navigate(`stock/${q.sym}`);
  });
  // edit-mode remove (immediate — edit is already an intentional state)
  row.querySelector(".row-remove").onclick = (e) => {
    e.stopPropagation();
    store.remove(q.sym); toast(`Removed ${q.sym}`, "down"); render();
  };
  // tap the revealed Delete layer → confirm
  row.querySelector(".row-delete-bg").onclick = () => { closeSwipe(row); confirmRemove(q.sym); };

  if (!editing) attachSwipe(row, q.sym);
  return row;
}

/* ---- swipe-to-delete (pointer based, works on touch) ---- */
function closeSwipe(row) {
  const fg = row.querySelector(".row-fg");
  fg.style.transition = "transform .22s var(--ease)";
  fg.style.transform = "";
  row.classList.remove("swiped");
  // keep the red layer visible until the slide-back finishes, then hide it
  setTimeout(() => { if (!row.classList.contains("swiped")) row.classList.remove("swiping"); }, 240);
}
function closeAllSwipes(except) {
  document.querySelectorAll(".row.swiped").forEach((r) => { if (r !== except) closeSwipe(r); });
}

function attachSwipe(row, sym) {
  const fg = row.querySelector(".row-fg");
  const REVEAL = 78;                 // open offset that parks the Delete action
  let startX = 0, startY = 0, dx = 0, mode = null, base = 0, w = 0, pid = null;

  const setX = (x) => { fg.style.transform = x ? `translateX(${x}px)` : ""; };

  fg.addEventListener("pointerdown", (e) => {
    if (editing) return;
    pid = e.pointerId; startX = e.clientX; startY = e.clientY; dx = 0; mode = null;
    base = row.classList.contains("swiped") ? -REVEAL : 0;
    w = row.getBoundingClientRect().width;
    fg.style.transition = "none";
  });

  fg.addEventListener("pointermove", (e) => {
    if (editing || pid === null) return;
    const mx = e.clientX - startX, my = e.clientY - startY;
    if (mode === null) {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) { mode = "swipe"; row.classList.add("swiping"); closeAllSwipes(row); try { fg.setPointerCapture(pid); } catch (_) {} }
      else if (Math.abs(my) > 8) { mode = "scroll"; }
    }
    if (mode === "swipe") {
      e.preventDefault();
      dx = Math.max(-w * 0.8, Math.min(0, base + mx));   // left only
      setX(dx);
    }
  });

  const end = () => {
    if (pid === null) return;
    pid = null;
    if (mode === "swipe") {
      row._suppressClick = true;
      if (dx <= -w * 0.45) { closeSwipe(row); confirmRemove(sym); }     // big swipe → confirm
      else if (dx <= -REVEAL * 0.55) {                                   // park open, show Delete
        fg.style.transition = "transform .22s var(--ease)"; setX(-REVEAL); row.classList.add("swiped");
      } else { closeSwipe(row); }                                        // snap back
    } else {
      fg.style.transition = "";
    }
    mode = null;
  };
  fg.addEventListener("pointerup", end);
  fg.addEventListener("pointercancel", end);
}

/* ---- drag reorder (pointer based, works on touch) ---- */
function makeReorderable(listEl) {
  let drag = null;
  listEl.querySelectorAll(".row-handle").forEach((h) => h.addEventListener("pointerdown", start));

  function start(e) {
    e.preventDefault();
    const row = e.target.closest(".row");
    const rows = [...listEl.querySelectorAll(".row")];
    const idx = rows.indexOf(row);
    const rects = rows.map((r) => r.getBoundingClientRect());
    const pitch = rows.length > 1 ? (rects[rects.length - 1].top - rects[0].top) / (rows.length - 1) : rects[0].height;
    drag = { row, rows, rects, idx, newIdx: idx, pitch, startY: e.clientY };
    row.classList.add("dragging");
    row.style.transition = "none";
    rows.forEach((r) => { if (r !== row) r.style.transition = "transform .18s cubic-bezier(.22,.61,.36,1)"; });
    row.setPointerCapture(e.pointerId);
    row.addEventListener("pointermove", move);
    row.addEventListener("pointerup", end);
    row.addEventListener("pointercancel", end);
  }

  function move(e) {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    drag.row.style.transform = `translateY(${dy}px)`;
    const center = drag.rects[drag.idx].top + drag.rects[drag.idx].height / 2 + dy;
    let ni = 0;
    drag.rows.forEach((r, j) => {
      if (j === drag.idx) return;
      const c = drag.rects[j].top + drag.rects[j].height / 2;
      if (c < center) ni++;
    });
    drag.newIdx = ni;
    drag.rows.forEach((r, oj) => {
      if (oj === drag.idx) return;
      const reduced = oj < drag.idx ? oj : oj - 1;
      const slot = reduced >= drag.newIdx ? reduced + 1 : reduced;
      const offset = (slot - oj) * drag.pitch;
      r.style.transform = offset ? `translateY(${offset}px)` : "";
    });
  }

  function end(e) {
    if (!drag) return;
    const order = drag.rows.map((r) => r.dataset.sym);
    const [moved] = order.splice(drag.idx, 1);
    order.splice(drag.newIdx, 0, moved);
    drag.rows.forEach((r) => { r.style.transition = ""; r.style.transform = ""; });
    drag.row.classList.remove("dragging");
    const changed = drag.newIdx !== drag.idx;
    drag = null;
    if (changed) { store.reorder(order); render(); }
  }
}

/* ================================================================
   BOTTOM SHEETS — confirm + quick-add
   ================================================================ */
function openSheet(contentEl, { onClose } = {}) {
  closeAllSwipes();
  const host = document.createElement("div");
  host.className = "sheet-backdrop";
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.appendChild(contentEl);
  host.appendChild(sheet);
  $("#device").appendChild(host);
  requestAnimationFrame(() => host.classList.add("show"));
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    host.classList.remove("show");
    setTimeout(() => host.remove(), 280);
    if (onClose) onClose();
  };
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  return { close, sheet };
}

function confirmRemove(sym) {
  const el = document.createElement("div");
  el.innerHTML = `
    <div class="sheet-grip"></div>
    <div class="sheet-title">Remove ${esc(sym)}?</div>
    <div class="sheet-body"><b>${esc(nameFor(sym))}</b> will be taken off your watchlist. You can add it back anytime.</div>
    <div class="sheet-actions">
      <button class="btn btn-ghost btn-block" data-act="cancel">Cancel</button>
      <button class="btn btn-danger btn-block" data-act="ok">Remove</button>
    </div>`;
  const { close } = openSheet(el);
  el.querySelector('[data-act="cancel"]').onclick = close;
  el.querySelector('[data-act="ok"]').onclick = () => {
    close();
    store.remove(sym); toast(`Removed ${sym}`, "down"); render();
  };
}

function openAddSheet() {
  const el = document.createElement("div");
  el.innerHTML = `
    <div class="sheet-grip"></div>
    <div class="sheet-head">
      <div class="sheet-title">Add ticker</div>
      <button class="sheet-close" data-act="close">Done</button>
    </div>
    <div class="searchbox sheet-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="M20 20l-3.5-3.5"/></svg>
      <input id="add-input" type="text" placeholder="Ticker or company name…" autocomplete="off" autocapitalize="characters" spellcheck="false" />
    </div>
    <div class="sheet-results" id="add-results"></div>`;
  let changed = false;
  const { close } = openSheet(el, { onClose: () => { if (changed) render(); } });
  el.querySelector('[data-act="close"]').onclick = close;

  const input = el.querySelector("#add-input");
  const results = el.querySelector("#add-results");
  const paint = (qstr) => {
    const list = qstr ? market.search(qstr) : UNIVERSE.filter((u) => !store.has(u.sym)).sort((a, b) => b.mcap - a.mcap).slice(0, 12);
    results.innerHTML = list.length ? "" : `<div class="sheet-empty">No matches for “${esc(qstr)}”. Try a ticker like AAPL or NVDA.</div>`;
    list.forEach((s) => {
      const r = document.createElement("div");
      r.className = "result";
      const added = store.has(s.sym);
      r.innerHTML = `
        <div>
          <div class="result-sym">${s.sym}</div>
          <div class="result-name">${esc(s.name)}</div>
        </div>
        <span class="result-exch">${s.exch}</span>
        <button class="result-add ${added ? "added" : ""}" aria-label="Add ${s.sym}">${added ? "✓" : "+"}</button>`;
      const btn = r.querySelector(".result-add");
      const toggle = (e) => {
        if (e) e.stopPropagation();
        changed = true;
        if (store.has(s.sym)) { store.remove(s.sym); btn.classList.remove("added"); btn.textContent = "+"; }
        else { store.add(s.sym); btn.classList.add("added"); btn.textContent = "✓"; toast(`Added ${s.sym}`); }
      };
      btn.onclick = toggle;
      r.querySelector(".result-sym").onclick = toggle;
      results.appendChild(r);
    });
  };
  input.addEventListener("input", () => paint(input.value));
  paint("");
  setTimeout(() => input.focus(), 280);
}

/* ================================================================
   SEARCH
   ================================================================ */
function viewSearch() {
  const view = document.createElement("div");
  view.className = "view view-enter";
  view.innerHTML = `
    <div class="searchwrap">
      <div class="page-head" style="padding:8px 0 12px">
        <div class="eyebrow">Find</div>
        <h1 class="page-title">Search <span class="em">market</span></h1>
      </div>
      <div class="searchbox">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="search-input" type="text" placeholder="Ticker or company name…" autocomplete="off" autocapitalize="characters" spellcheck="false" />
        <button class="search-clear hidden" id="search-clear">×</button>
      </div>
    </div>
    <div id="search-results"></div>
  `;
  viewport.replaceChildren(view);

  const input = $("#search-input", view);
  const clear = $("#search-clear", view);
  const results = $("#search-results", view);

  const paint = (q) => {
    clear.classList.toggle("hidden", !q);
    const list = q ? market.search(q) : UNIVERSE.slice().sort((a, b) => b.mcap - a.mcap).slice(0, 14);
    results.innerHTML = `<div class="section-label">${q ? `${list.length} result${list.length === 1 ? "" : "s"}` : "Most followed"}</div>` +
      (list.length ? "" : `<div class="empty"><p>No matches for “${esc(q)}”. Try a ticker like AAPL or NVDA.</p></div>`);
    list.forEach((s) => {
      const added = store.has(s.sym);
      const el = document.createElement("div");
      el.className = "result";
      el.innerHTML = `
        <div>
          <div class="result-sym">${s.sym}</div>
          <div class="result-name">${esc(s.name)}</div>
        </div>
        <span class="result-exch">${s.exch}</span>
        <button class="result-add ${added ? "added" : ""}" aria-label="Add ${s.sym}">${added ? "✓" : "+"}</button>`;
      el.querySelector(".result-sym").onclick = () => navigate(`stock/${s.sym}`);
      el.querySelector(".result-name").onclick = () => navigate(`stock/${s.sym}`);
      const addBtn = el.querySelector(".result-add");
      addBtn.onclick = (e) => {
        e.stopPropagation();
        if (store.has(s.sym)) { store.remove(s.sym); addBtn.classList.remove("added"); addBtn.textContent = "+"; toast(`Removed ${s.sym}`, "down"); }
        else { store.add(s.sym); addBtn.classList.add("added"); addBtn.textContent = "✓"; toast(`Added ${s.sym} to watchlist`); }
      };
      results.appendChild(el);
    });
  };

  input.addEventListener("input", () => paint(input.value));
  clear.onclick = () => { input.value = ""; paint(""); input.focus(); };
  paint("");
  setTimeout(() => input.focus(), 120);
}

/* ================================================================
   RESEARCH / MARKETS board
   ================================================================ */
async function viewResearch() {
  const view = document.createElement("div");
  view.className = "view view-enter";
  view.innerHTML = `
    <div class="page-head"><div class="eyebrow">Markets</div><h1 class="page-title">Research <span class="em">desk</span></h1></div>
    <div id="movers"><div class="block"><div class="skeleton" style="height:120px"></div></div></div>`;
  viewport.replaceChildren(view);

  const all = await quotesFor(UNIVERSE.map((u) => u.sym));
  const byPct = [...all].sort((a, b) => b.changePct - a.changePct);
  const gainers = byPct.slice(0, 5);
  const losers = byPct.slice(-5).reverse();
  const active = [...all].sort((a, b) => b.price - a.price).slice(0, 5);

  // synthetic "indices" = sector baskets
  const sectors = {};
  all.forEach((q) => {
    const sec = UNIVERSE.find((u) => u.sym === q.sym).sector;
    (sectors[sec] = sectors[sec] || []).push(q.changePct);
  });
  const sectorRows = Object.entries(sectors)
    .map(([k, v]) => ({ k, avg: v.reduce((a, b) => a + b, 0) / v.length }))
    .sort((a, b) => b.avg - a.avg);

  const board = (title, items) => `
    <div class="block">
      <div class="block-title">${title}</div>
      <div class="rows" style="padding:6px 0">
        ${items.map((q) => `
          <div class="qrow" data-go="${q.sym}" style="grid-template-columns:1fr auto auto">
            <div class="row-id"><div class="row-sym">${q.sym}</div><div class="row-name">${esc(q.name)}</div></div>
            <div class="row-px"><div class="row-price" data-px="${q.sym}">${fmtPrice(q.price)}</div></div>
            <div class="row-change ${dirClass(q.change)}" data-chp="${q.sym}" style="min-width:64px;text-align:right">${fmtPct(q.changePct)}</div>
          </div>`).join("")}
      </div>
    </div>`;

  $("#movers", view).innerHTML = `
    ${dataBanner()}
    <div class="block">
      <div class="block-title">Sectors <span class="more">${RANGE_KEYS.length} ranges</span></div>
      <div style="display:flex;flex-direction:column;gap:7px;margin-top:8px">
        ${sectorRows.map((s) => {
          const w = Math.min(100, Math.abs(s.avg) * 18 + 4);
          const up = s.avg >= 0;
          return `<div style="display:grid;grid-template-columns:120px 1fr 56px;align-items:center;gap:10px">
            <span style="font-size:12.5px;color:var(--paper-2)">${esc(s.k)}</span>
            <span style="height:8px;border-radius:4px;background:var(--surface-2);position:relative;overflow:hidden">
              <span style="position:absolute;${up ? "left:50%" : "right:50%"};top:0;bottom:0;width:${w / 2}%;background:var(--${up ? "up" : "down"})"></span>
              <span style="position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--line-2)"></span>
            </span>
            <span class="mono ${up ? "pos" : "neg"}" style="font-size:12px;text-align:right">${fmtPct(s.avg)}</span>
          </div>`;
        }).join("")}
      </div>
    </div>
    ${board("Top gainers", gainers)}
    ${board("Top losers", losers)}
    ${board("Highest priced", active)}
  `;
  view.querySelectorAll("[data-go]").forEach((r) => r.onclick = () => navigate(`stock/${r.dataset.go}`));
}

/* ================================================================
   STOCK DETAIL — the deep-data surface
   ================================================================ */
let detailRange = "1D";

async function viewStock(sym) {
  const meta = UNIVERSE.find((u) => u.sym === sym);
  const view = document.createElement("div");
  view.className = "view push-enter";
  const inList = store.has(sym);

  view.innerHTML = `
    <div class="detail-head">
      <button class="backbtn" id="back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg> Back</button>
      <div class="detail-actions">
        <button class="toolbtn" id="watch-toggle">${inList ? "✓ Watching" : "+ Watchlist"}</button>
      </div>
    </div>
    <div class="detail-id">
      <div class="detail-sym">${sym} <span style="color:var(--paper-3)">· ${meta ? esc(meta.exch) : "—"}</span></div>
      <div class="detail-name">${esc(meta ? meta.name : sym)}</div>
    </div>
    <div class="detail-price-row">
      <div class="detail-price" data-px="${sym}" data-detail>—</div>
      <div class="detail-change" data-ch="${sym}">—</div>
    </div>

    <div class="chart-wrap" id="chart"></div>
    <div class="ranges" id="ranges">
      ${RANGE_KEYS.map((r) => `<button class="range-btn ${r === detailRange ? "active" : ""}" data-range="${r}">${r}</button>`).join("")}
    </div>

    <div class="stats" id="stats">
      ${Array.from({ length: 8 }).map(() => `<div class="stat"><div class="skeleton" style="height:34px"></div></div>`).join("")}
    </div>

    <div class="block"><div class="block-title">About</div><div class="about" id="about"><div class="skeleton" style="height:80px"></div></div></div>
    <div class="block"><div class="block-title">News <span class="more" id="news-more">latest</span></div><div id="news"><div class="skeleton" style="height:120px"></div></div></div>
    <div class="block"><div class="block-title">Earnings <span class="more">EPS · est vs actual</span></div><div id="earnings"><div class="skeleton" style="height:120px"></div></div></div>
  `;
  viewport.replaceChildren(view);
  viewport.scrollTop = 0;

  $("#back", view).onclick = () => history.back();
  const watchBtn = $("#watch-toggle", view);
  watchBtn.classList.toggle("on", store.has(sym));
  watchBtn.onclick = () => {
    if (store.has(sym)) { store.remove(sym); watchBtn.textContent = "+ Watchlist"; watchBtn.classList.remove("on"); toast(`Removed ${sym}`, "down"); }
    else { store.add(sym); watchBtn.textContent = "✓ Watching"; watchBtn.classList.add("on"); toast(`Added ${sym} to watchlist`); }
  };

  // live price
  const q = await market.quote(sym);
  if (q) applyTick(sym, { price: q.price, prevClose: q.prevClose });

  // chart
  chartCtl = new DetailChart($("#chart", view));
  const scrub = $(".chart-scrub", view);
  chartCtl.onScrub = (val) => {
    if (val == null) { scrub.classList.remove("show"); applyTick(sym, { price: q.price, prevClose: q.prevClose }); return; }
    scrub.classList.add("show");
    scrub.innerHTML = `<b>$${fmtPrice(val)}</b>`;
    $('[data-detail]', view).textContent = fmtPrice(val);
  };
  await drawRange(sym, detailRange, view, q);

  $("#ranges", view).querySelectorAll("[data-range]").forEach((b) => {
    b.onclick = async () => {
      detailRange = b.dataset.range;
      $("#ranges", view).querySelectorAll(".range-btn").forEach((x) => x.classList.toggle("active", x === b));
      await drawRange(sym, detailRange, view, q);
    };
  });

  // profile / stats
  const p = await market.profile(sym);
  if (p) renderStats($("#stats", view), p, q);
  $("#about", view).innerHTML = `${esc(p?.desc || "No description available.")}
    <div class="ticker-tags">
      <span class="tag">${esc(p?.sector || meta?.sector || "—")}</span>
      <span class="tag">${esc(meta?.exch || "—")}</span>
      <span class="tag">Beta ${(p?.beta ?? 0).toFixed(2)}</span>
    </div>`;

  // news
  const news = await market.news(sym);
  $("#news", view).innerHTML = news.map((n) => `
    <div class="news-item" ${n.url ? `data-url="${esc(n.url)}"` : ""}>
      <div>
        <div class="news-src">${esc(n.source)}</div>
        <div class="news-head">${esc(n.headline)}</div>
        <div class="news-time">${esc(n.time)}</div>
      </div>
      <span class="news-tag ${n.sentiment}">${n.sentiment === "up" ? "▲" : n.sentiment === "down" ? "▼" : "•"}</span>
    </div>`).join("");
  $("#news", view).querySelectorAll("[data-url]").forEach((el) => el.onclick = () => window.open(el.dataset.url, "_blank", "noopener"));

  // earnings
  const earn = await market.earnings(sym);
  const maxEps = Math.max(...earn.map((e) => Math.max(e.est || 0, e.act || 0)), 0.01);
  $("#earnings", view).innerHTML = earn.map((e) => {
    const eh = Math.max(3, ((e.est || 0) / maxEps) * 30);
    const ah = Math.max(3, ((e.act || 0) / maxEps) * 30);
    return `<div class="earn-row">
      <div class="earn-q">${esc(e.label)}</div>
      <div class="earn-bars">
        <span class="earn-bar est" style="height:${eh}px" title="Est"></span>
        <span class="earn-bar act ${e.beat ? "" : "miss"}" style="height:${ah}px" title="Actual"></span>
      </div>
      <div class="earn-meta">
        <div class="earn-eps">$${(e.act ?? 0).toFixed(2)}</div>
        <div class="earn-beat ${e.beat ? "pos" : "neg"}">${e.beat ? "beat" : "miss"} ${e.surprisePct != null ? (e.surprisePct >= 0 ? "+" : "") + e.surprisePct + "%" : ""}</div>
      </div>
    </div>`;
  }).join("");
}

async function drawRange(sym, range, view, q) {
  const series = await market.history(sym, range);
  const prevClose = range === "1D" ? q?.prevClose : null;
  const color = series[series.length - 1] >= series[0] ? "var(--up)" : "var(--down)";
  chartCtl.setData(series, { prevClose, color });
}

function renderStats(el, p, q) {
  const rows = [
    ["P / E ratio", p.pe ? p.pe.toFixed(1) : "—"],
    ["EPS (ttm)", p.eps ? "$" + p.eps.toFixed(2) : "—"],
    ["Market cap", fmtMcap(p.marketCap)],
    ["Div yield", p.div ? p.div.toFixed(2) + "%" : "—"],
    ["Day range", q ? `${fmtPrice(q.dayLow)}–${fmtPrice(q.dayHigh)}` : "—"],
    ["52-wk range", `${fmtPrice(p.lo52)}–${fmtPrice(p.hi52)}`],
    ["Avg volume", fmtVol(p.avgVol)],
    ["Prev close", q ? fmtPrice(q.prevClose) : "—"],
  ];
  el.innerHTML = rows.map(([k, v]) => `<div class="stat"><div class="stat-k">${k}</div><div class="stat-v">${v}</div></div>`).join("");
}

/* ================================================================
   ACCOUNT
   ================================================================ */
let authMode = "login";

function viewAccount() {
  const view = document.createElement("div");
  view.className = "view view-enter";
  if (!store.isAuthed) { renderAuth(view); }
  else { renderProfile(view); }
  viewport.replaceChildren(view);
}

function renderAuth(view) {
  const isLogin = authMode === "login";
  view.innerHTML = `
    <div class="auth">
      <div class="auth-mark">TAPE<span class="brand-dot">.</span></div>
      <p class="auth-tag">${isLogin ? "Sign in to keep your watchlist in sync across every session." : "Create an account — your current watchlist carries over."}</p>
      <div class="field"><label>Email</label><input id="au-email" type="email" autocomplete="email" placeholder="you@example.com" /></div>
      <div class="field"><label>Password</label><input id="au-pass" type="password" autocomplete="${isLogin ? "current-password" : "new-password"}" placeholder="••••••••" /></div>
      <div class="auth-err" id="au-err"></div>
      <button class="btn btn-primary btn-block" id="au-submit">${isLogin ? "Sign in" : "Create account"}</button>
      <div class="auth-switch">
        ${isLogin ? "New to TAPE?" : "Already have an account?"}
        <button id="au-switch">${isLogin ? "Create one" : "Sign in"}</button>
      </div>
      <div class="auth-switch" style="margin-top:22px;font-size:11.5px;color:var(--paper-3)">
        Local demo accounts only — stored on this device, not a server.<br>Your tickers persist either way.
      </div>
    </div>`;
  $("#au-switch", view).onclick = () => { authMode = isLogin ? "signup" : "login"; render(); };
  $("#au-submit", view).onclick = () => {
    const email = $("#au-email", view).value;
    const pass = $("#au-pass", view).value;
    const res = isLogin ? store.login(email, pass) : store.signup(email, pass);
    if (!res.ok) { $("#au-err", view).textContent = res.err; return; }
    paintAccountChip();
    toast(isLogin ? "Welcome back" : "Account created", "gold");
    render();
  };
  view.querySelectorAll("input").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#au-submit", view).click(); }));
}

function renderProfile(view) {
  const s = store.settings;
  const since = store.since ? new Date(store.since).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—";
  view.innerHTML = `
    <div class="profile">
      <div class="page-head" style="padding:0 0 16px"><div class="eyebrow">Account</div><h1 class="page-title">Profile</h1></div>
      <div class="profile-card">
        <div class="avatar">${store.email[0].toUpperCase()}</div>
        <div>
          <div class="profile-email">${esc(store.email)}</div>
          <div class="profile-since">Member since ${since} · ${store.watchlist.length} symbols tracked</div>
        </div>
      </div>

      <div class="block" style="margin:8px 0">
        <div class="block-title" style="font-size:19px">Data source</div>
        <div class="setting-row">
          <div><div class="setting-k">Live market data</div><div class="setting-desc">Use a free Finnhub API key for real quotes, profiles and news.</div></div>
          <div class="switch ${s.provider === "finnhub" ? "on" : ""}" id="sw-provider"></div>
        </div>
        <div class="field ${s.provider === "finnhub" ? "" : "hidden"}" id="key-field" style="margin-top:12px">
          <label>Finnhub API key</label>
          <input id="api-key" type="text" placeholder="paste key from finnhub.io" value="${esc(s.apiKey || "")}" />
        </div>

        <div class="setting-row">
          <div><div class="setting-k">Live updates</div><div class="setting-desc">Stream price ticks while the app is open.</div></div>
          <div class="switch ${s.liveUpdates ? "on" : ""}" id="sw-live"></div>
        </div>
        <div class="setting-row">
          <div><div class="setting-k">Flash on tick</div><div class="setting-desc">Highlight prices green/red as they change.</div></div>
          <div class="switch ${s.flash ? "on" : ""}" id="sw-flash"></div>
        </div>
      </div>

      <button class="btn btn-ghost btn-block" id="signout" style="margin-top:10px">Sign out</button>
      <div class="auth-switch" style="margin-top:26px;font-size:11px;color:var(--paper-3)">
        TAPE v0.1 · preview build · built for iOS &amp; web
      </div>
    </div>`;

  const provSwitch = $("#sw-provider", view);
  provSwitch.onclick = () => {
    const on = !provSwitch.classList.contains("on");
    provSwitch.classList.toggle("on", on);
    $("#key-field", view).classList.toggle("hidden", !on);
    store.setSetting("provider", on ? "finnhub" : "sim");
    applyProvider();
  };
  $("#api-key", view).addEventListener("change", (e) => { store.setSetting("apiKey", e.target.value.trim()); applyProvider(); });

  const liveSw = $("#sw-live", view);
  liveSw.onclick = () => { const on = !liveSw.classList.contains("on"); liveSw.classList.toggle("on", on); store.setSetting("liveUpdates", on); applyLive(); };
  const flashSw = $("#sw-flash", view);
  flashSw.onclick = () => { const on = !flashSw.classList.contains("on"); flashSw.classList.toggle("on", on); store.setSetting("flash", on); };

  $("#signout", view).onclick = () => { store.logout(); paintAccountChip(); toast("Signed out", "down"); authMode = "login"; render(); };
}

function applyProvider() {
  const s = store.settings;
  if (s.provider === "finnhub" && s.apiKey) {
    if (market.useFinnhub(s.apiKey)) { market.subscribe(applyTick); toast("Connected to Finnhub", "gold"); }
  } else {
    market.useSimulated();
  }
  applyLive();
}
function applyLive() {
  if (store.settings.liveUpdates) market.start(() => liveSymbols());
  else market.stop();
}
function liveSymbols() {
  const set = new Set(store.watchlist);
  ["AAPL","NVDA","MSFT","TSLA","AMZN","META","GOOGL","AMD","JPM","NFLX","AVGO","LLY"].forEach((s) => set.add(s));
  const cur = currentStockSym();
  if (cur) set.add(cur);
  return [...set];
}

/* ================================================================
   ROUTER
   ================================================================ */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [route, arg] = h.split("/");
  return { route: route || "watchlist", arg };
}
function currentStockSym() {
  const { route, arg } = parseHash();
  return route === "stock" ? arg : null;
}
function navigate(path) { location.hash = "#/" + path; }

function setActiveTab(route) {
  const tabRoute = route === "stock" ? "watchlist" : route;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.route === tabRoute));
}

function render() {
  const { route, arg } = parseHash();
  setActiveTab(route);
  if (route !== "watchlist") editing = false;
  // floating add button: watchlist only, not while editing, only once there are rows
  $("#fab").classList.toggle("show", route === "watchlist" && !editing && store.watchlist.length > 0);
  switch (route) {
    case "search": return viewSearch();
    case "research": return viewResearch();
    case "account": return viewAccount();
    case "stock": return arg ? viewStock(arg) : viewWatchlist();
    default: return viewWatchlist();
  }
}

/* ================================================================
   BOOT
   ================================================================ */
document.querySelectorAll(".tab").forEach((t) => t.onclick = () => navigate(t.dataset.route));
$("#account-chip").onclick = () => navigate("account");
$("#fab").onclick = () => openAddSheet();
viewport.addEventListener("scroll", () => closeAllSwipes());
window.addEventListener("hashchange", render);

paintClock();
setInterval(paintClock, 30000);
paintAccountChip();
applyProvider();         // sets provider + starts live loop
renderTape();
if (!location.hash) location.hash = "#/watchlist";
render();
