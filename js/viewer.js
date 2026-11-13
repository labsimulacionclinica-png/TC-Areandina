// Visor 2D: axial, coronal y sagital (MPR) con ventana/nivel, desplazamiento, ROI y lectura de HU.
import { rainbow, viridis } from './perfusion.js';
const N = 256;

// Muestra bilineal de una imagen axial 256×256 en coordenadas de píxel
function sampleXY(img, x, y) {
  if (x < 0 || y < 0 || x >= N - 1 || y >= N - 1) return -1024;
  const ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy, p = iy * N + ix;
  return img[p] * (1 - fx) * (1 - fy) + img[p + 1] * fx * (1 - fy) + img[p + N] * (1 - fx) * fy + img[p + N + 1] * fx * fy;
}

export class Viewer {
  constructor(canvas, { onInfo } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onInfo = onInfo || (() => {});
    this.series = null;
    this.view = 'axial';
    this.index = 0;     // corte axial
    this.mprRow = N / 2; // fila (coronal) o columna (sagital)
    this.ww = 400; this.wl = 40;
    this.zoom = 1;
    this.roi = null; this.line = null;
    this.tool = 'wl';
    this.off = document.createElement('canvas');
    this.bindEvents();
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  setSeries(series) {
    this.series = series;
    this.index = Math.min(this.index, Math.max(0, (series?.slices.length || 1) - 1));
    if (series && !this._kept) this.index = Math.floor(series.slices.length / 2);
    this.roi = null; this.line = null;
    this.draw();
  }
  setWindow(ww, wl) { this.ww = ww; this.wl = wl; this.draw(); }
  setView(v) { this.view = v; this.roi = null; this.line = null; this.draw(); }

  // Imagen 2D actual (Float32 o Int16) con sus dimensiones y aspecto del píxel
  current() {
    const s = this.series;
    if (!s || !s.slices.length) return null;
    // Caché: las vistas reformateadas (sobre todo la 3D) son caras y current() se llama en cada movimiento del ratón
    const key = [this.view, this.index, this.mprRow, this.slab, JSON.stringify(this.oblique), this.curve?.length, JSON.stringify(this.curve?.at(-1)), this.azimuth, this.view.endsWith('3d') ? `${this.ww}|${this.wl}` : '', s.slices.filter(Boolean).length].join('#');
    if (this._cache && this._cache.series === s && this._cache.key === key) return this._cache.cur;
    const cur = this.computeCurrent(s);
    this._cache = { series: s, key, cur };
    return cur;
  }

  computeCurrent(s) {
    const n = s.slices.length;
    const rpx = s.dfov / N, zsp = s.interval;
    const slab = this.slab || 0; // grosor del MIP en mm (0 = sin MIP)
    if (this.view === 'axial') {
      const c = Math.max(0, Math.min(n - 1, this.index));
      const img = s.slices[c];
      if (!img) return null;
      const h = Math.floor(slab / 2 / zsp);
      if (!h) return { img, w: N, h: N, aspect: 1 };
      const out = Int16Array.from(img);
      for (let k = Math.max(0, c - h); k <= Math.min(n - 1, c + h); k++) {
        const sl = s.slices[k];
        if (sl) for (let p = 0; p < N * N; p++) if (sl[p] > out[p]) out[p] = sl[p];
      }
      return { img: out, w: N, h: N, aspect: 1 };
    }
    if (this.view === 'oblique') return this.obliqueImage(s, rpx, zsp);
    if (this.view === 'curved') return this.curvedImage(s, rpx, zsp);
    if (this.view === 'mip3d' || this.view === 'vr3d') return this.render3D(s, rpx, zsp);
    const out = new Int16Array(N * n).fill(-1024);
    const r = Math.round(this.mprRow), h = Math.floor(slab / 2 / rpx);
    for (let k = 0; k < n; k++) {
      const sl = s.slices[k];
      if (!sl) continue;
      for (let rr = Math.max(0, r - h); rr <= Math.min(N - 1, r + h); rr++) {
        for (let j = 0; j < N; j++) {
          const v = this.view === 'coronal' ? sl[rr * N + j] : sl[j * N + rr];
          if (v > out[k * N + j]) out[k * N + j] = v;
        }
      }
    }
    // sagital: horizontal = anterior → posterior (fila de la imagen axial)
    return { img: out, w: N, h: n, aspect: zsp / rpx };
  }

  // --- MPR oblicua: plano vertical que pasa por (cx, cy) de la imagen axial con el ángulo elegido ---
  obliqueImage(s, rpx, zsp) {
    const n = s.slices.length, o = (this.oblique ||= { angle: 30, cx: N / 2, cy: N / 2 });
    const a = (o.angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const out = new Int16Array(N * n).fill(-1024);
    for (let k = 0; k < n; k++) {
      const sl = s.slices[k];
      if (!sl) continue;
      for (let t = 0; t < N; t++) out[k * N + t] = sampleXY(sl, o.cx + (t - N / 2) * ca, o.cy + (t - N / 2) * sa);
    }
    return { img: out, w: N, h: n, aspect: zsp / rpx };
  }

  // --- MPR curva enderezada: a lo largo de un trayecto 3D marcado con puntos en los cortes axiales ---
  curvedImage(s, rpx, zsp) {
    const pts = this.curve || [];
    if (pts.length < 2) return null;
    const zf = zsp / rpx; // un corte equivale a zf píxeles
    const P = pts.map((p) => [p.x, p.y, p.k * zf]);
    // remuestreo cada 1 píxel a lo largo del trayecto
    const path = [];
    for (let i = 0; i < P.length - 1; i++) {
      const [a, b] = [P[i], P[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      for (let t = 0; t < L; t += 1) path.push(a.map((v, j) => v + ((b[j] - v) * t) / L));
    }
    path.push(P[P.length - 1]);
    const HW = 60, w = 2 * HW + 1, out = new Int16Array(w * path.length).fill(-1024);
    let nx = 1, ny = 0;
    for (let r = 0; r < path.length; r++) {
      const a = path[Math.max(0, r - 2)], b = path[Math.min(path.length - 1, r + 2)];
      const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty);
      if (tl > 0.3) { nx = -ty / tl; ny = tx / tl; } // normal en el plano axial
      const [x, y, zz] = path[r], k = zz / zf, k0 = Math.floor(k), f = k - k0;
      const s0 = s.slices[Math.max(0, Math.min(s.slices.length - 1, k0))], s1 = s.slices[Math.max(0, Math.min(s.slices.length - 1, k0 + 1))];
      if (!s0 || !s1) continue;
      for (let c = -HW; c <= HW; c++) {
        const px = x + nx * c, py = y + ny * c;
        out[r * w + c + HW] = Math.round(sampleXY(s0, px, py) * (1 - f) + sampleXY(s1, px, py) * f);
      }
    }
    return { img: out, w, h: path.length, aspect: 1 };
  }

  // --- 3D: MIP o renderizado de volumen (trazado de rayos en CPU), girando alrededor del eje cráneo-caudal ---
  render3D(s, rpx, zsp) {
    const n = s.slices.length, D = 2; // submuestreo en el plano
    const X = N / D, zs = zsp / (rpx * D); // espaciado entre cortes en vóxeles
    const az = ((this.azimuth || 0) * Math.PI) / 180;
    const dx = Math.sin(az), dy = Math.cos(az), rx = Math.cos(az), ry = -Math.sin(az);
    const W = Math.ceil(X * 1.42), H = Math.max(2, Math.round(n * zs));
    const rgb = new Uint8ClampedArray(W * H * 4);
    const lo = this.wl - this.ww / 2, hi = this.wl + this.ww / 2;
    const vr = this.view === 'vr3d';
    const steps = Math.ceil(X * 1.42);
    for (let v = 0; v < H; v++) {
      const k = Math.min(n - 1, Math.round(v / zs)), sl = s.slices[k];
      if (!sl) continue;
      for (let u = 0; u < W; u++) {
        // origen del rayo en el plano de proyección (centrado en el volumen)
        let x = X / 2 + rx * (u - W / 2) - dx * (steps / 2), y = X / 2 + ry * (u - W / 2) - dy * (steps / 2);
        let mx = -1024, accA = 0, accC = 0;
        for (let t = 0; t < steps; t++, x += dx, y += dy) {
          if (x < 0 || y < 0 || x >= X - 1 || y >= X - 1) continue;
          const val = sl[((y * D) | 0) * N + ((x * D) | 0)];
          if (!vr) { if (val > mx) mx = val; continue; }
          // función de transferencia: transparente por debajo del nivel, opaco hacia nivel + ventana/2
          const al = Math.max(0, Math.min(1, (val - this.wl) / (this.ww / 2))) * 0.35;
          if (al <= 0) continue;
          const shade = 1 - 0.55 * (t / steps); // atenuación con la profundidad
          accC += (1 - accA) * al * shade;
          accA += (1 - accA) * al;
          if (accA > 0.97) break;
        }
        const p = 4 * (v * W + u);
        if (vr) { const g = accC * 255; rgb[p] = g; rgb[p + 1] = g * 0.92; rgb[p + 2] = g * 0.8; }
        else { const g = Math.max(0, Math.min(255, ((mx - lo) / (hi - lo)) * 255)); rgb[p] = rgb[p + 1] = rgb[p + 2] = g; }
        rgb[p + 3] = 255;
      }
    }
    return { rgb, w: W, h: H, aspect: 1, is3d: true };
  }

  layout(cur) {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    const iw = cur.w, ih = cur.h * cur.aspect;
    const scale = Math.min(W / iw, H / ih) * this.zoom;
    return { W, H, scale, dw: iw * scale, dh: ih * scale, x0: (W - iw * scale) / 2, y0: (H - ih * scale) / 2 };
  }

  draw() {
    const c = this.canvas, dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const cur = this.current();
    if (!cur) { this.onInfo(null); return; }
    this.off.width = cur.w; this.off.height = cur.h;
    const octx = this.off.getContext('2d');
    const id = octx.createImageData(cur.w, cur.h);
    const lo = this.wl - this.ww / 2, k = 255 / this.ww;
    const pal = Viewer.palette || 'rainbow';
    if (this.lutFor !== pal) { this.colorLut = Array.from({ length: 256 }, (_, i) => (pal === 'viridis' ? viridis : rainbow)(i / 255)); this.lutFor = pal; }
    const color = this.series.colormap ? this.colorLut : null;
    if (cur.rgb) id.data.set(cur.rgb);
    else for (let p = 0; p < cur.w * cur.h; p++) {
      const g = Math.max(0, Math.min(255, (cur.img[p] - lo) * k));
      if (color) {
        const [r, gg, b] = cur.img[p] <= 0 ? [0, 0, 0] : color[g | 0];
        id.data[4 * p] = r; id.data[4 * p + 1] = gg; id.data[4 * p + 2] = b;
      } else id.data[4 * p] = id.data[4 * p + 1] = id.data[4 * p + 2] = g;
      id.data[4 * p + 3] = 255;
    }
    octx.putImageData(id, 0, 0);
    const L = this.layout(cur);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.off, L.x0, L.y0, L.dw, L.dh);
    // líneas de referencia en MPR
    if (this.view === 'axial' && this.showRef) {
      ctx.strokeStyle = 'rgba(242,193,78,.6)'; ctx.setLineDash([4, 4]);
      const y = L.y0 + (this.mprRow / N) * L.dh;
      ctx.beginPath(); ctx.moveTo(L.x0, y); ctx.lineTo(L.x0 + L.dw, y); ctx.stroke(); ctx.setLineDash([]);
    }
    const P = (x, y) => [L.x0 + x * L.scale, L.y0 + y * L.scale];
    // En axial: plano oblicuo y puntos del trayecto curvo
    if (this.view === 'axial' && this.oblique && this.tool === 'oblique') {
      const o = this.oblique, a = (o.angle * Math.PI) / 180;
      ctx.strokeStyle = 'rgba(156,205,79,.9)'; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(...P(o.cx - 180 * Math.cos(a), o.cy - 180 * Math.sin(a))); ctx.lineTo(...P(o.cx + 180 * Math.cos(a), o.cy + 180 * Math.sin(a))); ctx.stroke(); ctx.setLineDash([]);
    }
    if (this.view === 'axial' && this.curve?.length) {
      ctx.fillStyle = '#e5605a'; ctx.strokeStyle = 'rgba(229,96,90,.6)';
      ctx.beginPath();
      this.curve.forEach((p, i) => { const [x, y] = P(p.x, p.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      for (const p of this.curve) {
        const [x, y] = P(p.x, p.y);
        ctx.globalAlpha = p.k === this.index ? 1 : 0.4;
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // Anotaciones externas (p. ej. trayectoria planificada de la biopsia), en el corte de su z
    if (this.view === 'axial' && this.annotations?.length) {
      const zc = this.series.zs[this.index], th = this.series.params?.thickness || 2.5;
      for (const a of this.annotations) {
        if (a.z != null && Math.abs(a.z - zc) > th) continue;
        ctx.strokeStyle = a.color || '#f2c14e'; ctx.fillStyle = a.color || '#f2c14e'; ctx.lineWidth = 1.5;
        ctx.setLineDash(a.dash ? [5, 4] : []);
        if (a.x1 != null) { ctx.beginPath(); ctx.moveTo(...P(a.x0, a.y0)); ctx.lineTo(...P(a.x1, a.y1)); ctx.stroke(); }
        else { const [x, y] = P(a.x0, a.y0); ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.stroke(); }
        if (a.label) { ctx.font = '12px Segoe UI, sans-serif'; ctx.fillText(a.label, ...P((a.x1 ?? a.x0) + 3, (a.y1 ?? a.y0) - 3)); }
        ctx.setLineDash([]);
      }
    }
    if (cur.is3d) { ctx.fillStyle = '#cfe3ee'; ctx.font = '12px Segoe UI, sans-serif'; ctx.fillText(`Giro ${Math.round(this.azimuth || 0)}° · arrastre para girar`, 10, H - 10); }
    if (this.line) {
      const l = this.line, X = (x) => L.x0 + x * L.scale, Y = (y) => L.y0 + y * cur.aspect * L.scale;
      ctx.strokeStyle = '#4cc38a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X(l.x0), Y(l.y0)); ctx.lineTo(X(l.x1), Y(l.y1)); ctx.stroke();
      const rpx = this.series.dfov / N;
      const mm = Math.hypot((l.x1 - l.x0) * rpx, (l.y1 - l.y0) * cur.aspect * rpx);
      ctx.fillStyle = '#4cc38a'; ctx.font = '12px Segoe UI, sans-serif';
      ctx.fillText(`${mm.toFixed(1)} mm`, X(l.x1) + 6, Y(l.y1));
    }
    if (this.roi) {
      const r = this.roi;
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(L.x0 + r.cx * L.scale, L.y0 + r.cy * cur.aspect * L.scale, Math.max(2, r.r * L.scale), 0, 2 * Math.PI); ctx.stroke();
      const st = this.roiStats(cur, r);
      if (st) {
        ctx.fillStyle = '#f2c14e'; ctx.font = '12px Segoe UI, sans-serif';
        ctx.fillText(`Media ${st.mean.toFixed(0)} HU · DE ${st.sd.toFixed(1)} · ${st.area.toFixed(0)} mm²`, L.x0 + (r.cx + r.r) * L.scale + 6, L.y0 + r.cy * cur.aspect * L.scale);
      }
    }
    this.onInfo(this.info());
  }

  roiStats(cur, r) {
    let s = 0, s2 = 0, n = 0;
    for (let y = Math.floor(r.cy - r.r); y <= Math.ceil(r.cy + r.r); y++) for (let x = Math.floor(r.cx - r.r); x <= Math.ceil(r.cx + r.r); x++) {
      if (x < 0 || y < 0 || x >= cur.w || y >= cur.h) continue;
      if ((x - r.cx) ** 2 + ((y - r.cy) * cur.aspect) ** 2 > r.r * r.r) continue;
      const v = cur.img[y * cur.w + x]; s += v; s2 += v * v; n++;
    }
    if (!n) return null;
    const mean = s / n, rpx = this.series.dfov / N;
    return { mean, sd: Math.sqrt(Math.max(0, s2 / n - mean * mean)), area: n * rpx * rpx * (this.view === 'axial' ? 1 : this.series.interval / rpx), n };
  }

  info() {
    const s = this.series;
    if (!s) return null;
    const z = this.view === 'axial' ? s.zs[this.index] : null;
    return { view: this.view, index: this.index, n: s.slices.length, z, ww: this.ww, wl: this.wl, hover: this.hover };
  }

  toImage(ev) {
    const cur = this.current();
    if (!cur) return null;
    const rect = this.canvas.getBoundingClientRect();
    const L = this.layout(cur);
    const x = (ev.clientX - rect.left - L.x0) / L.scale, y = (ev.clientY - rect.top - L.y0) / L.scale / cur.aspect;
    return { x, y, cur };
  }

  bindEvents() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.series) return;
      const d = Math.sign(e.deltaY);
      if (e.ctrlKey) { this.zoom = Math.max(0.5, Math.min(4, this.zoom * (d > 0 ? 0.9 : 1.1))); this.draw(); return; }
      if (this.view === 'axial') this.index = Math.max(0, Math.min(this.series.slices.length - 1, this.index + d));
      else this.mprRow = Math.max(0, Math.min(N - 1, this.mprRow + d * 2));
      this.roi = null; this.line = null;
      this.draw();
    }, { passive: false });
    // Teclado (accesibilidad): flechas/RePág/AvPág = cortes, +/− = zoom, 0 = restablecer
    c.tabIndex = 0;
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', 'Visor de imágenes. Flechas arriba y abajo: cambiar de corte; más y menos: zoom; cero: restablecer.');
    c.addEventListener('keydown', (e) => {
      if (!this.series) return;
      const d = { ArrowDown: 1, ArrowRight: 1, PageDown: 5, ArrowUp: -1, ArrowLeft: -1, PageUp: -5 }[e.key];
      if (d) {
        e.preventDefault();
        if (this.view === 'axial') this.index = Math.max(0, Math.min(this.series.slices.length - 1, this.index + d));
        else this.mprRow = Math.max(0, Math.min(N - 1, this.mprRow + d * 2));
      } else if (e.key === '+' || e.key === '=') this.zoom = Math.min(5, this.zoom * 1.15);
      else if (e.key === '-') this.zoom = Math.max(0.5, this.zoom / 1.15);
      else if (e.key === '0') this.zoom = 1;
      else return;
      this.draw();
    });
    // Gestos táctiles: dos dedos = zoom (pellizco)
    const touches = new Map();
    let pinch = null;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => {
      const p = this.toImage(e);
      if (!p) return;
      try { c.setPointerCapture(e.pointerId); } catch { /* puntero no capturable */ }
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) {
          const [a, b] = [...touches.values()];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
          drag = null;
          return;
        }
      }
      const is3d = this.view === 'mip3d' || this.view === 'vr3d';
      if (this.pick && this.view === 'axial' && e.button === 0) { this.pick(p); return; } // selección externa (biopsia)
      if (this.view === 'axial' && this.tool === 'curve' && e.button === 0) {
        (this.curve ||= []).push({ x: p.x, y: p.y, k: this.index });
        this.onCurve?.(this.curve.length);
        this.draw();
        return;
      }
      const obl = this.view === 'axial' && this.tool === 'oblique' && e.button === 0;
      if (obl) { this.oblique = { ...(this.oblique || { angle: 30 }), cx: p.x, cy: p.y }; this.draw(); }
      const roiMode = !is3d && this.tool === 'roi' && e.button === 0, distMode = !is3d && this.tool === 'dist' && e.button === 0, scrollMode = this.tool === 'scroll';
      drag = { x: e.clientX, y: e.clientY, ww: this.ww, wl: this.wl, roi: roiMode, dist: distMode, scroll: scrollMode, rotate: is3d, obl, az: this.azimuth || 0, start: p, index: this.index, row: this.mprRow };
      if (roiMode) { this.roi = { cx: p.x, cy: p.y, r: 1 }; this.draw(); }
      if (distMode) { this.line = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; this.draw(); }
    });
    c.addEventListener('pointermove', (e) => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size === 2) {
        const [a, b] = [...touches.values()];
        this.zoom = Math.max(0.5, Math.min(5, (pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d));
        this.draw();
        return;
      }
      const p = this.toImage(e);
      if (p && p.cur.img && p.x >= 0 && p.y >= 0 && p.x < p.cur.w && p.y < p.cur.h) {
        this.hover = { hu: p.cur.img[Math.floor(p.y) * p.cur.w + Math.floor(p.x)] };
      } else this.hover = null;
      if (!drag) { this.onInfo(this.info()); return; }
      if (drag.rotate) {
        this.azimuth = (drag.az + (e.clientX - drag.x) * 0.6 + 360) % 360;
      } else if (drag.obl) {
        if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 3) this.oblique.angle = ((Math.atan2(p.y - drag.start.y, p.x - drag.start.x) * 180) / Math.PI + 180) % 180;
      } else if (drag.scroll && this.series) {
        const steps = Math.round((e.clientY - drag.y) / 8);
        if (this.view === 'axial') this.index = Math.max(0, Math.min(this.series.slices.length - 1, drag.index + steps));
        else this.mprRow = Math.max(0, Math.min(N - 1, drag.row + steps * 2));
      } else if (drag.roi) {
        this.roi.r = Math.max(1, Math.hypot(p.x - drag.start.x, (p.y - drag.start.y) * p.cur.aspect));
      } else if (drag.dist) {
        this.line.x1 = p.x; this.line.y1 = p.y;
      } else {
        this.ww = Math.max(1, drag.ww + (e.clientX - drag.x) * 4);
        this.wl = drag.wl - (e.clientY - drag.y) * 2;
        this.onWindowChange?.();
      }
      this.draw();
    });
    const end = (e) => { drag = null; touches.delete(e.pointerId); if (touches.size < 2) pinch = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('dblclick', () => { this.zoom = 1; this.draw(); });
  }
}

// Dibuja un topograma (proyección) en un canvas con escala de grises y devuelve la transformación z ↔ píxel.
export function drawTopogram(canvas, topo, { lo = 0, hi = null } = {}) {
  if (hi == null) { hi = 0; for (const v of topo.img) if (v > hi) hi = v; hi = Math.max(1, hi * 0.95); }
  const off = document.createElement('canvas');
  off.width = topo.cols; off.height = topo.rows;
  const ctx = off.getContext('2d');
  const id = ctx.createImageData(topo.cols, topo.rows);
  for (let p = 0; p < topo.cols * topo.rows; p++) {
    const g = Math.max(0, Math.min(255, ((topo.img[p] - lo) / (hi - lo)) * 255));
    id.data[4 * p] = id.data[4 * p + 1] = id.data[4 * p + 2] = g; id.data[4 * p + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  return off;
}
