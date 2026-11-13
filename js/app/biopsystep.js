// Biopsia pulmonar guiada por TC: interfaz (planificación sobre la imagen, aguja, controles, muestra).
import { $, pool, fmt, viewer, hooks } from './base.js';
import { S, ask, log, goto, offY } from './core.js';
import { ensureAnatomy } from './roomstep.js';
import { addDose } from './acquisition.js';
import { renderSeriesTabs } from './viewerstep.js';
import { readyExam } from './start.js';
import { ctdiVol } from '../ct.js';
import { planReport, tracePoints, newNeedle, advance, tipOf, needleExtras, pneumothoraxExtras, pneumoRisk } from '../biopsy.js';
import { mulberry32 } from '../phantom.js';
import { escapeHtml } from '../evaluation.js';

// La anatomía del paciente incluye la aguja y, si aparece, el neumotórax
hooks.biopsyExtras = () => (S?.biopsy ? [...needleExtras(S.biopsy.needle), ...(S.biopsy.pneumothorax ? pneumothoraxExtras(-1, S.caseDef.nodule.z) : [])] : []);
hooks.biopsyKey = () => (S?.biopsy ? JSON.stringify([S.biopsy.needle?.points, S.biopsy.pneumothorax]) : null);

export async function startBiopsy(mode, student, classCode) {
  await readyExam({
    caseKey: 'biopsia-pulmon', protocolKey: 'chest', mode, student, classCode, title: 'Biopsia pulmonar guiada por TC',
    seriesName: 'Planificación', range: [395, 465], logText: 'Procedimiento: biopsia pulmonar guiada por TC',
    setup: (st) => {
      st.params = { ...st.params, mas: 60, thickness: 2.5, kernel: 'lung', window: 'lung', dfov: 340 };
      st.biopsy = { entry: null, target: null, needle: null, controls: 0, sampled: false, pneumothorax: false, passes: 0, seed: (Date.now() & 0xffff) || 7 };
    },
  });
  goto('visor');
  $('biopsyPanel').hidden = false;
  renderBiopsy();
  await ask('Biopsia guiada por TC', `<p>${escapeHtml(S.caseDef.order)}</p><ol>
    <li>Busque el nódulo en la serie de planificación (ventana de pulmón).</li>
    <li>En ese corte, marque la <b>entrada en la piel</b> y el <b>objetivo</b> dentro del nódulo. La trayectoria debe evitar costillas, escápula, vasos y bronquios, atravesar la pleura una sola vez y recorrer el menor pulmón posible.</li>
    <li>Avance la aguja por pasos y compruebe con <b>cortes de control</b> (cada uno irradia). La aguja se desvía un poco: corrija la dirección si hace falta.</li>
    <li>Con la punta dentro del nódulo, <b>tome la muestra</b>. Después se hace un control final: busque complicaciones.</li></ol>`, [['Empezar', 0, true]]);
}

const rpx = () => (viewer.series?.dfov || 340) / 256;
const toPatient = (p) => ({ x: (p.x - 127.5) * rpx(), y: (127.5 - p.y) * rpx() - offY() });
const toPixel = (q) => ({ x: q.x / rpx() + 127.5, y: 127.5 - (q.y + offY()) / rpx() });
const currentZ = () => viewer.series?.zs[viewer.index];

function annotate() {
  const b = S.biopsy, ann = [];
  const z = b.needle?.z ?? b.planZ;
  if (b.entry) { const e = toPixel(b.entry); ann.push({ x0: e.x, y0: e.y, z, color: '#4cc38a', label: 'entrada' }); }
  if (b.target) { const t = toPixel(b.target); ann.push({ x0: t.x, y0: t.y, z, color: '#e5605a', label: 'objetivo' }); }
  if (b.entry && b.target) { const e = toPixel(b.needle ? tipOf(b.needle) : b.entry), t = toPixel(b.target); ann.push({ x0: e.x, y0: e.y, x1: t.x, y1: t.y, z, color: '#f2c14e', dash: true }); }
  viewer.annotations = ann;
  viewer.draw();
}

function renderBiopsy(extra = '') {
  const b = S.biopsy;
  let html = '';
  if (b.entry && b.target) {
    const r = b.report;
    html += `Trayectoria: <b>${fmt(r.length, 1)} mm</b>, ángulo ${fmt(r.angle)}°, pulmón aireado ${fmt(r.lungLength)} mm, ${r.pleura} punción(es) pleural(es). `;
    html += r.warnings.length ? `<span class="warnline">${r.warnings.map(escapeHtml).join(' ')}</span>` : '<span class="ok">Trayectoria segura.</span>';
  } else html += 'Marque la entrada y el objetivo en un corte axial donde se vea el nódulo.';
  if (b.needle) {
    const tip = tipOf(b.needle), n = S.caseDef.nodule, d = Math.hypot(tip.x - n.x, tip.y - n.y, b.needle.z - n.z);
    html += `<br>Aguja: ${b.passes} pase(s), ${b.controls} control(es). ${extra}`;
    if (S.mode === 'practica') html += ` <span class="muted">(pista: punta a ${fmt(d, 1)} mm del centro del nódulo)</span>`;
  }
  $('bxInfo').innerHTML = html;
  for (const id of ['bxAdvance', 'bxReplan']) $(id).disabled = !(b.entry && b.target);
  $('bxSample').disabled = !b.needle || b.sampled;
  annotate();
}

function startPick(kind) {
  if (!viewer.series) return;
  viewer.setView('axial');
  $('bxInfo').textContent = kind === 'entry' ? 'Haga clic en la piel, donde entrará la aguja…' : 'Haga clic dentro del nódulo…';
  viewer.pick = async (p) => {
    viewer.pick = null;
    const b = S.biopsy, q = toPatient(p), z = currentZ();
    if (kind === 'entry') {
      if (b.needle) { log('La aguja ya está insertada: use «Corregir dirección»', 'warn'); return renderBiopsy(); }
      b.entry = q; b.planZ = z;
    } else b.target = q;
    if (b.entry && b.target) {
      const an = await ensureAnatomy();
      const from = b.needle ? tipOf(b.needle) : b.entry;
      b.report = planReport(an.structs, from, b.target, b.needle?.z ?? b.planZ, S.caseDef.nodule);
    }
    renderBiopsy();
  };
}

$('bxEntry').onclick = () => startPick('entry');
$('bxTarget').onclick = () => startPick('target');
$('bxReplan').onclick = () => startPick('target');

$('bxAdvance').onclick = async () => {
  const b = S.biopsy;
  if (!b.needle) b.needle = newNeedle(b.entry, b.target, b.planZ, b.seed);
  const tip = tipOf(b.needle), left = Math.hypot(b.target.x - tip.x, b.target.y - tip.y);
  advance(b.needle, Math.min(+$('bxStep').value || 20, left + 2));
  b.passes++;
  log(`Aguja avanzada (${b.passes}.º pase)`);
  renderBiopsy('Haga un corte de control para ver dónde está la punta.');
};

// Corte de control: 3 cortes de 2,5 mm a baja dosis centrados en la aguja
async function controlScan(label = `Control ${S.biopsy.controls + 1}`) {
  const b = S.biopsy, p = S.params, z = b.needle?.z ?? b.planZ;
  const an = await ensureAnatomy();
  const zs = [z - 2.5, z, z + 2.5];
  const job = { anatomyId: an.id, kv: 120, thickness: 2.5, enh: {}, mas: 40, kernel: 'lung', sfov: 'body', dfov: p.dfov, offX: 0, offY: offY(), rot: 0.5, seed: 500 + b.controls * 7 };
  const slices = await Promise.all(zs.map((zz, i) => pool.slice({ ...job, z: zz, seed: job.seed + i })));
  const ctdi = ctdiVol({ ...p, kv: 120, coll: '16x0.625' }, 40);
  addDose(label, ctdi, ctdi * 0.75);
  b.controls++;
  const series = { name: label, phase: 'simple', params: { ...p, kv: 120, thickness: 2.5, kernel: 'lung', window: 'lung' }, zs, interval: 2.5, dfov: p.dfov, slices, dose: { ctdi, dlp: ctdi * 0.75, avgMas: 40 }, recon: true };
  S.series.push(series);
  viewer._kept = false;
  renderSeriesTabs(series);
  viewer.index = 1;
  viewer.draw();
  return series;
}
$('bxControl').onclick = async () => { if (!S.biopsy.needle) return; await controlScan(); renderBiopsy(); };

$('bxSample').onclick = async () => {
  const b = S.biopsy, an = await ensureAnatomy();
  b.sampled = true;
  // Trayectoria real completa (todos los pases)
  const pts = b.needle.points;
  b.finalTrace = tracePoints(an.structs, pts, b.needle.z, S.caseDef.nodule);
  const risk = pneumoRisk(b.finalTrace.lungLength, b.finalTrace.pleura, b.passes);
  b.pneumothorax = mulberry32(b.seed + 77)() < risk;
  log('Muestra tomada; se retira la aguja y se hace el control final', 'ok');
  b.needle = { ...b.needle, points: [b.needle.points[0]] }; // aguja retirada
  const tip = pts[pts.length - 1];
  b.needleFinal = { points: pts, z: b.needle.z, tip };
  await controlScan('Control final (tras retirar la aguja)');
  b.needle = { ...b.needle, points: pts }; // para la evaluación
  renderBiopsy();
  $('bxSample').disabled = true;
  await ask('Control final', '<p>Revise el control final en ventana de pulmón (también los cortes vecinos) y responda en «Finalizar» si hay neumotórax.</p>', [['Entendido', 0, true]]);
};
