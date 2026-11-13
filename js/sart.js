// SART por subconjuntos ordenados (OS-SART) con regularización que respeta los bordes.
// Parte de una retroproyección filtrada suave sobre todo el campo de medida y corrige la imagen
// comparando sus proyecciones con las medidas: x ← x + λ · Aᵀ[(p − A·x) / longitud del rayo] / nº de vistas.
// Es una versión didáctica de la reconstrucción iterativa basada en modelo (MBIR): más lenta que la FBP,
// con menos ruido y rayas a dosis bajas, y una textura más «suave».
import { filterBackprojectCPU, iterativeDenoise, SCANNER } from './ct.js';
import { MU_WATER } from './phantom.js';

export const SART_DEFAULTS = { iterations: 4, subsets: 10, lambda: 0.7, reg: 35, start: 'standard' };

export function sartReconstruct(ctx, sino, opts = {}) {
  const { iterations, subsets, lambda, reg, start } = { ...SART_DEFAULTS, ...(ctx.job.sart || {}), ...opts };
  const { job, K, nDet, d, sfov } = ctx;
  // Rejilla sobre todo el SFOV con píxeles del tamaño del muestreo del detector (no perder resolución)
  const N = nDet, F = sfov, ps = F / N, half = (nDet - 1) / 2, c0 = (N - 1) / 2, R = F / 2;
  const mw = MU_WATER[job.kv];

  // 1) Imagen inicial: FBP con filtro blando sobre todo el SFOV (fila i ↔ y decreciente) → x[gy·N + gx] con y creciente
  const init = filterBackprojectCPU({ ...ctx, job: { ...job, dfov: F, kernel: start } }, sino), NI = SCANNER.recon;
  const x = new Float32Array(N * N), mask = new Uint8Array(N * N);
  for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
    const xx = (gx - c0) * ps, yy = (gy - c0) * ps;
    const p = gy * N + gx;
    mask[p] = xx * xx + yy * yy < R * R ? 1 : 0;
    // la FBP inicial está en la matriz de reconstrucción (NI × NI): muestreo bilineal
    const fi = (NI - 1) / 2 - yy / (F / NI), fj = xx / (F / NI) + (NI - 1) / 2, i0 = Math.max(0, Math.min(NI - 2, Math.floor(fi))), j0 = Math.max(0, Math.min(NI - 2, Math.floor(fj)));
    const a = Math.min(1, Math.max(0, fi - i0)), b = Math.min(1, Math.max(0, fj - j0));
    const hu = (init[i0 * NI + j0] * (1 - b) + init[i0 * NI + j0 + 1] * b) * (1 - a) + (init[(i0 + 1) * NI + j0] * (1 - b) + init[(i0 + 1) * NI + j0 + 1] * b) * a;
    x[p] = mask[p] ? Math.max(0, mw * (1 + hu / 1000)) : 0;
  }
  // Longitud de cada rayo dentro del círculo reconstruido (normalización de SART)
  const chord = new Float32Array(nDet);
  for (let b = 0; b < nDet; b++) { const t = (b - half) * d; chord[b] = Math.max(ps, 2 * Math.sqrt(Math.max(0, R * R - t * t))); }

  // Orden de los subconjuntos muy separado en ángulo (convergencia más rápida)
  const order = [];
  for (let s = 0; s < subsets; s++) order.push(s);
  order.sort((a, b) => bitrev(a, subsets) - bitrev(b, subsets));

  const resid = new Float32Array(nDet), upd = new Float32Array(N * N);
  for (let it = 0; it < iterations; it++) {
    for (const s of order) {
      upd.fill(0);
      let cnt = 0;
      for (let v = s; v < K; v += subsets) {
        cnt++;
        const th = (v * Math.PI) / K, c = Math.cos(th), sn = Math.sin(th);
        // Proyección directa de la imagen actual (rayos con interpolación bilineal)
        for (let b = 0; b < nDet; b++) {
          const t = (b - half) * d;
          if (Math.abs(t) >= R) { resid[b] = 0; continue; }
          let gx = (t * c + R * sn) / ps + c0, gy = (t * sn - R * c) / ps + c0, sum = 0;
          for (let k = 0; k < N; k++, gx -= sn, gy += c) {
            if (gx < 0 || gy < 0 || gx >= N - 1 || gy >= N - 1) continue;
            const ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy, p = iy * N + ix;
            sum += (x[p] * (1 - fx) + x[p + 1] * fx) * (1 - fy) + (x[p + N] * (1 - fx) + x[p + N + 1] * fx) * fy;
          }
          resid[b] = (sino[v * nDet + b] - sum * ps) / chord[b];
        }
        // Retroproyección del residuo normalizado
        for (let gy = 0; gy < N; gy++) {
          const yy = (gy - c0) * ps;
          let tb = ((-c0 * ps) * c + yy * sn) / d + half;
          const dtb = (ps * c) / d, o = gy * N;
          for (let gx = 0; gx < N; gx++, tb += dtb) {
            if (!mask[o + gx] || tb < 0 || tb >= nDet - 1) continue;
            const b0 = tb | 0, f = tb - b0;
            upd[o + gx] += resid[b0] * (1 - f) + resid[b0 + 1] * f;
          }
        }
      }
      for (let p = 0; p < N * N; p++) if (mask[p]) x[p] = Math.max(0, x[p] + (lambda * upd[p]) / cnt);
    }
    // Regularización entre iteraciones (difusión que respeta los bordes, en HU)
    if (reg > 0) {
      const hu = new Float32Array(N * N);
      for (let p = 0; p < N * N; p++) hu[p] = 1000 * (x[p] / mw - 1);
      iterativeDenoise(hu, N, reg);
      for (let p = 0; p < N * N; p++) x[p] = mask[p] ? Math.max(0, mw * (1 + hu[p] / 1000)) : 0;
    }
  }

  // 2) Remuestreo al DFOV pedido (misma orientación que la FBP)
  const NR = SCANNER.recon, rpx = job.dfov / NR, out = new Float32Array(NR * NR);
  for (let i = 0; i < NR; i++) {
    const yy = ((NR - 1) / 2 - i) * rpx, fy = yy / ps + c0;
    for (let j = 0; j < NR; j++) {
      const fx = (j - (NR - 1) / 2) * rpx / ps + c0;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      let mu = 0;
      if (ix >= 0 && iy >= 0 && ix < N - 1 && iy < N - 1) {
        const ax = fx - ix, ay = fy - iy, p = iy * N + ix;
        mu = (x[p] * (1 - ax) + x[p + 1] * ax) * (1 - ay) + (x[p + N] * (1 - ax) + x[p + N + 1] * ax) * ay;
      }
      out[i * NR + j] = 1000 * (mu / mw - 1);
    }
  }
  return out;
}

function bitrev(i, n) {
  const bits = Math.ceil(Math.log2(n));
  let r = 0;
  for (let k = 0; k < bits; k++) if (i & (1 << k)) r |= 1 << (bits - 1 - k);
  return r;
}
