import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../js/evaluation.js';
import { CASES } from '../js/cases.js';

const base = (key, over = {}) => {
  const c = CASES.find((x) => x.key === key);
  return {
    caseDef: c, student: 'Ana', startTime: Date.now() - 600000,
    prep: { idChecked: true, labsReviewed: true, pregnancyChecked: true, contrastDecision: c.contrast === 'si' ? 'apto' : c.contrast === 'no' ? 'no' : 'consultar', removed: new Set(c.items), companion: 'fuera' },
    position: { orientation: 'head', arms: c.expected.armsDown ? 'down' : 'up', headHolder: true, strap: true, offY: 3 },
    range: [c.expected.coverage[0] - 5, c.expected.coverage[1] + 5],
    params: { kernel: c.expected.kernels[0], thickness: c.expected.maxThickness, metalReduction: true, ecg: 'prospectivo', phase: 75, dfov: 450 }, hrAtScan: 58,
    injected: c.contrast === 'si', injector: { flow: Math.max(4, c.expected.minFlow || 0), saline: 40 }, catheterMax: 5,
    series: [{ name: 'S', phase: 'arterial', params: { kv: 120, pitch: 1, thickness: 1.25 }, dose: { avgMas: 100, ctdi: 5, dlp: 200 }, measured: { pa: 320, aorta: 320, liver: 20, portal: 160, cerebralArt: 320 } },
      { name: 'P', phase: 'portal', params: { kv: 120, pitch: 1, thickness: 5 }, dose: { avgMas: 100, ctdi: 5, dlp: 200 }, measured: { aorta: 150, liver: 60, portal: 170, jugular: 140 } }],
    maxCtdi: 2.5, totalDlp: 400, topograms: 1, extraSeries: 0, answer: c.question.correct,
    dispatch: { sent: true, hydration: true, observation: true },
    event: c.event ? { ok: true } : null, perfusion: { coreMl: 10, hypoMl: 60 }, topoMaxZ: 600,
    ...over,
  };
};

test('Un examen correcto obtiene el 100 % en todos los casos', () => {
  for (const c of CASES) {
    const r = evaluate(base(c.key));
    assert.equal(r.percent, 100, `${c.key}: ${JSON.stringify(r.items.filter((i) => i.got < i.max))}`);
  }
});

test('Inyectar en un paciente con contraindicación anula ese criterio', () => {
  const r = evaluate(base('contraindicacion', { injected: true }));
  const it = r.items.find((i) => i.label.startsWith('Valoración'));
  assert.equal(it.got, 0);
  assert.match(it.comment, /reacción adversa/);
});

test('Cobertura incompleta, brazos mal colocados y metal en el campo restan puntos', () => {
  const c = CASES.find((x) => x.key === 'angio-tep');
  const r = evaluate(base('angio-tep', { range: [c.expected.coverage[0] + 60, c.expected.coverage[1]], position: { orientation: 'head', arms: 'down', offY: 40 }, prep: { ...base('angio-tep').prep, removed: new Set() } }));
  const get = (l) => r.items.find((i) => i.label.startsWith(l));
  assert.ok(get('Cobertura').got < 12);
  assert.ok(get('Posicionamiento').got < 10);
  assert.equal(get('Centrado').got, 0);
  assert.ok(get('Retiro').got < 6);
  assert.ok(r.percent < 90);
});

test('Cráneo con los cristalinos en el haz resta puntos de dosis', () => {
  const r = evaluate(base('craneo-hic', { organs: { lens: { inField: true, dose: 50 } } }));
  assert.equal(r.items.find((i) => i.label.startsWith('Dosis')).got, 8);
});

test('Prótesis sin reducción de artefactos metálicos y fase venosa tardía en el cuello', () => {
  const r = evaluate(base('protesis-cadera', { params: { kernel: 'standard', thickness: 3, metalReduction: false } }));
  assert.equal(r.items.find((i) => i.label.startsWith('Parámetros')).got, 4);
  const b = base('cuello-absceso');
  b.series[1].measured.jugular = 40;
  assert.equal(evaluate(b).items.find((i) => i.label.startsWith('Sincronización')).got, 0);
});

test('Realce insuficiente en la angio-TC pulmonar', () => {
  const b = base('angio-tep');
  b.series[0].measured.pa = 120;
  const it = evaluate(b).items.find((i) => i.label.startsWith('Sincronización'));
  assert.equal(it.got, 0);
});
