// Estadísticas de una clase a partir de los informes de evaluación.

export const PASS_PERCENT = 60;

const resultKey = (r) => `${r.student}|${r.caseKey || r.case}|${r.date}`;

// Une listas de informes eliminando duplicados (el mismo informe importado y recibido por servidor).
export function mergeResults(...lists) {
  const seen = new Map();
  for (const r of lists.flat()) if (r && Array.isArray(r.items)) seen.set(resultKey(r), r);
  return [...seen.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function filterResults(results, { caseKey = '', student = '' } = {}) {
  const s = student.trim().toLowerCase();
  return results.filter((r) => (!caseKey || (r.caseKey || r.case) === caseKey) && (!s || r.student.toLowerCase().includes(s)));
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function summarize(results) {
  const byCase = new Map(), byCriterion = new Map();
  for (const r of results) {
    const key = r.caseKey || r.case;
    if (!byCase.has(key)) byCase.set(key, { key, title: r.case, scores: [] });
    byCase.get(key).scores.push(r.percent);
    for (const i of r.items) {
      if (!i.max) continue;
      if (!byCriterion.has(i.label)) byCriterion.set(i.label, []);
      byCriterion.get(i.label).push((100 * i.got) / i.max);
    }
  }
  return {
    attempts: results.length,
    students: new Set(results.map((r) => r.student)).size,
    average: Math.round(mean(results.map((r) => r.percent))),
    passRate: results.length ? Math.round((100 * results.filter((r) => r.percent >= PASS_PERCENT).length) / results.length) : 0,
    byCase: [...byCase.values()]
      .map((c) => ({ key: c.key, title: c.title, n: c.scores.length, average: Math.round(mean(c.scores)) }))
      .sort((a, b) => a.title.localeCompare(b.title, 'es', { numeric: true })),
    // Criterios ordenados del más débil al más fuerte: lo que más hay que reforzar va primero.
    byCriterion: [...byCriterion.entries()]
      .map(([label, pcts]) => ({ label, n: pcts.length, average: Math.round(mean(pcts)) }))
      .sort((a, b) => a.average - b.average),
  };
}

// CSV en formato largo: una fila por criterio de cada intento (fácil de filtrar en Excel).
export function toCsv(results) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Estudiante', 'Caso', 'Fecha', 'Porcentaje', 'Criterio', 'Puntos', 'Máximo', 'Comentario']];
  for (const r of results) {
    for (const i of r.items) rows.push([r.student, r.case, r.date, r.percent, i.label, i.got, i.max, i.comment]);
  }
  return '﻿' + rows.map((row) => row.map(esc).join(';')).join('\r\n');
}

// Lee informes desde el texto de un archivo JSON (un informe o una lista de informes).
export function parseReportFile(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : [data];
  return list.filter((r) => r && typeof r.student === 'string' && Array.isArray(r.items) && Number.isFinite(+r.percent));
}
