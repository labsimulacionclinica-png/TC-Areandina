// Casos de artefactos: el paciente ya está preparado y hay una serie «Original» con un artefacto.
// El estudiante lo identifica, corrige la causa (posición, protocolo o reconstrucción) y repite.

export const ARTIFACT_TYPES = {
  motion: 'Movimiento del paciente (respiración)',
  metal: 'Metal: endurecimiento del haz y falta de fotones',
  arms: 'Brazos dentro del campo (rayas y ruido)',
  truncation: 'Truncamiento: el paciente se sale del campo de medida (SFOV)',
  stair: 'Escalera en las reconstrucciones MPR (cortes gruesos)',
  noise: 'Ruido cuántico excesivo (pocos fotones para el tamaño del paciente)',
  rings: 'Anillos: canal del detector defectuoso o sin calibrar',
};

// setup(S): estropea la preparación o el protocolo antes de la serie original.
// fixed(S, rep, orig): comprueba si la repetición (o una reconstrucción) corrige el problema.
export const ARTIFACT_CASES = [
  {
    key: 'art-movimiento', type: 'motion', baseCase: 'urolitiasis', protocol: 'urolith',
    title: 'Artefacto: abdomen con dobles contornos',
    brief: 'La serie de abdomen muestra contornos dobles y rayas que salen de las interfaces aire/tejido.',
    setup: (S) => { S.breathInstr = false; },
    fixed: (S, rep) => ({ ok: !!rep && !rep.motion, comment: rep?.motion ? `La repetición sigue con movimiento (${rep.motion}).` : 'Activó las instrucciones respiratorias y la apnea cubre la adquisición.' }),
    explanation: 'Si el paciente respira durante la rotación, las proyecciones no son coherentes entre sí: aparecen contornos dobles, rayas en las interfaces aire/tejido y, entre cortes, desplazamientos que se ven como escalones en las MPR. Se corrige con instrucciones respiratorias (inspire y no respire) y una adquisición más corta que la apnea que tolera el paciente (pitch más alto, rotación más rápida o colimación más ancha).',
  },
  {
    key: 'art-metal', type: 'metal', baseCase: 'protesis-cadera', protocol: 'pelvis',
    title: 'Artefacto: rayas en la pelvis',
    brief: 'La pelvis muestra rayas brillantes y oscuras que irradian desde la cadera derecha.',
    setup: (S) => { S.params.metalReduction = false; },
    fixed: (S, rep) => {
      const ok = !!rep && rep.params.metalReduction;
      return { ok, comment: ok ? `Repitió con reducción de metal${rep.params.kv >= 140 ? ' y 140 kV' : ''}.` : 'La repetición no usa reducción de artefactos metálicos (MAR).' };
    },
    explanation: 'El metal de la prótesis absorbe casi todos los fotones (falta de fotones) y endurece el haz: las proyecciones que lo atraviesan son erróneas y la retroproyección las convierte en rayas oscuras y brillantes. Se reduce con algoritmos de reducción de metal (MAR), kV más alto y mAs suficientes. Retirar el metal externo evita el problema por completo.',
  },
  {
    key: 'art-brazos', type: 'arms', baseCase: 'torax-nodulo', protocol: 'chest',
    title: 'Artefacto: rayas horizontales en el tórax',
    brief: 'El tórax muestra rayas horizontales y más ruido en la parte lateral.',
    setup: (S) => { S.position.arms = 'down'; },
    fixed: (S, rep) => ({ ok: !!rep && rep.position.arms === 'up', comment: rep?.position.arms === 'up' ? 'Repitió con los brazos sobre la cabeza.' : 'En la repetición los brazos siguen a los lados del cuerpo.' }),
    explanation: 'Con los brazos a los lados, los rayos laterales atraviesan mucho más tejido y los húmeros: llegan pocos fotones (ruido) y el haz se endurece (rayas horizontales entre los brazos). En tórax y abdomen los brazos van por encima de la cabeza. La modulación de corriente lo compensa solo en parte.',
  },
  {
    key: 'art-truncamiento', type: 'truncation', baseCase: 'urolitiasis', protocol: 'urolith',
    title: 'Artefacto: borde brillante en el abdomen',
    brief: 'La imagen del abdomen tiene un borde muy brillante a ambos lados y la anatomía lateral no aparece.',
    setup: (S) => { S.params.sfov = 'head'; S.params.dfov = 300; },
    fixed: (S, rep) => ({ ok: !!rep && rep.params.sfov === 'body' && rep.params.dfov >= 340, comment: rep?.params.sfov === 'body' ? `SFOV de cuerpo y DFOV de ${rep.params.dfov} mm.` : 'La repetición sigue con el SFOV de cabeza (300 mm).' }),
    explanation: 'El campo de medida (SFOV) de cabeza solo cubre 300 mm: la parte del abdomen que queda fuera atenúa los rayos pero no se mide, y la reconstrucción coloca esa atenuación en el borde del campo (borde brillante). Hay que usar el SFOV de cuerpo (500 mm) y un DFOV que incluya toda la piel. Con pacientes muy grandes también ayuda centrarlos bien.',
  },
  {
    key: 'art-escalera', type: 'stair', baseCase: 'torax-nodulo', protocol: 'chest',
    title: 'Artefacto: reconstrucción coronal escalonada',
    brief: 'En las reconstrucciones coronal y sagital los contornos del diafragma y de las costillas aparecen en escalones.',
    setup: (S) => { S.params.thickness = 5; S.params.kernel = 'standard'; },
    fixed: (S, rep) => {
      const thin = S.series.find((s) => s.params.thickness <= 1.25 && s !== S.originalSeries);
      return { ok: !!thin, byRecon: !!thin?.recon, comment: thin ? (thin.recon ? 'Reconstruyó cortes finos desde los datos brutos, sin dar más dosis.' : 'Repitió con cortes finos (había bastado con reconstruir desde los datos brutos).') : 'No hay ninguna serie con cortes ≤ 1,25 mm.' };
    },
    explanation: 'Las reconstrucciones multiplanares se construyen apilando los cortes axiales: con 5 mm, cada «escalón» mide 5 mm en el eje z. Como la adquisición helicoidal ya tiene los datos brutos con colimación fina, basta con reconstruir cortes finos (≤ 1,25 mm) y solapados sin volver a irradiar al paciente.',
  },
  {
    key: 'art-ruido', type: 'noise', baseCase: 'urolitiasis', protocol: 'urolith', weight: 132,
    title: 'Artefacto: imagen granulada en un paciente obeso',
    brief: 'El abdomen de un paciente de 132 kg se ve muy granulado y con rayas finas.',
    setup: (S) => { S.params.mas = 45; S.params.atcm = false; },
    fixed: (S, rep, orig) => {
      const a = noiseOf(orig), b = noiseOf(rep);
      const ok = b != null && a != null && b < a * 0.7;
      return { ok, comment: b != null ? `DE en la vejiga: ${Math.round(a)} → ${Math.round(b)} HU.` : 'No hay repetición.' };
    },
    explanation: 'El ruido depende del número de fotones que llegan al detector, y en un paciente grande llegan muy pocos. Hay que subir los mAs (o activar la modulación de corriente, que lo hace según el tamaño), considerar más kV y cortes algo más gruesos o reconstrucción iterativa. A cambio, la dosis aumenta: hay que justificarla.',
  },
  {
    key: 'art-anillos', type: 'rings', baseCase: 'craneo-hic', protocol: 'head',
    title: 'Artefacto: círculos concéntricos en el cráneo',
    brief: 'El TC de cráneo muestra varios círculos finos centrados en el isocentro, que se ven en todos los cortes.',
    setup: (S) => { S.detectorDefects = [{ pos: 0.57, gain: 0.96, width: 2 }, { pos: 0.615, gain: 1.035 }, { pos: 0.45, gain: 0.97 }]; },
    fixed: (S, rep) => ({ ok: !!rep && !rep.acq?.raw?.detectorDefects, comment: rep ? (rep.acq?.raw?.detectorDefects ? 'Repitió sin calibrar el detector: los anillos siguen.' : 'Hizo la calibración en aire y repitió: sin anillos.') : 'No hay repetición.' }),
    explanation: 'Cada canal del detector ocupa siempre la misma distancia al isocentro: si un canal tiene una ganancia distinta (defecto, deriva térmica o falta de calibración), su error se retroproyecta como un círculo centrado en el isocentro. Reconstruir de nuevo no sirve, porque el error está en los datos brutos. Se corrige con la calibración en aire del detector (control de calidad diario) y repitiendo; si persiste, el canal está averiado y hay que llamar al servicio técnico.',
  },
];

export const artifactByKey = (k) => ARTIFACT_CASES.find((a) => a.key === k);

// DE del ruido en una ROI de la vejiga (líquido homogéneo) en el corte más cercano a z = 905
export function noiseOf(series) {
  if (!series) return null;
  const k = series.zs.reduce((best, z, i) => (Math.abs(z - 905) < Math.abs(series.zs[best] - 905) ? i : best), 0);
  const img = series.slices[k];
  if (!img || Math.abs(series.zs[k] - 905) > 10) return null;
  const rpx = series.dfov / 256, cx = Math.round(127.5), cy = Math.round(127.5 - 38 / rpx), r = Math.round(15 / rpx);
  let s = 0, s2 = 0, n = 0;
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
    if (i * i + j * j > r * r) continue;
    const v = img[(cy + i) * 256 + cx + j]; s += v; s2 += v * v; n++;
  }
  const m = s / n;
  return Math.sqrt(Math.max(0, s2 / n - m * m));
}

export function evaluateArtifact(S, answer) {
  const a = S.artifact;
  const orig = S.originalSeries;
  const reps = S.series.filter((s) => s !== orig && !s.recon);
  const rep = reps[reps.length - 1] || null;
  const fix = a.fixed(S, rep, orig);
  const items = [];
  const idOk = answer === a.type;
  items.push({ label: 'Identificación del artefacto', max: 40, got: idOk ? 40 : 0, comment: idOk ? 'Correcta.' : `Era: ${ARTIFACT_TYPES[a.type]}.` });
  items.push({ label: 'Corrección', max: 40, got: fix.ok ? 40 : 0, comment: fix.comment });
  // Dosis: no repetir si bastaba con reconstruir; no disparar la dosis en la repetición
  let doseGot = 10, doseNote = 'Dosis adicional razonable.';
  if (a.type === 'stair') {
    if (fix.ok && fix.byRecon && !rep) doseNote = 'Sin dosis adicional.';
    else if (rep) { doseGot = 3; doseNote = 'Repitió la adquisición: bastaba con reconstruir desde los datos brutos.'; }
  } else if (rep && a.type !== 'noise' && rep.dose.ctdi > orig.dose.ctdi * 1.5) { doseGot = 4; doseNote = `La repetición tiene un CTDIvol de ${rep.dose.ctdi.toFixed(1)} mGy (original ${orig.dose.ctdi.toFixed(1)}).`; }
  else if (rep && a.type === 'noise' && rep.dose.ctdi > 40) { doseGot = 5; doseNote = `CTDIvol de ${rep.dose.ctdi.toFixed(1)} mGy: más de lo necesario.`; }
  if (reps.length > 1) { doseGot = Math.max(0, doseGot - 4); doseNote += ` ${reps.length} repeticiones.`; }
  items.push({ label: 'Dosis', max: 10, got: doseGot, comment: doseNote });
  const minutes = (Date.now() - S.startTime) / 60000;
  items.push({ label: 'Tiempo', max: 10, got: minutes <= 8 ? 10 : minutes <= 15 ? 5 : 0, comment: `${Math.round(minutes)} min.` });
  const total = items.reduce((s, i) => s + i.got, 0);
  return {
    student: S.student || 'Sin nombre', case: a.title, caseKey: a.key, date: new Date().toISOString(),
    realMinutes: Math.round(minutes), total, max: 100, percent: total, items,
    series: S.series.filter((s) => !s.recon).map((s) => ({ name: s.name, kv: s.params.kv, mas: Math.round(s.dose.avgMas), pitch: s.params.pitch, thickness: s.params.thickness, ctdi: +s.dose.ctdi.toFixed(2), dlp: +s.dose.dlp.toFixed(1) })),
    explanation: a.explanation,
  };
}
