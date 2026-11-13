// Módulo «acquisition» de OpenTC Sim (antes parte de main.js).
import { buildAnatomy, serialize, LANDMARKS, lesion, structureAt, HARD_FACTOR, mulberry32 } from '../phantom.js';
import { COLLIMATIONS, KERNELS, WINDOWS, SCANNER, DRL, K_EFFECTIVE, doseReport, masProfile, dwFromTopogram, expectedNoise, ctdiVol, organDoses, heartDisplacement } from '../ct.js';
import { computeCurves, enhancementAt, CATHETERS, injectionSummary } from '../contrast.js';
import { CASES, caseByKey, allCases, METAL_ITEMS, METAL_Z, loadCustomCases, saveCustomCases } from '../cases.js';
import { PROTOCOLS, PARAM_DEFS } from '../protocols.js';
import { ReconPool } from '../pool.js';
import { Viewer, drawTopogram } from '../viewer.js';
import { evaluate, loadHistory, saveToHistory, exportJson, exportCsv, reportHtml, escapeHtml } from '../evaluation.js';
import { ARTIFACT_CASES, ARTIFACT_TYPES, artifactByKey, evaluateArtifact } from '../artifacts.js';
import { dicomSlice, zip, uid } from '../dicom.js';
import { Tour } from '../tour.js';
import { lms } from '../lms.js';
import { tourSteps } from '../tourSteps.js';
import { perfusionMaps, perfusionSummary } from '../perfusion.js';
import { dualEnergyImages, DE_OUTPUTS, parseOutput } from '../dualenergy.js';
import { $, pool, fmt, STEPS, viewer, hooks, on } from './base.js';
import { voice } from '../voice.js';
import { S, ask, goto, log, offY, practice, renderNav } from './core.js';
import { ensureAnatomy, room } from './roomstep.js';
import { dwAt, fmtTable, plot, regionKey } from './planning.js';
import { renderSeriesTabs } from './viewerstep.js';
import { params } from './start.js';

// ---------------------------------------------------------------------------
// 6. Adquisición
// ---------------------------------------------------------------------------

export let scanning = false;

export function renderPreflight() {
  if (!S) return;
  const items = [
    [S.prep.idChecked, 'Identidad verificada'],
    [!!S.prep.contrastDecision, 'Decisión sobre el contraste registrada'],
    [S.position.atIso, 'Paciente en el isocentro'],
    [S.topos.length > 0, 'Topograma adquirido'],
    [!!S.range, 'Rango planificado'],
    [!!S.params, 'Protocolo cargado'],
    [S.plan.length > 0, `${S.plan.length} serie(s) programada(s)`],
    [S.breathInstr || regionKey() === 'head', 'Instrucciones respiratorias activadas'],
  ];
  $('preflight').innerHTML = items.map(([ok, t]) => `<li class="${ok ? 'ok' : 'warn'}">${ok ? '✓' : '•'} ${t}</li>`).join('');
  $('btnScan').disabled = scanning || !S.topos.length || !S.range || !S.params || !S.plan.length;
}

// Eventos del paciente durante el examen (definidos por el caso): el estudiante elige qué hacer
export async function patientEvent(when) {
  const ev = S.caseDef.event;
  if (!ev || ev.when !== when || S.event?.type === ev.type) return;
  const choice = await ask(ev.title, `<p>${escapeHtml(ev.text)}</p><p class="small">¿Qué hace?</p>`, ev.options.map((o, i) => [o, i, false]), ev.danger);
  const ok = choice === ev.correct;
  S.event = { type: ev.type, choice, ok, handledOk: ok };
  scanLog(`${ev.title}: ${ev.options[choice]}`, ok ? 'ok' : 'warn');
  if (practice()) await ask(ok ? 'Bien hecho' : 'Revise la conducta', `<p>${escapeHtml(ev.explanation)}</p>`, [['Continuar', 0, true]]);
}

// Inicio de la media vuelta de un corte: con ECG se espera a que el corazón llegue a la fase elegida
export function gatedStart(t, p, phasePct = 75) {
  if (!p.ecg || p.ecg === 'none') return t;
  const hr = p.hr || 70, beat = 60 / hr;
  const ph = ((t * hr) / 60) % 1, target = phasePct / 100;
  const center = t + (((target - ph) % 1) + 1) % 1 * beat;
  return center - p.rot / 4; // la media vuelta queda centrada en la fase
}

export function scanLog(t, cls = '') {
  const li = document.createElement('li');
  li.className = cls; li.textContent = t;
  $('scanLog').prepend(li);
  log(t, cls);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const SIM_SPEED = 12; // segundos simulados por segundo real durante las esperas

export async function waitSim(from, to, label) {
  for (let t = from; t < to; t += 0.5) {
    $('clock').textContent = `${label} · t = ${fmt(t, 1)} s`;
    await sleep(500 / SIM_SPEED);
  }
}

export function addDose(name, ctdi, dlp) {
  S.dose.events.push({ name, ctdi, dlp });
  S.dose.dlp += dlp;
  updateDose();
}
export function updateDose() {
  const k = K_EFFECTIVE[regionKey() || 'abdomen'] || 0.015;
  $('dlpTotal').textContent = S ? `${fmt(S.dose.dlp)} mGy·cm` : '0';
  $('effTotal').textContent = S ? `${fmt(S.dose.dlp * k, 1)} mSv` : '0';
}

// Seguimiento del bolo: imagen de referencia sin contraste, ROI del usuario y monitorización
export async function boluTracking(series, enhAt, an, tInj = 0) {
  const t = series.timing, p = S.params;
  $('btEmpty').hidden = true;
  $('btNote').textContent = `nivel ${fmtTable(t.monitorZ)} mm · umbral ${t.threshold} HU`;
  const job = { anatomyId: an.id, kv: p.kv, z: t.monitorZ, thickness: 10, enh: {}, mas: 20, kernel: 'standard', sfov: p.sfov, dfov: p.dfov, offX: 0, offY: offY(), rot: p.rot, seed: 99 };
  const base = await pool.slice(job);
  addDose('Seguimiento: referencia', ctdiVol({ ...p, coll: '16x0.625' }, 20), ctdiVol({ ...p, coll: '16x0.625' }, 20) * 1);
  const cv = $('btCanvas'), bv = new Viewer(cv);
  bv.setSeries({ slices: [base], zs: [t.monitorZ], dfov: p.dfov, interval: 10 });
  bv.setWindow(400, 40);
  $('btHint').textContent = 'Haga clic en el centro del vaso de referencia para colocar la ROI.';
  const roi = await new Promise((resolve) => {
    const h = (e) => {
      const q = bv.toImage(e);
      if (!q) return;
      cv.removeEventListener('click', h);
      resolve({ cx: q.x, cy: q.y, r: 4 });
    };
    cv.addEventListener('click', h);
  });
  bv.roi = roi; bv.draw();
  const rpx = p.dfov / 256;
  const xIso = (roi.cx - 127.5) * rpx, yIso = (127.5 - roi.cy) * rpx;
  const st = structureAt(an.structs, xIso, yIso - offY(), t.monitorZ);
  const baseHU = bv.roiStats(bv.current(), roi)?.mean ?? 0;
  const comp = st?.comp || null;
  scanLog(`ROI de seguimiento en: ${st ? st.name.replace(/-/g, ' ') : 'fuera del paciente'} (${fmt(baseHU)} HU)`, comp === series.timing.comp || (comp === 'pa' && series.timing.comp === 'pa') ? '' : 'warn');
  const rnd = mulberry32(5);
  const pts = [];
  const fI = HARD_FACTOR.iodine[p.kv];
  let trig = null;
  for (let tt = 6; tt <= 70; tt += 1.5) {
    const enh = comp ? (enhAt(tInj + tt)[comp] || 0) * fI : 0;
    const hu = baseHU + enh + (rnd() - 0.5) * 16;
    pts.push([tt, hu]);
    addDose('Seguimiento', 0, ctdiVol({ ...p, coll: '16x0.625' }, 20) * 0.5);
    plot($('btCurve'), [], 70, Math.max(400, t.threshold + 100), [], pts, t.threshold);
    $('clock').textContent = `Seguimiento del bolo · t = ${fmt(tt, 1)} s · ROI ${fmt(hu)} HU`;
    await sleep(1500 / SIM_SPEED * 2);
    if (hu >= t.threshold) { trig = tt; break; }
  }
  if (trig == null) { trig = 70; scanLog('El umbral no se alcanzó: disparo manual a los 70 s', 'err'); }
  else scanLog(`Disparo a los ${fmt(trig, 1)} s (${t.threshold} HU)`, 'ok');
  $('btHint').textContent = '';
  return tInj + trig;
}

export async function runScan() {
  if (scanning) return;
  scanning = true;
  renderPreflight();
  const p0 = { ...S.params, hr: S.hr || 70 };
  S.hrAtScan = p0.hr;
  if (p0.ecg !== undefined) scanLog(`ECG: ${p0.hr} lpm · ${p0.ecg === 'none' ? 'sin sincronizar' : `${p0.ecg}, fase ${p0.phase} %`}`);
  scanLog(`Motor de reconstrucción: ${pool.engine}`);
  await patientEvent('start');
  const c = S.caseDef, pat = c.patient;
  const an = await ensureAnatomy();
  const dw = dwAt();
  // Inyecciones (puede haber una segunda, p. ej. perfusión tras la angio): realce = suma de todas
  const injs = [];
  const enhAt = (t) => {
    const out = {};
    for (const { curves, t0 } of injs) {
      if (t < t0) continue;
      const e = enhancementAt(curves, t - t0);
      for (const k in e) out[k] = (out[k] || 0) + e[k];
    }
    return out;
  };
  let prevEnd = -1e9; // instante (s desde la primera inyección) en que terminó la serie anterior
  const inject = (inj, t0, label) => {
    const cat = CATHETERS[S.prep.catheter];
    inj = { ...inj };
    if (inj.flow > cat.maxFlow + 1) {
      scanLog(`Extravasación: el inyector se detuvo por sobrepresión (${inj.flow} mL/s con ${cat.label})`, 'err');
      S.event = { type: 'extravasacion' };
      inj.volume = Math.min(inj.volume, inj.flow * 6);
    } else if (inj.flow > cat.maxFlow) scanLog(`Presión alta en el inyector: caudal por encima de lo recomendado para ${cat.label}`, 'warn');
    injs.push({ curves: computeCurves(inj, pat), t0 });
    S.injected = true;
    S.injectorUsed ||= inj;
    S.contrastTotal = (S.contrastTotal || 0) + inj.volume;
    scanLog(`${label}: ${inj.volume} mL a ${inj.flow} mL/s (${inj.conc} mgI/mL) + ${inj.saline} mL de suero`, 'ok');
    voice.say('contrast');
  };
  try {
    for (let si = 0; si < S.plan.length; si++) {
      const plan = S.plan[si];
      const p = { ...p0, ...(plan.params || {}) };
      // La angio puede extenderse más allá del rango planificado (p. ej. desde el cayado aórtico)
      const z0 = S.range[0], z1 = plan.extendTo ? Math.max(S.range[1], plan.extendTo) : S.range[1];
      const fI = HARD_FACTOR.iodine[p.kv];
      let startT;
      const contrastPhase = plan.phase !== 'simple';
      if (contrastPhase && !injs.length && !S.noContrast) {
        // ¿se inyecta?
        if (S.prep.catheter === 'none') {
          const v = await ask('Sin acceso venoso', '<p>No hay catéter colocado. Sin vía no se puede inyectar.</p>', [['Adquirir sin contraste', 'skip'], ['Cancelar', 'cancel', true]]);
          if (v === 'cancel') return;
          S.noContrast = true;
        } else {
          let go = true;
          if (S.prep.contrastDecision !== 'apto') {
            const v = await ask('Contraste no autorizado', `<p>Usted registró: <b>${{ no: 'no requiere contraste', consultar: 'suspender y consultar al radiólogo' }[S.prep.contrastDecision] || 'sin decisión'}</b>. ¿Qué desea hacer?</p>`, [['Inyectar de todas formas', 'inj'], ['Adquirir sin contraste', 'skip', true], ['Cancelar', 'cancel']]);
            if (v === 'cancel') return;
            go = v === 'inj';
          }
          if (go) {
            inject(plan.injector || S.injector, 0, 'Inyección');
            if (c.contrast === 'contraindicado') {
              S.adverse = true;
              scanLog('REACCIÓN ADVERSA: urticaria, broncoespasmo e hipotensión al minuto de la inyección', 'err');
              await ask('Reacción adversa al contraste', '<p>A los 40 s de iniciar la inyección el paciente presenta urticaria generalizada, sibilancias e hipotensión. Se detiene el estudio y se activa el protocolo de reacciones (médico radiólogo, adrenalina, oxígeno).</p><p class="small">El paciente tenía una reacción previa moderada-grave y un FG de 24: el contraste estaba contraindicado.</p>', [['Entendido', 0, true]], true);
              break;
            }
            await patientEvent('injection');
          } else S.noContrast = true;
        }
      } else if (contrastPhase && injs.length && plan.reinject) {
        // Segunda inyección (bolo propio de la serie)
        const t0 = prevEnd + 20;
        await waitSim(Math.max(0, prevEnd), t0, 'Recargando el inyector');
        inject(plan.injector || S.injector, t0, 'Segunda inyección');
      }
      const haveContrast = injs.length > 0;
      const tInj = injs.length ? injs[injs.length - 1].t0 : 0;
      // Instante de inicio
      if (!contrastPhase || !haveContrast) startT = Math.max(prevEnd + 4, haveContrast ? prevEnd + 4 : -1e6);
      else if (plan.timing?.mode === 'bt') {
        const trig = await boluTracking(plan, enhAt, an, tInj);
        const minDelay = S.breathInstr && regionKey() !== 'head' ? 4 : 2;
        if (S.breathInstr && regionKey() !== 'head' && plan.timing.delay < 4) scanLog('El retardo tras el disparo es menor que la duración de la instrucción respiratoria: se usan 4 s', 'warn');
        startT = Math.max(trig + Math.max(plan.timing.delay, minDelay), prevEnd + 4);
      } else startT = Math.max(tInj + (plan.timing?.delay ?? 70), prevEnd + 4);
      if (haveContrast && startT > 0) await waitSim(Math.max(0, prevEnd), startT, 'Esperando el retardo');

      if (plan.phase === 'perfusion') {
        prevEnd = await perfusionSeries(plan, p, an, enhAt, startT, si);
        continue;
      }

      // Geometría y tiempos
      const zs = [];
      for (let z = z0; z <= z1 + 1e-6; z += p.thickness) zs.push(z);
      const rep = doseReport(p, z0, z1, dw, regionKey());
      const { mas } = masProfile(p, zs, dw);
      const times = zs.map((z) => gatedStart(startT + (z - z0) / rep.speed, p, p.phase));
      // Movimiento
      const chestAbd = regionKey() !== 'head';
      const tol = pat.breathHold || 0;
      let motionLabel = null;
      const rigid = (t) => {
        if (chestAbd && !S.breathInstr) { motionLabel = 'respiración'; return { amp: 7, period: 4, phase: 0 }; }
        if (chestAbd && tol && t - startT > tol) { motionLabel = 'apnea superada'; return { amp: 6, period: 3.5, phase: 0.7 }; }
        if (!chestAbd && !pat.cooperative && !S.position.strap) { motionLabel = 'cabeza'; return { head: 3.5 }; }
        if (S.event?.type === 'ansiedad' && !S.event.handledOk) { motionLabel = 'paciente ansioso'; return { head: 2.5, amp: 3, period: 3 }; }
        return null;
      };
      // En los protocolos cardíacos el corazón late durante la rotación
      const motionFor = (t) => {
        const m = rigid(t);
        if (p.ecg === undefined) return m;
        const [ax, ay] = heartDisplacement(t, p.hr, 5), [bx, by] = heartDisplacement(t + p.rot / 2, p.hr, 5);
        if (Math.hypot(bx - ax, by - ay) > 1.5 && !motionLabel) motionLabel = 'latido cardíaco';
        return { ...(m || {}), cardiac: { hr: p.hr, amp: 5 } };
      };
      const series = { name: plan.name, phase: plan.phase, params: p, zs, interval: p.thickness, dfov: p.dfov, slices: new Array(zs.length).fill(null), dose: rep, times, startT };
      series.position = { ...S.position };
      series.breathInstr = S.breathInstr;
      // Datos brutos: lo necesario para reconstruir de nuevo sin volver a irradiar
      // raw: física con la que se «midieron» los datos brutos (incluye defectos del detector) → se conserva al reconstruir
      const raw = { ...(pool.physics || { physics: 'standard' }), detectorDefects: S.detectorDefects || null };
      series.acq = { z0, z1, startT, speed: rep.speed, anatomyId: an.id, enhAt, motionFor, p, offY: offY(), seedBase: si * 7919, masAt: (z) => masProfile(p, [z], dw).mas[0], raw };
      S.series.push(series);
      renderSeriesTabs(series);
      room?.update({ scanning: true });
      await voice.say(regionKey() === 'head' ? 'stayStill' : S.breathInstr ? 'breathIn' : 'tableMoves', { wait: true });
      scanLog(`${plan.name}: ${zs.length} cortes, ${fmt(rep.time, 1)} s, CTDIvol ${fmt(rep.ctdi, 1)} mGy${rep.limited ? ' (límite del tubo)' : ''}`);
      let done = 0;
      const kvs = p.dualEnergy ? [80, 140] : [p.kv];
      const sets = kvs.map(() => new Array(zs.length).fill(null));
      const jobs = [];
      kvs.forEach((kv, e) => zs.forEach((z, k) => {
        const t = times[k];
        jobs.push(pool.slice({ anatomyId: an.id, kv, z, thickness: p.thickness, enh: enhAt(t), mas: mas[k] / kvs.length, kernel: p.kernel, sfov: p.sfov, dfov: p.dfov, offX: 0, offY: offY(), motion: motionFor(t), t, rot: p.rot, seed: si * 7919 + k * 31 + 1 + e * 5003, metalReduction: !!p.metalReduction, iterative: p.iterative || 0, tilt: p.tilt || 0, ...raw })
          .then((img) => {
            sets[e][k] = img;
            if (!p.dualEnergy) series.slices[k] = img;
            done++;
            $('scanBar').style.width = `${(100 * done) / jobs.length}%`;
            $('scanText').textContent = `${plan.name}: ${done}/${zs.length * kvs.length}`;
            if (haveContrast) $('clock').textContent = `Adquisición · t = ${fmt(startT + Math.min(rep.time, (done / jobs.length) * rep.time), 1)} s`;
            if (done % 8 === 0 && viewer.series === series) viewer.draw();
          }));
      }));
      await Promise.all(jobs);
      if (p.dualEnergy) {
        series.de = { low: sets[0], high: sets[1] };
        series.slices = dualEnergyImages(series.de, { type: 'vmi', kev: 70 });
        series.name += ' · VMI 70 keV';
        series.deOutput = { type: 'vmi', kev: 70 };
        renderSeriesTabs(series);
      }
      series.motion = motionLabel;
      if (motionLabel) scanLog(`Artefactos de movimiento (${motionLabel}) en ${plan.name}`, 'warn');
      // Realce medido en los niveles de interés (para la evaluación)
      const atZ = (z) => { const k = zs.reduce((best, zz, i) => (Math.abs(zz - z) < Math.abs(zs[best] - z) ? i : best), 0); return times[k]; };
      if (haveContrast) {
        const m = {};
        for (const [comp, z] of [['pa', 432], ['aorta', 620], ['portal', 635], ['liver', 620], ['hcc', 632], ['jugular', 250], ['cerebralArt', 125], ['venous', 60]]) m[comp] = (enhAt(atZ(z))[comp] || 0) * fI;
        series.measured = m;
      }
      series.ctdi = rep.ctdi;
      addDose(plan.name, rep.ctdi, rep.dlp);
      prevEnd = startT + rep.time;
      if (regionKey() !== 'head' && S.breathInstr) voice.say('breathOut');
      room?.update({ scanning: false });
      viewer.setSeries(series);
    }
    if (S.injected) await patientEvent('end');
    scanLog('Adquisición terminada', 'ok');
    goto('visor');
  } finally {
    scanning = false;
    room?.update({ scanning: false });
    $('clock').textContent = '';
    renderPreflight(); renderNav();
  }
}

// Perfusión: cine axial (sin mover la mesa) de 8 niveles de 5 mm (40 mm), una vuelta cada 1,5 s durante ~45 s.
export async function perfusionSeries(plan, p, an, enhAt, startT, si) {
  const center = plan.centerZ ?? (S.range[0] + S.range[1]) / 2;
  const levels = [-17.5, -12.5, -7.5, -2.5, 2.5, 7.5, 12.5, 17.5].map((d) => center + d);
  const nF = 30, dt = 1.5;
  const times = Array.from({ length: nF }, (_, f) => startT + f * dt);
  const coll = COLLIMATIONS[p.coll];
  const ctdiFrame = ctdiVol({ ...p, coll: p.coll }, p.mas);
  const ctdi = ctdiFrame * nF, dlp = ctdi * 4;
  scanLog(`${plan.name}: ${levels.length} niveles × ${nF} tiempos (cada ${dt} s), ${p.kv} kV, CTDIvol ${fmt(ctdi)} mGy`);
  room?.update({ scanning: true });
  const frames = levels.map(() => new Array(nF).fill(null));
  let done = 0;
  const total = levels.length * nF;
  const jobs = [];
  levels.forEach((z, l) => times.forEach((t, f) => {
    jobs.push(pool.slice({ anatomyId: an.id, kv: p.kv, z, thickness: 5, enh: enhAt(t), mas: p.mas, kernel: 'brain', sfov: p.sfov, dfov: p.dfov, offX: 0, offY: offY(), motion: null, t, rot: p.rot, seed: si * 7919 + l * 977 + f * 31 + 3 })
      .then((img) => {
        frames[l][f] = img; done++;
        $('scanBar').style.width = `${(100 * done) / total}%`;
        $('scanText').textContent = `${plan.name}: ${done}/${total}`;
        $('clock').textContent = `Perfusión · t = ${fmt(t, 1)} s`;
      }));
  }));
  await Promise.all(jobs);
  // Serie dinámica (nivel central) para revisar las curvas
  const mid = 3;
  const dyn = { recon: true, derived: true, name: `${plan.name} · dinámica (nivel ${fmtTable(levels[mid])} mm)`, phase: 'perfusion', params: { ...p, thickness: 5, kernel: 'brain', window: 'brain' }, zs: times.map(() => levels[mid]), frameTimes: times, interval: 5, dfov: p.dfov, slices: frames[mid], dose: { ctdi, dlp, avgMas: p.mas }, times };
  S.series.push(dyn);
  // Mapas
  const maps = levels.map((_, l) => perfusionMaps(frames[l], times));
  const mk = (key, label, scale, unit, ww, wl) => ({
    name: `${label} (${unit})`, phase: 'perfusion-map', derived: true, recon: true, params: { ...p, thickness: 5, kernel: 'brain', window: null }, zs: levels, interval: 5, dfov: p.dfov,
    slices: maps.map((m) => Int16Array.from(m[key], (v) => Math.round(v * scale))), colormap: true, mapWindow: { ww, wl }, unitScale: scale, unit, dose: { ctdi: 0, dlp: 0, avgMas: p.mas },
  });
  const sCbf = mk('cbf', 'CBF', 1, 'mL/100 g/min', 80, 40), sCbv = mk('cbv', 'CBV', 10, 'mL/100 mL ×10', 60, 30), sTmax = mk('tmax', 'Tmax', 10, 's ×10', 160, 80), sMtt = mk('mtt', 'MTT', 10, 's ×10', 200, 100);
  S.series.push(sCbf, sCbv, sTmax, sMtt);
  const sum = perfusionSummary(maps, p.dfov / 256, 5);
  S.perfusion = sum;
  scanLog(`Perfusión: núcleo ≈ ${fmt(sum.coreMl)} mL (CBF < 30 %), hipoperfusión Tmax > 6 s ≈ ${fmt(sum.hypoMl)} mL, penumbra ≈ ${fmt(sum.mismatchMl)} mL, razón ${Number.isFinite(sum.ratio) ? fmt(sum.ratio, 1) : '∞'}`, 'ok');
  addDose(plan.name, ctdi, dlp);
  room?.update({ scanning: false });
  renderSeriesTabs(sCbf);
  return startT + nF * dt;
}


$('btnScan').onclick = async () => {
  if (S.series.some((s) => !s.recon)) {
    const v = await ask('Repetir la adquisición', '<p>Ya hay series adquiridas. Repetir añade dosis al paciente (y se tendrá en cuenta en la evaluación). Si solo necesita otro filtro, grosor o campo de visión, reconstruya desde los datos brutos en el visor.</p>', [['Repetir', 1], ['Cancelar', 0, true]]);
    if (!v) return;
    if (!S.artifact) S.extraSeries += S.plan.length;
  }
  runScan().catch((err) => { console.error(err); scanLog(`Error: ${err.message}`, 'err'); });
};


// Calibración en aire del detector (control de calidad): iguala la ganancia de todos los canales.
// Corrige los anillos de los canales descalibrados; no cambia la dosis del paciente (se hace sin él).
$('btnAirCal').onclick = async () => {
  if (!S) return;
  $('btnAirCal').disabled = true;
  $('airCalInfo').textContent = 'Calibrando con la mesa fuera del gantry…';
  await new Promise((r) => setTimeout(r, 1500));
  const n = S.detectorDefects?.length || 0;
  S.detectorDefects = null;
  S.airCal = true;
  $('airCalInfo').textContent = n ? `Hecho: se corrigió la ganancia de ${n} canal(es) fuera de tolerancia.` : 'Hecho: todos los canales dentro de tolerancia.';
  log('Calibración en aire del detector', 'ok');
  $('btnAirCal').disabled = false;
};
on('exam', () => { $('airCalInfo').textContent = ''; });