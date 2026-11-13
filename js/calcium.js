// Puntuación de calcio coronario de Agatston sobre una serie SIN contraste.
// Por corte: cada lesión ≥ 130 HU y ≥ 1 mm² dentro del corazón suma área (mm²) × factor de densidad del píxel
// más denso (130–199 → 1, 200–299 → 2, 300–399 → 3, ≥ 400 → 4). El método original usa cortes de 3 mm:
// con otro grosor la suma se escala por grosor/3.
import { section, ell } from './phantom.js';

const N = 256;
// Región cardíaca: miocardio con un margen para incluir las coronarias epicárdicas
const HEART = ell([12, 30, 488], [62, 55, 62]);
const MARGIN = 9; // mm

export const densityFactor = (hu) => (hu >= 400 ? 4 : hu >= 300 ? 3 : hu >= 200 ? 2 : hu >= 130 ? 1 : 0);

export function agatston(series, { offY = 0, threshold = 130, minArea = 1 } = {}) {
  const rpx = series.dfov / N, pxArea = rpx * rpx, thick = series.params.thickness;
  const lesions = [];
  series.slices.forEach((img, k) => {
    if (!img) return;
    const z = series.zs[k], cs = section(HEART, z);
    if (!cs) return;
    const rx = cs.rx + MARGIN, ry = cs.ry + MARGIN;
    const inHeart = (i, j) => {
      const x = (j - 127.5) * rpx, y = (127.5 - i) * rpx - offY; // coordenadas del paciente
      return ((x - cs.cx) / rx) ** 2 + ((y - cs.cy) / ry) ** 2 <= 1;
    };
    const seen = new Uint8Array(N * N);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const p = i * N + j;
      if (seen[p] || img[p] < threshold || !inHeart(i, j)) continue;
      // componente conexa (4 vecinos)
      const stack = [p];
      seen[p] = 1;
      let count = 0, peak = -1e9, sx = 0, sy = 0, cut = false;
      while (stack.length) {
        const q = stack.pop(), qi = (q / N) | 0, qj = q % N;
        count++; peak = Math.max(peak, img[q]); sx += qj; sy += qi;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = qi + di, nj = qj + dj, nq = ni * N + nj;
          if (ni < 0 || nj < 0 || ni >= N || nj >= N || seen[nq] || img[nq] < threshold) continue;
          if (!inHeart(ni, nj)) { cut = true; continue; } // sigue fuera del corazón: esternón, costilla o columna
          seen[nq] = 1; stack.push(nq);
        }
      }
      const area = count * pxArea;
      if (area < minArea || cut) continue;
      const f = densityFactor(peak);
      lesions.push({ slice: k, z, area, peak, factor: f, score: area * f * (thick / 3), x: (sx / count - 127.5) * rpx, y: (127.5 - sy / count) * rpx - offY });
    }
  });
  const total = lesions.reduce((s, l) => s + l.score, 0);
  return { total, lesions, category: category(total), thickness: thick };
}

export function category(total) {
  if (total < 1) return { label: '0 — sin calcio coronario detectable', risk: 'muy bajo' };
  if (total <= 10) return { label: '1–10 — calcio mínimo', risk: 'bajo' };
  if (total <= 100) return { label: '11–100 — calcio leve', risk: 'leve' };
  if (total <= 400) return { label: '101–400 — calcio moderado', risk: 'moderado' };
  return { label: '> 400 — calcio extenso', risk: 'alto' };
}
