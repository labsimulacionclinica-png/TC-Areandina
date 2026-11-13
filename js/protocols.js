// Protocolos de partida. El técnico puede modificarlos en la consola.
// mas = mAs efectivo (mAs por rotación / pitch). Con ATCM es el mAs de referencia para un adulto estándar.

export const PROTOCOLS = {
  head: {
    label: 'Cráneo simple', region: 'head', sfov: 'head', landmark: 'nasion', topo: { view: 'LAT', start: -170, length: 260 },
    params: { kv: 120, mas: 250, atcm: true, rot: 1, pitch: 0.55, coll: '32x0.625', thickness: 5, kernel: 'brain', dfov: 230, window: 'brain' },
    series: [{ name: 'Cráneo simple', phase: 'simple' }],
  },
  stroke: {
    label: 'Código ictus (simple + angio Willis + perfusión)', region: 'head', sfov: 'head', landmark: 'nasion', topo: { view: 'LAT', start: -170, length: 440 },
    params: { kv: 120, mas: 250, atcm: true, rot: 1, pitch: 0.55, coll: '32x0.625', thickness: 5, kernel: 'brain', dfov: 230, window: 'brain' },
    injector: { volume: 60, flow: 5, conc: 370, saline: 40 },
    series: [
      { name: 'Cráneo simple', phase: 'simple' },
      { name: 'Angio-TC TSA y Willis', phase: 'arterial', extendTo: 395, timing: { mode: 'fixed', delay: 24 }, params: { kv: 100, mas: 200, rot: 0.5, pitch: 0.9, coll: '64x0.625', thickness: 0.625, kernel: 'standard', sfov: 'body', dfov: 250, window: 'angio' } },
      { name: 'Perfusión', phase: 'perfusion', reinject: true, centerZ: 100, timing: { mode: 'fixed', delay: 2 }, injector: { volume: 40, flow: 5, conc: 370, saline: 30 }, params: { kv: 80, mas: 120, rot: 1, coll: '32x0.625', sfov: 'head', dfov: 230, atcm: false } },
    ],
  },
  pedHead: {
    label: 'Cráneo pediátrico (1–5 años)', region: 'head', sfov: 'head', landmark: 'nasion', topo: { view: 'LAT', start: -150, length: 220 },
    params: { kv: 100, mas: 160, atcm: true, rot: 0.75, pitch: 0.8, coll: '32x0.625', thickness: 5, kernel: 'brain', dfov: 200, window: 'brain' },
    series: [{ name: 'Cráneo simple pediátrico', phase: 'simple' }],
  },
  ctpa: {
    label: 'Angio-TC pulmonar (TEP)', region: 'chest', sfov: 'body', landmark: 'escotadura', topo: { view: 'AP', start: -60, length: 330 },
    params: { kv: 100, mas: 140, atcm: true, rot: 0.33, pitch: 1.2, coll: '64x0.625', thickness: 1.25, kernel: 'standard', dfov: 360, window: 'angio' },
    injector: { volume: 60, flow: 4.5, conc: 350, saline: 40 },
    series: [{ name: 'Angio arterias pulmonares', phase: 'arterial', timing: { mode: 'bt', comp: 'pa', monitorZ: 438, threshold: 100, delay: 5 } }],
  },
  liver3: {
    label: 'Hígado trifásico', region: 'abdomen', sfov: 'body', landmark: 'xifoides', topo: { view: 'AP', start: -120, length: 420 },
    params: { kv: 120, mas: 200, atcm: true, rot: 0.5, pitch: 1.0, coll: '64x0.625', thickness: 5, kernel: 'standard', dfov: 380, window: 'liver' },
    injector: { volume: 110, flow: 4, conc: 350, saline: 40 },
    series: [
      { name: 'Simple', phase: 'simple' },
      { name: 'Arterial tardía', phase: 'arterial', timing: { mode: 'bt', comp: 'aorta', monitorZ: 600, threshold: 150, delay: 15 } },
      { name: 'Portal', phase: 'portal', timing: { mode: 'fixed', delay: 70 } },
    ],
  },
  abdomen: {
    label: 'Abdomen y pelvis portal', region: 'abdomen', sfov: 'body', landmark: 'xifoides', topo: { view: 'AP', start: -120, length: 560 },
    params: { kv: 120, mas: 200, atcm: true, rot: 0.5, pitch: 1.0, coll: '64x0.625', thickness: 5, kernel: 'standard', dfov: 380, window: 'soft' },
    injector: { volume: 100, flow: 3, conc: 350, saline: 30 },
    series: [{ name: 'Abdomen y pelvis portal', phase: 'portal', timing: { mode: 'fixed', delay: 70 } }],
  },
  urolith: {
    label: 'Urotomografía simple baja dosis', region: 'abdomen', sfov: 'body', landmark: 'xifoides', topo: { view: 'AP', start: -60, length: 520 },
    params: { kv: 120, mas: 80, atcm: true, rot: 0.5, pitch: 1.2, coll: '64x0.625', thickness: 3, kernel: 'standard', dfov: 380, window: 'soft' },
    series: [{ name: 'Urotomografía simple', phase: 'simple' }],
  },
  lowdose: {
    label: 'Tórax baja dosis', region: 'chest', sfov: 'body', landmark: 'escotadura', topo: { view: 'AP', start: -60, length: 330 },
    params: { kv: 120, mas: 30, atcm: true, rot: 0.5, pitch: 1.4, coll: '64x0.625', thickness: 1.25, kernel: 'lung', dfov: 360, window: 'lung' },
    series: [{ name: 'Tórax baja dosis', phase: 'simple' }],
  },
  angioaorta: {
    label: 'Angio-TC de aorta', region: 'chest', sfov: 'body', landmark: 'escotadura', topo: { view: 'AP', start: -60, length: 660 },
    params: { kv: 100, mas: 150, atcm: true, rot: 0.33, pitch: 1.2, coll: '64x0.625', thickness: 2.5, kernel: 'standard', dfov: 380, window: 'angio' },
    injector: { volume: 80, flow: 4.5, conc: 350, saline: 40 },
    series: [{ name: 'Angio aorta', phase: 'arterial', timing: { mode: 'bt', comp: 'aorta', monitorZ: 450, threshold: 150, delay: 6 } }],
  },
  neck: {
    label: 'Cuello contrastado', region: 'neck', sfov: 'body', landmark: 'menton', topo: { view: 'LAT', start: -120, length: 300 },
    params: { kv: 120, mas: 160, atcm: true, rot: 0.5, pitch: 0.8, coll: '64x0.625', thickness: 2.5, kernel: 'soft', dfov: 250, window: 'soft' },
    injector: { volume: 80, flow: 2.5, conc: 350, saline: 30 },
    series: [{ name: 'Cuello venoso', phase: 'portal', timing: { mode: 'fixed', delay: 65 } }],
  },
  tap: {
    label: 'Tórax, abdomen y pelvis (trauma)', region: 'abdomen', sfov: 'body', landmark: 'escotadura', topo: { view: 'AP', start: -60, length: 660 },
    params: { kv: 120, mas: 180, atcm: true, rot: 0.5, pitch: 1.2, coll: '64x0.625', thickness: 5, kernel: 'standard', dfov: 400, window: 'soft' },
    injector: { volume: 100, flow: 3.5, conc: 350, saline: 40 },
    series: [{ name: 'Tórax-abdomen-pelvis portal', phase: 'portal', timing: { mode: 'fixed', delay: 70 } }],
  },
  pelvis: {
    label: 'Pelvis simple', region: 'abdomen', sfov: 'body', landmark: 'cresta', topo: { view: 'AP', start: -60, length: 260 },
    params: { kv: 120, mas: 200, atcm: true, rot: 0.5, pitch: 0.8, coll: '64x0.625', thickness: 3, kernel: 'standard', dfov: 380, window: 'soft' },
    series: [{ name: 'Pelvis simple', phase: 'simple' }],
  },
  coronary: {
    label: 'Angio-TC coronaria (ECG)', region: 'chest', sfov: 'body', landmark: 'escotadura', topo: { view: 'AP', start: -20, length: 300 },
    params: { kv: 100, mas: 220, atcm: true, rot: 0.28, pitch: 1, coll: '64x0.625', thickness: 0.625, kernel: 'standard', dfov: 200, window: 'angio', ecg: 'prospectivo', phase: 75 },
    injector: { volume: 70, flow: 5, conc: 370, saline: 40 },
    series: [{ name: 'Score de calcio', phase: 'simple', params: { kv: 120, mas: 90, thickness: 3, kernel: 'standard', window: 'soft' } }, { name: 'Coronarias', phase: 'arterial', timing: { mode: 'bt', comp: 'aorta', monitorZ: 445, threshold: 120, delay: 6 } }],
  },
  chest: {
    label: 'Tórax estándar', region: 'chest', sfov: 'body', landmark: 'escotadura', topo: { view: 'AP', start: -60, length: 330 },
    params: { kv: 120, mas: 110, atcm: true, rot: 0.5, pitch: 1.1, coll: '64x0.625', thickness: 5, kernel: 'standard', dfov: 360, window: 'soft' },
    series: [{ name: 'Tórax simple', phase: 'simple' }],
  },
};

export const PARAM_DEFS = [
  { key: 'kv', label: 'kV', type: 'select', options: [80, 100, 120, 140] },
  { key: 'mas', label: 'mAs ef. (ref.)', type: 'number', min: 10, max: 600, step: 5 },
  { key: 'atcm', label: 'Modulación (ATCM)', type: 'bool' },
  { key: 'rot', label: 'Rotación (s)', type: 'select', options: [0.28, 0.33, 0.5, 0.75, 1] },
  { key: 'pitch', label: 'Pitch', type: 'select', options: [0.55, 0.8, 1, 1.2, 1.4, 1.5] },
  { key: 'coll', label: 'Colimación', type: 'coll' },
  { key: 'thickness', label: 'Grosor (mm)', type: 'select', options: [0.625, 1.25, 2.5, 3, 5] },
  { key: 'kernel', label: 'Filtro', type: 'kernel' },
  { key: 'dfov', label: 'DFOV (mm)', type: 'number', min: 150, max: 500, step: 10 },
  { key: 'ecg', label: 'Sincronización ECG', type: 'select', options: ['none', 'prospectivo', 'retrospectivo'], labels: { none: 'Sin ECG', prospectivo: 'Prospectiva', retrospectivo: 'Retrospectiva' } },
  { key: 'phase', label: 'Fase cardíaca (%)', type: 'select', options: [35, 40, 45, 65, 70, 75, 80] },
  { key: 'tilt', label: 'Inclinación gantry (°)', type: 'select', options: [0, -10, -15, -20, -25] },
  { key: 'dualEnergy', label: 'Doble energía 80/140 kV', type: 'bool' },
  { key: 'iterative', label: 'Iterativa (%)', type: 'select', options: [0, 20, 40, 60, 80, 100] },
  { key: 'metalReduction', label: 'Reducción de metal', type: 'bool' },
  { key: 'sfov', label: 'SFOV', type: 'select', options: ['head', 'body'], labels: { head: 'Cabeza (300 mm)', body: 'Cuerpo (500 mm)' } },
];
