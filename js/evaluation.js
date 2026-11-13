// Rúbrica de evaluación, informe, historial y exportación.
import { DRL } from './ct.js';
import { METAL_ITEMS, METAL_Z } from './cases.js';

const HISTORY_KEY = 'opentc-history';

const item = (label, max, got, comment) => ({ label, max, got: Math.max(0, Math.min(max, Math.round(got))), comment });

// rec: registro del examen que arma main.js
export function evaluate(rec) {
  const c = rec.caseDef, e = c.expected, p = c.patient;
  const items = [];
  const contrastCase = c.contrast === 'si';

  // 1. Identificación
  items.push(item('Identificación del paciente', 8, rec.prep.idChecked ? 8 : 0,
    rec.prep.idChecked ? 'Verificó nombre y fecha de nacimiento con el brazalete.' : 'No verificó los dos identificadores antes del estudio.'));

  // 2. Valoración y decisión sobre el contraste
  {
    let got = 0; const notes = [];
    if (rec.prep.labsReviewed) got += 4; else notes.push('no revisó función renal ni alergias');
    if (p.sex === 'F' && p.age < 50) { if (rec.prep.pregnancyChecked) got += 3; else notes.push('no confirmó la prueba de embarazo'); } else got += 3;
    const dec = rec.prep.contrastDecision;
    if (c.contrast === 'contraindicado') {
      if (rec.injected) notes.push('INYECTÓ contraste en un paciente con contraindicación: reacción adversa simulada');
      else if (dec === 'consultar' || dec === 'no') { got += 8; notes.push('suspendió el contraste y consultó'); }
      else notes.push('no registró la contraindicación');
    } else if (contrastCase) {
      if (dec === 'apto' && rec.injected) got += 8; else notes.push(rec.injected ? 'no dejó registrada la valoración' : 'no administró el contraste solicitado');
    } else {
      if (!rec.injected) got += 8; else notes.push('administró contraste en un estudio simple');
    }
    items.push(item('Valoración previa y decisión sobre el contraste', 15, rec.injected && c.contrast === 'contraindicado' ? 0 : got, notes.join('; ') || 'Correcto.'));
  }

  // 3. Acceso venoso y caudal
  if (contrastCase) {
    const inj = rec.injector, cat = rec.catheterMax;
    let got = 0; const notes = [];
    if (inj.flow <= cat) got += 3; else notes.push(`caudal ${inj.flow} mL/s supera el máximo del catéter (${cat} mL/s)`);
    if (inj.flow >= (e.minFlow || 0) && inj.flow <= (e.maxFlow || 9)) got += 2; else notes.push(`caudal recomendado ${e.minFlow}–${e.maxFlow} mL/s`);
    if (inj.saline >= 20) got += 1; else notes.push('sin bolo de suero (se desperdicia contraste y hay artefactos en la cava)');
    items.push(item('Acceso venoso, caudal y bolo de suero', 6, got, notes.join('; ') || `Catéter adecuado; ${inj.flow} mL/s con ${inj.saline} mL de suero.`));
  }

  // 4. Objetos metálicos dentro del rango explorado
  {
    const [zs, ze] = rec.range || [0, 0];
    const inField = c.items.filter((k) => METAL_Z[k][1] >= zs && METAL_Z[k][0] <= ze);
    const left = inField.filter((k) => !rec.prep.removed.has(k));
    items.push(item('Retiro de objetos metálicos', 6, inField.length ? (6 * (inField.length - left.length)) / inField.length : 6,
      left.length ? `Quedaron en el campo: ${left.map((k) => METAL_ITEMS[k]).join(', ')} (artefactos).` : 'Ningún objeto metálico en el campo.'));
  }

  // 5. Posicionamiento
  {
    let got = 0; const notes = [];
    const armsOk = e.armsDown ? rec.position.arms === 'down' : rec.position.arms === 'up';
    if (armsOk) got += 4; else notes.push(e.armsDown ? 'los brazos deben ir a los lados del cuerpo' : 'los brazos deben ir por encima de la cabeza (evita artefactos y ruido)');
    if (rec.position.orientation === 'head') got += 2; else notes.push('lo habitual es cabeza primero');
    if (c.region === 'head') {
      if (rec.position.headHolder) got += 2; else notes.push('sin soporte de cabeza');
      if (!e.strap || rec.position.strap) got += 2; else notes.push('paciente agitado sin cinta de sujeción');
    } else got += 4;
    items.push(item('Posicionamiento', 10, got, notes.join('; ') || 'Correcto.'));
  }

  // 6. Centrado vertical
  {
    const off = Math.abs(rec.position.offY);
    items.push(item('Centrado en el isocentro', 5, off <= 15 ? 5 : off <= 30 ? 2 : 0,
      off <= 15 ? `Altura de la mesa correcta (desvío ${Math.round(rec.position.offY)} mm).` : `Paciente descentrado ${Math.round(rec.position.offY)} mm: el filtro bowtie y la modulación trabajan mal (más ruido y más dosis en la superficie).`));
  }

  // 7. Cobertura
  {
    const [zs, ze] = rec.range || [0, 0], [a, b] = e.coverage;
    let got = 12; const notes = [];
    const missTop = Math.max(0, zs - a), missBottom = Math.max(0, b - ze);
    if (missTop > 3) { got -= Math.min(6, missTop / 4); notes.push(`faltan ${Math.round(missTop)} mm por arriba`); }
    if (missBottom > 3) { got -= Math.min(6, missBottom / 4); notes.push(`faltan ${Math.round(missBottom)} mm por abajo`); }
    const extra = Math.max(0, a - zs - 25) + Math.max(0, ze - b - 25);
    if (extra > 0) { got -= Math.min(4, extra / 15); notes.push(`${Math.round(extra)} mm explorados de más (dosis innecesaria)`); }
    if (!rec.range) { got = 0; notes.push('no se adquirió el estudio'); }
    items.push(item('Cobertura anatómica', 12, got, notes.join('; ') || 'Cubre toda la anatomía sin exceso.'));
  }

  // 8. Parámetros de reconstrucción
  {
    // Cuenta cualquier serie del estudio, incluidas las reconstrucciones desde los datos brutos
    const list = (rec.paramsList || [rec.params]).filter(Boolean);
    const pr = list[0] || {};
    let got = 0; const notes = [];
    if (list.some((x) => e.kernels.includes(x.kernel))) got += 4; else notes.push('filtro de reconstrucción poco adecuado');
    if (list.some((x) => x.thickness <= e.maxThickness)) got += 4; else notes.push(pr?.thickness != null ? `grosor ${pr.thickness} mm; se esperaba ≤ ${e.maxThickness} mm` : `no se adquirió ninguna serie (se esperaba grosor ≤ ${e.maxThickness} mm)`);
    if (e.minDfov && !list.some((x) => x.dfov >= e.minDfov)) { got -= 3; notes.push(`DFOV < ${e.minDfov} mm: no incluye toda la piel del paciente`); }
    if (e.mar && !list.some((x) => x.metalReduction)) { got -= 4; notes.push('sin reducción de artefactos metálicos (MAR) con una prótesis en el campo'); }
    items.push(item('Parámetros de reconstrucción', 8, got, notes.join('; ') || 'Filtro y grosor adecuados.'));
  }

  // 9. Dosis
  {
    const drl = DRL[e.drl];
    let got = 10; const notes = [];
    if (rec.maxCtdi > drl * 1.5) { got -= 7; notes.push(`CTDIvol ${rec.maxCtdi.toFixed(1)} mGy supera mucho el nivel de referencia (${drl} mGy)`); }
    else if (rec.maxCtdi > drl) { got -= 4; notes.push(`CTDIvol ${rec.maxCtdi.toFixed(1)} mGy por encima del nivel de referencia (${drl} mGy)`); }
    if (rec.topograms > 2) { got -= 2; notes.push(`${rec.topograms} topogramas`); }
    if (rec.extraSeries > 0) { got -= 3; notes.push('series repetidas o innecesarias'); }
    if (e.drl === 'head' && rec.organs?.lens?.inField) { got -= 2; notes.push(`los cristalinos quedaron en el haz (~${Math.round(rec.organs.lens.dose)} mGy): incline el gantry o la cabeza (plano supraorbitomeatal)`); }
    items.push(item('Dosis de radiación', 10, rec.series.length ? got : 0, notes.join('; ') || `CTDIvol ${rec.maxCtdi.toFixed(1)} mGy (referencia ${drl} mGy), DLP total ${rec.totalDlp.toFixed(0)} mGy·cm.`));
  }

  // 10. Realce / fases
  if (contrastCase) {
    let got = 0; const notes = [];
    if (e.timing) {
      const s = rec.series.find((x) => x.phase === 'arterial');
      const hu = s?.measured?.[e.timing.comp];
      if (hu >= e.timing.minHU) got = 12; else if (hu >= e.timing.minHU * 0.7) { got = 6; notes.push(`realce de ${e.timing.label} ${Math.round(hu)} HU (objetivo ≥ ${e.timing.minHU})`); }
      else notes.push(hu != null ? `realce insuficiente en ${e.timing.label}: ${Math.round(hu)} HU` : 'no se adquirió la fase arterial');
      if (got === 12) notes.push(`realce de ${e.timing.label} ${Math.round(hu)} HU`);
    }
    if (e.phases) {
      const keys = Object.keys(e.phases), per = 12 / keys.length;
      let okAll = true;
      for (const k of keys) {
        const ph = e.phases[k], s = rec.series.find((x) => x.phase === k), m = s?.measured;
        if (!m) { okAll = false; notes.push(`falta la fase ${k}`); continue; }
        let ok = m[ph.comp] >= ph.minHU;
        if (ph.liverMax != null) ok &&= m.liver <= ph.liverMax;
        if (ph.liverMin != null) ok &&= m.liver >= ph.liverMin;
        const desc = `${ph.label || ph.comp} +${Math.round(m[ph.comp])} HU${ph.liverMax != null || ph.liverMin != null ? `, hígado +${Math.round(m.liver)} HU` : ''}`;
        if (ok) { got += per; notes.push(`fase ${k} en ventana (${desc})`); } else { okAll = false; notes.push(`fase ${k} fuera de ventana (${desc})`); }
      }
      if (okAll) notes.length = 0;
    }
    items.push(item('Sincronización del contraste', 12, got, notes.join('; ') || 'Fases en la ventana correcta.'));
  }

  // 10 b. TC cardíaca: sincronización con el ECG y control de la frecuencia
  if (e.cardiac) {
    const pr = rec.params || {}, hr = rec.hrAtScan ?? p.hr;
    let got = 0; const notes = [];
    if (pr.ecg === 'prospectivo' || pr.ecg === 'retrospectivo') got += 4; else notes.push('adquisición sin sincronizar con el ECG');
    const diast = pr.phase >= 65 && pr.phase <= 80, syst = pr.phase >= 35 && pr.phase <= 45;
    if (diast || (syst && hr > 65)) got += 3; else notes.push(`fase ${pr.phase} %: en diástole se usa 70–80 %`);
    if (hr <= e.cardiac.maxHr) got += 3; else notes.push(`frecuencia cardíaca de ${hr} lpm (objetivo ≤ ${e.cardiac.maxHr}): faltó el betabloqueador`);
    if (pr.ecg === 'retrospectivo') notes.push('la retrospectiva multiplica la dosis; la prospectiva basta si la frecuencia es baja y regular');
    items.push(item('Sincronización con el ECG', 10, got, notes.join('; ') || `Prospectiva en diástole (${pr.phase} %) con ${hr} lpm.`));
  }

  // 10 c. Perfusión cerebral
  if (e.perfusion) {
    const pf = rec.perfusion;
    items.push(item('Perfusión cerebral', 6, pf ? 6 : 0, pf ? `Mapas generados: núcleo ≈ ${Math.round(pf.coreMl)} mL, hipoperfusión ≈ ${Math.round(pf.hypoMl)} mL.` : 'No se adquirió la perfusión: sin ella no se puede estimar la penumbra.'));
  }

  // 10 d. Embarazo: proteger al feto limitando el topograma y el rango al tórax
  if (e.maxTopoZ) {
    const okTopo = (rec.topoMaxZ ?? 0) <= e.maxTopoZ, okRange = rec.range && rec.range[1] <= e.maxTopoZ;
    const notes = [];
    if (!okTopo) notes.push(`el topograma llegó hasta z ≈ ${Math.round(rec.topoMaxZ)} mm e irradió el útero`);
    if (!okRange) notes.push('el rango helicoidal se extendió hacia el abdomen');
    items.push(item('Protección del feto', 8, (okTopo ? 4 : 0) + (okRange ? 4 : 0), notes.join('; ') || `Topograma y rango limitados al tórax; dosis fetal estimada < 0,1 mGy (solo radiación dispersa).`));
  }

  // 10 e. Eventos del paciente
  if (c.event) {
    const ev = rec.event;
    items.push(item('Manejo del evento del paciente', 6, ev?.ok ? 6 : 0, ev ? (ev.ok ? 'Conducta adecuada.' : `Lo indicado era: «${c.event.options[c.event.correct]}».`) : 'El evento no llegó a ocurrir (no se completó esa parte del examen).'));
  }

  // 11. Calidad: movimiento
  {
    const moved = rec.series.filter((s) => s.motion);
    items.push(item('Calidad: control del movimiento', 6, rec.series.length && !moved.length ? 6 : 0,
      moved.length ? `Artefactos de movimiento en: ${moved.map((s) => `${s.name} (${s.motion})`).join(', ')}.` : rec.series.length ? 'Sin artefactos de movimiento.' : 'Sin estudio.'));
  }

  // 12. Hallazgo
  {
    const ok = rec.answer === c.question.correct;
    items.push(item('Interpretación del hallazgo', 12, ok ? 12 : 0, ok ? 'Respuesta correcta.' : `Respuesta esperada: «${c.question.options[c.question.correct]}».`));
  }

  // 13. Protección y despacho
  {
    let got = 0; const notes = [];
    if (rec.prep.companion === 'fuera' || !c.companion || (c.companionApron && rec.prep.companion === 'delantal')) got += 3;
    else notes.push(c.companionApron ? 'el acompañante podía quedarse para tranquilizar al niño, pero con delantal plomado' : 'el acompañante debió salir de la sala (o usar delantal plomado si era imprescindible)');
    if (rec.injected) { if (rec.dispatch.hydration && rec.dispatch.observation) got += 3; else notes.push('faltaron indicaciones tras el contraste (hidratación y vigilancia 30 min)'); }
    else got += 3;
    if (!rec.dispatch.sent) { got = Math.max(0, got - 2); notes.push('no envió las imágenes al PACS'); }
    items.push(item('Protección radiológica y despacho', 6, got, notes.join('; ') || 'Correcto.'));
  }

  const total = items.reduce((a, i) => a + i.got, 0), max = items.reduce((a, i) => a + i.max, 0);
  return {
    student: rec.student || 'Sin nombre',
    case: c.title,
    caseKey: c.key,
    date: new Date().toISOString(),
    realMinutes: Math.round((Date.now() - rec.startTime) / 60000),
    total, max,
    percent: Math.round((100 * total) / max),
    items,
    series: rec.series.map((s) => ({ name: s.name, kv: s.params.kv, mas: Math.round(s.dose.avgMas), pitch: s.params.pitch, thickness: s.params.thickness, ctdi: +s.dose.ctdi.toFixed(2), dlp: +s.dose.dlp.toFixed(1) })),
    explanation: c.question.explanation,
  };
}

// --- Historial y exportación ------------------------------------------------

export function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}
export function saveToHistory(r) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify([r, ...loadHistory()].slice(0, 50))); } catch { /* almacenamiento no disponible */ }
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fileBase = (r) => `opentc-${r.caseKey}-${(r.student || 'estudiante').replace(/[^\w-]+/g, '_')}-${r.date.slice(0, 10)}`;

export function exportJson(r) { download(`${fileBase(r)}.json`, JSON.stringify(r, null, 2), 'application/json'); }
export function exportCsv(r) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Estudiante', r.student], ['Caso', r.case], ['Fecha', r.date], ['Puntuación', `${r.total}/${r.max} (${r.percent} %)`], [], ['Criterio', 'Puntos', 'Máximo', 'Comentario'],
    ...r.items.map((i) => [i.label, i.got, i.max, i.comment]), [], ['Serie', 'kV', 'mAs', 'Pitch', 'Grosor', 'CTDIvol', 'DLP'],
    ...r.series.map((s) => [s.name, s.kv, s.mas, s.pitch, s.thickness, s.ctdi, s.dlp])];
  download(`${fileBase(r)}.csv`, '﻿' + lines.map((l) => l.map(esc).join(';')).join('\r\n'), 'text/csv');
}

// Lectura del informe para el estudiante: veredicto, fortalezas, prioridades de mejora y detalle por criterio
export const PASS_MARK = 60;
export function reportSummary(r) {
  const p = r.percent;
  const level = p >= 90 ? { cls: 'ok', icon: '★', verdict: 'Excelente' } : p >= 75 ? { cls: 'ok', icon: '✓', verdict: 'Aprobado' }
    : p >= PASS_MARK ? { cls: 'warn', icon: '✓', verdict: 'Aprobado con observaciones' } : { cls: 'err', icon: '✗', verdict: 'No aprobado: repita el caso' };
  const good = r.items.filter((i) => i.got >= i.max);
  const improve = r.items.filter((i) => i.got < i.max).map((i) => ({ ...i, lost: +(i.max - i.got).toFixed(1) })).sort((a, b) => b.lost - a.lost);
  const sentence = improve.length
    ? `Completó ${good.length} de ${r.items.length} criterios. Donde más puntos perdió: «${improve[0].label}» (−${improve[0].lost} puntos).`
    : `Completó los ${r.items.length} criterios sin perder puntos.`;
  const totalDlp = r.totalDlp ?? r.series?.reduce((a, s) => a + (s.dlp || 0), 0);
  return { ...level, good, improve, sentence, totalDlp };
}

const itemCls = (i) => (i.got >= i.max ? 'ok' : i.got / Math.max(1e-9, i.max) >= 0.5 ? 'warn' : 'err');
const itemIcon = (i) => ({ ok: '✓', warn: '!', err: '✗' }[itemCls(i)]);
const MODE = { practica: 'Práctica guiada', evaluacion: 'Evaluación' };

export function reportHtml(r) {
  const s = reportSummary(r);
  const meta = [
    ['Estudiante', r.student], ['Caso', r.case], ['Fecha', new Date(r.date).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })],
    ['Tiempo', `${r.realMinutes} min`], r.mode ? ['Modo', MODE[r.mode] || r.mode] : null, s.totalDlp != null ? ['DLP total', `${Math.round(s.totalDlp)} mGy·cm`] : null,
  ].filter(Boolean);
  return `<div class="rep">
    <div class="rep-head">
      <div class="rep-ring ${s.cls}" style="--p:${r.percent}" role="img" aria-label="Puntuación ${r.percent} %"><div><b>${r.percent}<small>%</small></b><span>${r.total}/${r.max} pts</span></div></div>
      <div class="rep-id">
        <div class="rep-verdict ${s.cls}">${s.icon} ${s.verdict}</div>
        <p>${escapeHtml(s.sentence)}</p>
        <dl class="rep-meta">${meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>
      </div>
    </div>
    <div class="rep-cols">
      <section class="rep-box good"><h4>✓ Lo que hizo bien <small>(${s.good.length})</small></h4>
        ${s.good.length ? `<ul>${s.good.map((i) => `<li>${escapeHtml(i.label)}</li>`).join('')}</ul>` : '<p class="small">Ningún criterio completo todavía.</p>'}</section>
      <section class="rep-box improve"><h4>↑ Qué mejorar, por prioridad <small>(${s.improve.length})</small></h4>
        ${s.improve.length ? `<ol>${s.improve.map((i) => `<li><b>${escapeHtml(i.label)}</b> <span class="lost">−${i.lost}</span><br><span class="small">${escapeHtml(i.comment)}</span></li>`).join('')}</ol>` : '<p class="small">Nada: ¡estudio impecable!</p>'}</section>
    </div>
    <h3>Detalle por criterio</h3>
    <div class="rep-crit">${r.items.map((i) => `<div class="rep-row ${itemCls(i)}"><span class="ic" aria-hidden="true">${itemIcon(i)}</span><span class="lb">${escapeHtml(i.label)}</span>
      <span class="bar"><i style="width:${Math.round((100 * i.got) / Math.max(1e-9, i.max))}%"></i></span><span class="pt">${i.got}/${i.max}</span><span class="cm">${escapeHtml(i.comment)}</span></div>`).join('')}</div>
    ${r.series?.length ? `<details class="rep-series"><summary>Series adquiridas y dosis (${r.series.length})</summary><table class="rubric"><thead><tr><th>Serie</th><th>Técnica</th><th>Dosis</th></tr></thead><tbody>${r.series.map((x) => `<tr><td>${escapeHtml(x.name)}</td><td>${x.kv} kV · ${x.mas} mAs · pitch ${x.pitch} · ${x.thickness} mm</td><td>CTDIvol ${x.ctdi} mGy · DLP ${x.dlp} mGy·cm</td></tr>`).join('')}</tbody></table></details>` : ''}
    ${r.explanation ? `<div class="rep-learn"><b>Aprendizaje clave del caso</b><p>${escapeHtml(r.explanation)}</p></div>` : ''}
  </div>`;
}

// Versión imprimible (A4) con el encabezado institucional: la usa brand.printDocument
export function reportPrintHtml(r, { header, footer }) {
  const s = reportSummary(r);
  return `${header('Informe de evaluación', 'Simulador de tomografía computarizada')}
    <div class="id-grid">
      <div><span>Estudiante</span>${escapeHtml(r.student)}</div><div><span>Caso</span>${escapeHtml(r.case)}</div><div><span>Fecha</span>${new Date(r.date).toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' })}</div>
      <div><span>Modo</span>${escapeHtml(MODE[r.mode] || r.mode || '—')}</div><div><span>Tiempo empleado</span>${r.realMinutes} min</div><div><span>DLP total</span>${s.totalDlp != null ? `${Math.round(s.totalDlp)} mGy·cm` : '—'}</div>
    </div>
    <div class="verdict"><div class="num ${s.cls}">${r.percent} %</div><div><b class="${s.cls}">${s.verdict}</b> · ${r.total}/${r.max} puntos (aprobado desde ${PASS_MARK} %)<br>${escapeHtml(s.sentence)}</div></div>
    <div class="lists" style="margin-top:10px">
      <div class="box good"><b>Lo que hizo bien</b><ul>${s.good.map((i) => `<li>${escapeHtml(i.label)}</li>`).join('') || '<li>—</li>'}</ul></div>
      <div class="box improve"><b>Qué mejorar (por prioridad)</b><ol>${s.improve.map((i) => `<li><b>${escapeHtml(i.label)}</b> (−${i.lost}): ${escapeHtml(i.comment)}</li>`).join('') || '<li>Nada: estudio impecable.</li>'}</ol></div>
    </div>
    <h2>Rúbrica</h2>
    <table><thead><tr><th>Criterio</th><th style="width:110px">Logro</th><th style="width:60px">Puntos</th><th>Comentario</th></tr></thead><tbody>
      ${r.items.map((i) => `<tr><td>${escapeHtml(i.label)}</td><td><div class="bar"><i class="${itemCls(i)}" style="width:${Math.round((100 * i.got) / Math.max(1e-9, i.max))}%"></i></div></td><td>${i.got}/${i.max}</td><td>${escapeHtml(i.comment)}</td></tr>`).join('')}
    </tbody></table>
    ${r.series?.length ? `<h2>Series adquiridas y dosis</h2><table><thead><tr><th>Serie</th><th>Técnica</th><th>CTDIvol</th><th>DLP</th></tr></thead><tbody>${r.series.map((x) => `<tr><td>${escapeHtml(x.name)}</td><td>${x.kv} kV · ${x.mas} mAs · pitch ${x.pitch} · ${x.thickness} mm</td><td>${x.ctdi} mGy</td><td>${x.dlp} mGy·cm</td></tr>`).join('')}</tbody></table>` : ''}
    ${r.explanation ? `<div class="learn"><b>Aprendizaje clave del caso.</b> ${escapeHtml(r.explanation)}</div>` : ''}
    <h2>Observaciones del docente</h2><div style="height:60px;border:1px solid #ddd;border-radius:6px"></div>
    <div class="sign"><div>Firma del estudiante<br>${escapeHtml(r.student)}</div><div>Firma del docente evaluador</div></div>
    ${footer()}`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
