import test from 'node:test';
import assert from 'node:assert/strict';
import { customToCase, lesionsToExtras, PROTOCOL_EXPECTED } from '../js/cases.js';
import { buildAnatomy, serialize, truthHU } from '../js/phantom.js';
import { evaluate } from '../js/evaluation.js';

const custom = {
  key: 'custom-test', title: 'Apendicitis', protocolKey: 'abdomen', contrast: 'si', companion: false,
  order: 'TC abdomen', history: '', patient: { name: 'Paciente Prueba', dob: '1990-01-01', age: 35, sex: 'M', weight: 75 },
  items: ['cinturon'], lesions: [{ type: 'absceso', x: -70, y: 10, z: 800, rx: 12, ry: 12, rz: 14 }, { type: 'calculo', x: -60, y: 15, z: 620, rx: 3, ry: 3, rz: 3 }],
  question: { text: '¿Hallazgo?', options: ['Normal', 'Absceso en FID', '', ''], correct: 1, explanation: 'x' },
};

test('Un caso del editor se convierte en un caso jugable con lesiones en el fantasma', () => {
  const c = customToCase(custom);
  assert.equal(c.custom, true);
  assert.equal(c.region, 'abdomen');
  assert.deepEqual(c.expected.coverage, PROTOCOL_EXPECTED.abdomen.coverage);
  assert.ok(c.expected.phases, 'con contraste conserva la fase portal');
  assert.equal(c.question.options.length, 2, 'se descartan las opciones vacías');
  const s = serialize(buildAnatomy({ extras: c.extras }));
  assert.ok(Math.abs(truthHU(s, -70, 10, 800) - 18) < 1, 'centro líquido del absceso');
  assert.ok(truthHU(s, -60, 15, 620) > 900, 'cálculo');
  assert.equal(lesionsToExtras(custom.lesions).length, 3, 'el absceso lleva pared');
});

test('Sin contraste, el caso del editor no exige fases', () => {
  const c = customToCase({ ...custom, contrast: 'no' });
  assert.equal(c.expected.phases, undefined);
  const r = evaluate({
    caseDef: c, student: 'A', startTime: Date.now(), prep: { idChecked: true, labsReviewed: true, contrastDecision: 'no', removed: new Set(['cinturon']), companion: 'fuera' },
    position: { orientation: 'head', arms: 'up', offY: 0 }, range: c.expected.coverage, params: { kernel: 'standard', thickness: 5 }, injected: false, injector: {}, catheterMax: 0,
    series: [{ name: 'S', phase: 'simple', params: { kv: 120, pitch: 1, thickness: 5 }, dose: { avgMas: 100, ctdi: 10, dlp: 400 } }], maxCtdi: 10, totalDlp: 400, topograms: 1, extraSeries: 0,
    answer: 1, dispatch: { sent: true },
  });
  assert.equal(r.percent, 100, JSON.stringify(r.items.filter((i) => i.got < i.max)));
});
