import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeResults, filterResults, summarize, toCsv, parseReportFile } from '../js/classStats.js';

const r = (student, caseKey, percent, items, date = `2026-11-0${percent % 9 + 1}`) => ({
  student, case: `Caso ${caseKey}`, caseKey, date, percent, items,
});
const it = (label, got, max) => ({ label, got, max, comment: '' });

const data = [
  r('Ana', 'ictus', 90, [it('Seguridad', 20, 20), it('Bobina', 5, 5)]),
  r('Luis', 'ictus', 50, [it('Seguridad', 0, 20), it('Bobina', 5, 5)]),
  r('Ana', 'rodilla', 70, [it('Seguridad', 20, 20), it('Bobina', 2, 5)]),
];

test('Resumen: intentos, estudiantes, promedio, aprobados y criterios débiles primero', () => {
  const s = summarize(data);
  assert.equal(s.attempts, 3);
  assert.equal(s.students, 2);
  assert.equal(s.average, 70);
  assert.equal(s.passRate, 67);
  assert.deepEqual(s.byCase.map((c) => [c.key, c.n, c.average]), [['ictus', 2, 70], ['rodilla', 1, 70]]);
  assert.equal(s.byCriterion[0].label, 'Seguridad'); // 67 % < 80 %
  assert.equal(s.byCriterion[0].average, 67);
});

test('Filtros por caso y estudiante; sin datos no falla', () => {
  assert.equal(filterResults(data, { caseKey: 'ictus' }).length, 2);
  assert.equal(filterResults(data, { student: 'an' }).length, 2);
  const empty = summarize([]);
  assert.equal(empty.attempts, 0);
  assert.equal(empty.average, 0);
});

test('Unir resultados elimina duplicados (servidor + archivo importado)', () => {
  assert.equal(mergeResults(data, [data[0], data[1]]).length, 3);
});

test('CSV en formato largo con BOM y comillas escapadas', () => {
  const csv = toCsv([r('Ana "La Mejor"', 'ictus', 90, [it('Seguridad', 20, 20)])]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('"Ana ""La Mejor"""'));
  assert.equal(csv.split('\r\n').length, 2);
});

test('Importar: un informe, una lista o un archivo inválido', () => {
  assert.equal(parseReportFile(JSON.stringify(data[0])).length, 1);
  assert.equal(parseReportFile(JSON.stringify(data)).length, 3);
  assert.equal(parseReportFile(JSON.stringify({ hola: 1 })).length, 0);
  assert.throws(() => parseReportFile('no es json'));
});
