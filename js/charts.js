/* ============================================================
   charts.js — custom SVG charts (no libraries, full design control)
     • sparkline()        tiny inline trend lines for list rows
     • DetailChart        large interactive area chart w/ scrubbing
   ============================================================ */

const NS = "http://www.w3.org/2000/svg";

/* ---- small inline sparkline, returns an <svg> string ---- */
export function sparkline(values, { w = 64, h = 30, up } = {}) {
  if (!values || values.length < 2) return "";
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const stepX = w / (values.length - 1);
  const y = (v) => h - 2 - ((v - min) / span) * (h - 4);
  let d = "";
  values.forEach((v, i) => { d += `${i ? "L" : "M"}${(i * stepX).toFixed(2)} ${y(v).toFixed(2)} `; });
  const rising = up ?? values[values.length - 1] >= values[0];
  const color = rising ? "var(--up)" : "var(--down)";
  const id = "g" + Math.abs(values[0] * 1000 | 0) + values.length;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity=".28"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${d} L ${w} ${h} L 0 ${h} Z" fill="url(#${id})"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ---- large interactive chart ---- */
export class DetailChart {
  constructor(container) {
    this.el = container;
    this.W = 1000; this.H = 420;     // viewBox units
    this.padT = 28; this.padB = 26; this.padL = 8; this.padR = 8;
    this.values = [];
    this.onScrub = null;
    this._build();
  }

  _build() {
    this.el.innerHTML = "";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${this.W} ${this.H}`);
    svg.setAttribute("class", "chart-svg");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.height = "230px";
    this.svg = svg;

    // gridlines group
    this.grid = document.createElementNS(NS, "g"); svg.appendChild(this.grid);
    // gradient def
    const defs = document.createElementNS(NS, "defs");
    const grad = document.createElementNS(NS, "linearGradient");
    grad.setAttribute("id", "areaGrad"); grad.setAttribute("x1", "0"); grad.setAttribute("x2", "0"); grad.setAttribute("y1", "0"); grad.setAttribute("y2", "1");
    grad.innerHTML = `<stop offset="0" stop-color="var(--col)" stop-opacity=".26"/><stop offset="1" stop-color="var(--col)" stop-opacity="0"/>`;
    defs.appendChild(grad); svg.appendChild(defs);

    this.area = document.createElementNS(NS, "path");
    this.area.setAttribute("fill", "url(#areaGrad)");
    svg.appendChild(this.area);

    this.line = document.createElementNS(NS, "path");
    this.line.setAttribute("fill", "none");
    this.line.setAttribute("stroke", "var(--col)");
    this.line.setAttribute("stroke-width", "2.4");
    this.line.setAttribute("stroke-linecap", "round");
    this.line.setAttribute("stroke-linejoin", "round");
    this.line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(this.line);

    // baseline (prev close) dashed
    this.baseLine = document.createElementNS(NS, "line");
    this.baseLine.setAttribute("stroke", "var(--paper-3)");
    this.baseLine.setAttribute("stroke-width", "1");
    this.baseLine.setAttribute("stroke-dasharray", "3 5");
    this.baseLine.setAttribute("vector-effect", "non-scaling-stroke");
    this.baseLine.setAttribute("opacity", ".5");
    svg.appendChild(this.baseLine);

    // crosshair
    this.cross = document.createElementNS(NS, "line");
    this.cross.setAttribute("stroke", "var(--paper-2)");
    this.cross.setAttribute("stroke-width", "1");
    this.cross.setAttribute("vector-effect", "non-scaling-stroke");
    this.cross.setAttribute("opacity", "0");
    svg.appendChild(this.cross);
    this.dot = document.createElementNS(NS, "circle");
    this.dot.setAttribute("r", "4.5");
    this.dot.setAttribute("fill", "var(--ink)");
    this.dot.setAttribute("stroke", "var(--col)");
    this.dot.setAttribute("stroke-width", "2.5");
    this.dot.setAttribute("opacity", "0");
    svg.appendChild(this.dot);

    this.el.appendChild(svg);

    // scrub readout
    this.readout = document.createElement("div");
    this.readout.className = "chart-scrub";
    this.el.appendChild(this.readout);

    this._bindScrub();
  }

  _x(i) { return this.padL + (i / (this.values.length - 1)) * (this.W - this.padL - this.padR); }
  _y(v) {
    const r = this.max - this.min || 1;
    return this.padT + (1 - (v - this.min) / r) * (this.H - this.padT - this.padB);
  }

  setData(values, { prevClose, color, animate = true } = {}) {
    this.values = values;
    this.min = Math.min(...values, prevClose ?? Infinity);
    this.max = Math.max(...values, prevClose ?? -Infinity);
    // pad range a touch
    const pad = (this.max - this.min) * 0.08 || 1;
    this.min -= pad; this.max += pad;
    this.col = color || (values[values.length - 1] >= values[0] ? "var(--up)" : "var(--down)");
    this.svg.style.setProperty("--col", this.col);

    let d = "";
    values.forEach((v, i) => { d += `${i ? "L" : "M"}${this._x(i).toFixed(2)} ${this._y(v).toFixed(2)} `; });
    this.line.setAttribute("d", d);
    const baseY = this.H - this.padB;
    this.area.setAttribute("d", `${d} L ${this._x(values.length - 1).toFixed(2)} ${baseY} L ${this._x(0).toFixed(2)} ${baseY} Z`);

    if (prevClose != null) {
      const py = this._y(prevClose);
      this.baseLine.setAttribute("x1", this.padL); this.baseLine.setAttribute("x2", this.W - this.padR);
      this.baseLine.setAttribute("y1", py); this.baseLine.setAttribute("y2", py);
      this.baseLine.style.display = "";
    } else { this.baseLine.style.display = "none"; }

    // gridlines
    this.grid.innerHTML = "";
    for (let g = 0; g <= 3; g++) {
      const yy = this.padT + (g / 3) * (this.H - this.padT - this.padB);
      const ln = document.createElementNS(NS, "line");
      ln.setAttribute("x1", this.padL); ln.setAttribute("x2", this.W - this.padR);
      ln.setAttribute("y1", yy); ln.setAttribute("y2", yy);
      ln.setAttribute("stroke", "var(--line)"); ln.setAttribute("stroke-width", "1");
      ln.setAttribute("vector-effect", "non-scaling-stroke");
      this.grid.appendChild(ln);
    }

    if (animate) {
      const len = this.line.getTotalLength ? this.line.getTotalLength() : 1500;
      this.line.style.transition = "none";
      this.line.style.strokeDasharray = len;
      this.line.style.strokeDashoffset = len;
      this.area.style.opacity = "0";
      requestAnimationFrame(() => {
        this.line.style.transition = "stroke-dashoffset .9s cubic-bezier(.16,1,.3,1)";
        this.area.style.transition = "opacity .9s ease";
        this.line.style.strokeDashoffset = "0";
        this.area.style.opacity = "1";
      });
      setTimeout(() => { this.line.style.strokeDasharray = "none"; }, 950);
    }
  }

  _bindScrub() {
    const move = (clientX) => {
      const rect = this.svg.getBoundingClientRect();
      const rel = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const i = Math.round(rel * (this.values.length - 1));
      if (isNaN(i) || !this.values.length) return;
      const x = this._x(i), y = this._y(this.values[i]);
      this.cross.setAttribute("x1", x); this.cross.setAttribute("x2", x);
      this.cross.setAttribute("y1", this.padT - 6); this.cross.setAttribute("y2", this.H - this.padB);
      this.cross.setAttribute("opacity", ".5");
      this.dot.setAttribute("cx", x); this.dot.setAttribute("cy", y); this.dot.setAttribute("opacity", "1");
      if (this.onScrub) this.onScrub(this.values[i], i, rel);
    };
    const end = () => {
      this.cross.setAttribute("opacity", "0"); this.dot.setAttribute("opacity", "0");
      this.readout.classList.remove("show");
      if (this.onScrub) this.onScrub(null);
    };
    this.svg.addEventListener("pointerdown", (e) => { this.svg.setPointerCapture(e.pointerId); move(e.clientX); this.readout.classList.add("show"); });
    this.svg.addEventListener("pointermove", (e) => { if (e.buttons || e.pressure) move(e.clientX); });
    this.svg.addEventListener("pointerup", end);
    this.svg.addEventListener("pointercancel", end);
    this.svg.addEventListener("pointerleave", (e) => { if (!e.buttons) end(); });
  }
}
