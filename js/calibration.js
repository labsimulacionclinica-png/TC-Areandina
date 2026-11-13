// Calibración del simulador con mediciones de un tomógrafo real (maniquí de agua y CTDIw).
import { reconstructSlice, applyScannerProfile, NCTDIW_DEFAULT, N0_DEFAULT, SCANNER } from './ct.js';
import { tube } from './phantom.js';

const $ = (id) => document.getElementById(id);
const KEY = 'opentc-scanner-profile';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
let profile = load();
applyScannerProfile(profile);

$('ctdiRows').innerHTML = ['head', 'body'].map((ph) => `<tr><td>${ph === 'head' ? 'Cabeza (16 cm)' : 'Cuerpo (32 cm)'}</td>${[80, 100, 120, 140].map((kv) => `<td><input type="number" step="0.1" min="0.5" max="80" data-ph="${ph}" data-kv="${kv}" placeholder="${NCTDIW_DEFAULT[ph][kv]}" value="${profile?.nctdiw?.[ph]?.[kv] ?? ''}"></td>`).join('')}</tr>`).join('');
$('name').value = profile?.name || '';
if (profile?.noise) { for (const k of ['ph', 'kv', 'mas', 'thk', 'kernel']) $(k).value = profile.noise[k]; $('sdMeas').value = profile.noise.sd; }

function status() {
  profile = load();
  $('status').textContent = profile ? `Perfil activo: ${profile.name || 'sin nombre'} (fotones × ${(profile.n0 / N0_DEFAULT).toFixed(2)} respecto al valor típico)` : 'Sin perfil: el simulador usa valores típicos de un equipo de 64 cortes.';
}

// Maniquí cilíndrico de agua de 32 o 20 cm, simulado con la misma física que los pacientes
function simulateNoise(n0) {
  const ph = $('ph').value, r = ph === 'body' ? 160 : 100;
  const structs = [{ name: 'agua', shape: tube(-200, 200, [0, 0], [0, 0], [r, r]), hu: 0, bone: 0, comp: null, clip: null, outline: true }];
  const job = { structs, kv: +$('kv').value, z: 0, thickness: +$('thk').value, enh: {}, mas: +$('mas').value, kernel: $('kernel').value, sfov: ph === 'body' ? 'body' : 'head', dfov: ph === 'body' ? 350 : 250, rot: 1, seed: 11, n0 };
  const sds = [], means = [];
  for (const seed of [11, 12, 13]) {
    const img = reconstructSlice({ ...job, seed });
    const rpx = job.dfov / 256, rr = Math.round(25 / rpx); // ROI de ~20 cm²
    let s = 0, s2 = 0, n = 0;
    for (let i = -rr; i <= rr; i++) for (let j = -rr; j <= rr; j++) {
      if (i * i + j * j > rr * rr) continue;
      const v = img[(128 + i) * 256 + 128 + j]; s += v; s2 += v * v; n++;
    }
    const m = s / n; means.push(m); sds.push(Math.sqrt(s2 / n - m * m));
  }
  return { sd: sds.reduce((a, b) => a + b) / sds.length, mean: means.reduce((a, b) => a + b) / means.length };
}

$('btnSim').onclick = () => {
  const r = simulateNoise(SCANNER.N0);
  $('sdSim').textContent = `${r.sd.toFixed(1)} HU (agua ${r.mean.toFixed(0)} HU)`;
};

$('btnSave').onclick = () => {
  const sd = +$('sdMeas').value;
  let n0 = profile?.n0 || N0_DEFAULT;
  const msgs = [];
  if (sd > 0) {
    // El ruido es ∝ 1/√N: N0_nuevo = N0 · (DE_simulada / DE_medida)²
    const sim = simulateNoise(N0_DEFAULT).sd;
    n0 = N0_DEFAULT * (sim / sd) ** 2;
    const check = simulateNoise(n0).sd;
    $('sdSim').textContent = `${check.toFixed(1)} HU`;
    msgs.push(`Ruido: simulado ${sim.toFixed(1)} → medido ${sd.toFixed(1)} HU; tras calibrar el simulador da ${check.toFixed(1)} HU.`);
  }
  const nctdiw = { head: {}, body: {} };
  for (const inp of document.querySelectorAll('[data-ph]')) if (inp.value) nctdiw[inp.dataset.ph][inp.dataset.kv] = +inp.value;
  const p = { name: $('name').value.trim(), n0, nctdiw, noise: { ph: $('ph').value, kv: $('kv').value, mas: $('mas').value, thk: $('thk').value, kernel: $('kernel').value, sd }, date: new Date().toISOString() };
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { $('saveMsg').textContent = 'No se pudo guardar en este navegador.'; return; }
  applyScannerProfile(p);
  msgs.push(`CTDIw personalizado en ${Object.keys(nctdiw.head).length + Object.keys(nctdiw.body).length} valor(es).`);
  $('saveMsg').textContent = `Perfil guardado. ${msgs.join(' ')} Recargue el simulador para usarlo.`;
  status();
};
$('btnReset').onclick = () => { try { localStorage.removeItem(KEY); } catch { /* */ } applyScannerProfile(null); $('saveMsg').textContent = 'Perfil eliminado: valores típicos.'; status(); };
$('btnExport').onclick = () => {
  const p = load();
  if (!p) { $('saveMsg').textContent = 'No hay perfil guardado.'; return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'opentc-perfil-tomografo.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('importFile').onchange = async (e) => {
  try {
    const p = JSON.parse(await e.target.files[0].text());
    if (!(p.n0 > 0)) throw new Error();
    localStorage.setItem(KEY, JSON.stringify(p));
    $('saveMsg').textContent = `Perfil «${p.name || 'sin nombre'}» importado.`;
    status();
  } catch { $('saveMsg').textContent = 'Archivo de perfil no válido.'; }
};
status();
