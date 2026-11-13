// Fase D: física espectral, abanico, dispersión, anillos, SART, atlas y traducción de los casos
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnatomy, serialize } from '../js/phantom.js';
import { reconstructSlice, SCANNER } from '../js/ct.js';
import { spectrum, meanEnergy, spectralModel, polyProjection, waterLength, effectiveHU } from '../js/spectral.js';
import { NAMES } from '../js/anatomy-names.js';
import { CASES } from '../js/cases.js';
import { caseTranslationRows } from '../js/cases-i18n.js';

const N = 256;
const pix = (x, y, dfov) => [Math.round(x / (dfov / N) + 127.5), Math.round(127.5 - y / (dfov / N))];
function roi(img, x, y, dfov, r = 5) {
  const [cx, cy] = pix(x, y, dfov), v = [];
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (i * i + j * j <= r * r) v.push(img[(cy + i) * N + cx + j]);
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return { mean: m, sd: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) };
}
const up = serialize(buildAnatomy({ arms: 'up' }));
const abd = { structs: up, kv: 120, z: 620, thickness: 5, enh: {}, mas: 200, kernel: 'standard', sfov: 'body', dfov: 380, rot: 0.5, seed: 5 };

test('Espectro: energía media según el kV, endurecimiento con el agua y yodo más brillante a bajo kV', () => {
  const e80 = meanEnergy(spectrum(80)), e120 = meanEnergy(spectrum(120)), e140 = meanEnergy(spectrum(140));
  assert.ok(e80 < e120 && e120 < e140, `${e80} ${e120} ${e140}`);
  assert.ok(e120 > 50 && e120 < 70);
  assert.ok(meanEnergy(spectrum(120), 200) > e120 + 8, 'el haz se endurece tras 20 cm de agua');
  const m = spectralModel(120);
  for (const L of [0, 50, 200, 450]) assert.ok(Math.abs(waterLength(m, polyProjection(m, L, 0, 0).p) - L) < 0.5, `ida y vuelta ${L} mm`);
  const ratio = (mat) => effectiveHU(80, mat, mat === 'iodine' ? 0.01 : 1.92) / effectiveHU(120, mat, mat === 'iodine' ? 0.01 : 1.92);
  assert.ok(Math.abs(effectiveHU(120, 'iodine', 0.01) - 270) < 40, 'yodo 10 mg/mL ≈ 270 HU a 120 kV');
  const ri = ratio('iodine'), rb = ratio('bone');
  assert.ok(ri > 1.4 && ri < 1.9, `yodo 80/120 kV: ${ri}`);
  assert.ok(rb > 1.1 && rb < 1.45 && rb < ri, `hueso 80/120 kV: ${rb}`);
});

test('Física avanzada: HU cercanas a las reales con corrección; sin corrección de la dispersión aparece el cupping', () => {
  const ok = roi(reconstructSlice({ ...abd, physics: 'advanced' }), -70, 10, 380);
  assert.ok(Math.abs(ok.mean - 60) < 18, `hígado ${ok.mean}`);
  assert.ok(ok.sd > 4 && ok.sd < 20, `ruido ${ok.sd}`);
  const cup = roi(reconstructSlice({ ...abd, physics: 'advanced', scatter: { noCorrection: true, noGrid: true } }), -70, 10, 380);
  assert.ok(cup.mean < ok.mean - 60, `sin corrección: ${cup.mean}`);
});

test('Anillos: un canal descalibrado deja un círculo a la distancia de ese canal al isocentro', () => {
  const job = { ...abd, mas: 2000 };
  const a = reconstructSlice(job), b = reconstructSlice({ ...job, detectorDefects: [{ pos: 0.65, gain: 0.95, width: 2 }] });
  const tRing = (0.65 * (SCANNER.nDet - 1) + 0.5 - (SCANNER.nDet - 1) / 2) * (SCANNER.sfov.body / SCANNER.nDet);
  const px = 380 / N;
  let onRing = 0, nOn = 0, off = 0, nOff = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const r = Math.hypot((j - 127.5) * px, (127.5 - i) * px), d = Math.abs(b[i * N + j] - a[i * N + j]);
    if (Math.abs(r - tRing) < 2) { onRing += d; nOn++; } else if (Math.abs(r - tRing) > 15 && r < 170) { off += d; nOff++; }
  }
  assert.ok(onRing / nOn > 8 * (off / nOff + 0.1), `anillo ${onRing / nOn} vs fondo ${off / nOff}`);
});

test('SART: menos ruido que la FBP a baja dosis y HU conservadas', () => {
  const job = { ...abd, mas: 50 };
  const fbp = roi(reconstructSlice(job), -70, 10, 380), sart = roi(reconstructSlice({ ...job, algorithm: 'sart' }), -70, 10, 380);
  assert.ok(sart.sd < fbp.sd * 0.6, `DE FBP ${fbp.sd} · SART ${sart.sd}`);
  assert.ok(Math.abs(sart.mean - 60) < 12, `media SART ${sart.mean}`);
});

test('Atlas: todas las estructuras del fantoma tienen nombre en los tres idiomas', () => {
  const all = new Set([...buildAnatomy({}), ...buildAnatomy({ sex: 'F', pregnantWeeks: 24, arms: 'up' })].map((s) => s.name));
  const missing = [...all].filter((n) => !NAMES[n]);
  assert.deepEqual(missing, []);
  for (const v of Object.values(NAMES)) assert.equal(v.filter(Boolean).length, 4);
});

test('Traducción de los casos: título, orden, pregunta y opciones de cada caso en inglés y portugués', () => {
  const rows = caseTranslationRows(), es = new Map(rows.map((r) => [r[0], r]));
  for (const c of CASES) {
    for (const s of [c.title, c.order, c.history, c.question.text, ...c.question.options]) {
      const r = es.get(s);
      assert.ok(r && r[1] && r[2], `${c.key}: falta «${s.slice(0, 40)}»`);
    }
    if (c.event) assert.ok(es.get(c.event.text)?.[1], `${c.key}: evento sin traducir`);
  }
});
