// Mapas de perfusión cerebral a partir de las imágenes dinámicas reconstruidas (método de los momentos):
//   CBV = ∫C_tejido / ∫C_arterial        (mL/100 mL)
//   MTT = primer momento del tejido − primer momento arterial   (s)
//   CBF = CBV / MTT · 60                 (mL/100 g/min)
//   Tmax ≈ retraso del pico del tejido respecto al pico arterial (s)
// Núcleo del infarto: CBF relativo < 30 % del hemisferio sano. Hipoperfusión: Tmax > 6 s.

const N = 256;

function smooth(img, passes = 2) {
  let a = Float32Array.from(img), b = new Float32Array(N * N);
  for (let k = 0; k < passes; k++) {
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      let s = 0, n = 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const y = i + di, x = j + dj;
        if (y < 0 || x < 0 || y >= N || x >= N) continue;
        s += a[y * N + x]; n++;
      }
      b[i * N + j] = s / n;
    }
    [a, b] = [b, a];
  }
  return a;
}

// frames: Int16Array[] (una imagen por instante) del mismo nivel; times: s
// AIF: píxeles con realce alto y pico MÁS PRECOZ (arterias). VOF: píxeles con pico tardío y gran área (senos venosos).
// Como las arterias son pequeñas, el volumen parcial reduce la AIF; se corrige escalándola para que su área
// iguale la de la salida venosa (los senos son grandes y casi no tienen volumen parcial).
export function arterialInput(frames, times) {
  const base = (p) => (frames[0][p] + frames[1][p] + frames[2][p]) / 3;
  const cand = [];
  for (let p = 0; p < N * N; p++) {
    const b = base(p);
    if (b < -50 || b > 120) continue;
    let mx = -1e9, at = 0, auc = 0;
    for (let f = 0; f < frames.length; f++) { const v = frames[f][p] - b; auc += Math.max(0, v); if (v > mx) { mx = v; at = f; } }
    if (mx > 40) cand.push({ p, mx, at, auc });
  }
  if (!cand.length) return times.map(() => 0);
  const strong = [...cand].sort((a, b) => b.mx - a.mx).slice(0, 300);
  const ttps = strong.map((c) => c.at).sort((a, b) => a - b);
  const early = ttps[Math.floor(ttps.length * 0.1)];
  const art = strong.filter((c) => c.at <= early + 1).sort((a, b) => b.mx - a.mx).slice(0, 8);
  const curveOf = (set) => times.map((_, f) => set.reduce((s, c) => s + frames[f][c.p] - base(c.p), 0) / Math.max(1, set.length));
  const aif = curveOf(art);
  const ven = cand.filter((c) => c.at >= early + 3).sort((a, b) => b.auc - a.auc).slice(0, 8);
  if (ven.length) {
    const vof = curveOf(ven);
    const area = (c) => c.reduce((s, v) => s + Math.max(0, v), 0);
    const k = area(vof) / Math.max(1e-6, area(aif));
    if (k > 1 && k < 10) for (let f = 0; f < aif.length; f++) aif[f] *= k;
  }
  return aif;
}

// Momentos de una curva (integración con signo: el ruido se cancela en lugar de sumarse)
function moments(curve, times) {
  // suavizado temporal [1 2 1]
  const c = curve.map((v, f) => (curve[Math.max(0, f - 1)] + 2 * v + curve[Math.min(curve.length - 1, f + 1)]) / 4);
  let auc = 0, m1 = 0, peak = -1e9, tp = 0;
  for (let f = 1; f < c.length; f++) {
    const dt = times[f] - times[f - 1];
    auc += c[f] * dt; m1 += c[f] * times[f] * dt;
    if (c[f] > peak) { peak = c[f]; tp = times[f]; }
  }
  return { auc, fmt: auc > 0 ? m1 / auc : 0, tp, peak };
}

// Devuelve mapas en Float32 (CBF, CBV, MTT, Tmax) y una máscara de cerebro
export function perfusionMaps(framesIn, times, aifCurve = null) {
  const frames = framesIn.map((f) => smooth(f, 5));
  const aif = aifCurve || arterialInput(framesIn, times);
  const A = moments(aif, times);
  const cbf = new Float32Array(N * N), cbv = new Float32Array(N * N), mtt = new Float32Array(N * N), tmax = new Float32Array(N * N), mask = new Uint8Array(N * N);
  for (let p = 0; p < N * N; p++) {
    const b = (frames[0][p] + frames[1][p] + frames[2][p]) / 3;
    if (b < 12 || b > 60) continue; // solo parénquima
    mask[p] = 1;
    const curve = frames.map((f) => f[p] - b);
    const T = moments(curve, times);
    const v = (100 * T.auc) / Math.max(1e-6, A.auc);
    if (v > 12) { mask[p] = 0; continue; } // vasos
    const m = Math.max(1, Math.min(30, T.fmt - A.fmt));
    cbv[p] = v; mtt[p] = m; cbf[p] = (v / m) * 60; tmax[p] = Math.max(0, Math.min(25, T.tp - A.tp));
  }
  return { cbf, cbv, mtt, tmax, mask, aif };
}

// Volúmenes de núcleo e hipoperfusión (mL) en un conjunto de niveles; voxel = rpx² · grosor
export function perfusionSummary(levels, rpx, thickness) {
  const vox = (rpx * rpx * thickness) / 1000;
  // CBF de referencia: mediana del hemisferio con menos Tmax prolongado
  const vals = { L: [], R: [] };
  for (const m of levels) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const p = i * N + j;
    if (!m.mask[p]) continue;
    (j < N / 2 ? vals.R : vals.L).push([m.cbf[p], m.tmax[p]]);
  }
  const meanT = (a) => a.reduce((s, x) => s + x[1], 0) / Math.max(1, a.length);
  const healthy = meanT(vals.L) < meanT(vals.R) ? vals.L : vals.R;
  const sorted = healthy.map((x) => x[0]).sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length / 2)] || 40;
  // CBV de referencia del hemisferio sano (la penumbra lo conserva; el núcleo lo pierde)
  const cbvs = [];
  for (const m of levels) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const p = i * N + j;
    if (m.mask[p] && (healthy === vals.L ? j >= N / 2 : j < N / 2)) cbvs.push(m.cbv[p]);
  }
  cbvs.sort((a, b) => a - b);
  const refCbv = cbvs[Math.floor(cbvs.length / 2)] || 4;
  let core = 0, hypo = 0;
  for (const m of levels) for (let p = 0; p < N * N; p++) {
    if (!m.mask[p]) continue;
    // núcleo: flujo muy bajo, volumen bajo y dentro del territorio hipoperfundido
    if (m.cbf[p] < 0.3 * ref && m.cbv[p] < 0.6 * refCbv && m.tmax[p] > 6) core++;
    if (m.tmax[p] > 6) hypo++;
  }
  const coreMl = core * vox, hypoMl = hypo * vox;
  return { coreMl, hypoMl, mismatchMl: Math.max(0, hypoMl - coreMl), ratio: coreMl > 0 ? hypoMl / coreMl : Infinity, refCbf: ref };
}

// Paleta «viridis» (apta para daltonismo y legible en escala de grises): aproximación polinómica
export function viridis(t) {
  t = Math.max(0, Math.min(1, t));
  const r = 0.2777 + t * (0.1050 + t * (-0.3308 + t * (-4.6342 + t * (6.2283 + t * (4.7764 + t * -5.4355)))));
  const g = 0.0054 + t * (1.4046 + t * (0.2148 + t * (-5.7991 + t * (14.1799 + t * (-13.7451 + t * 4.6459)))));
  const b = 0.3341 + t * (1.3846 + t * (0.0950 + t * (-19.3324 + t * (56.6906 + t * (-65.3530 + t * 26.3124)))));
  return [r, g, b].map((v) => Math.max(0, Math.min(255, v * 255)));
}

// Paleta tipo «arcoíris» para los mapas (0…1 → rgb)
export function rainbow(t) {
  t = Math.max(0, Math.min(1, t));
  const r = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 3)));
  const g = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 2)));
  const b = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 1)));
  return [r * 255, g * 255, b * 255];
}
