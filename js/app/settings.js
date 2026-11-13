// Ajustes: voz, xAPI y estado del PACS.
import { $ } from './base.js';
import { voice } from '../voice.js';
import { xapi } from '../xapi.js';
import { pool } from './base.js';

// Opciones de física (se guardan en el navegador y se aplican a todos los cortes nuevos)
const PHYS_KEY = 'opentc-physics';
export function physicsConfig() { try { return JSON.parse(localStorage.getItem(PHYS_KEY)) || { advanced: false, scatter: 'grid', boneBH: 'on' }; } catch { return { advanced: false, scatter: 'grid', boneBH: 'on' }; } }
export function applyPhysics(c = physicsConfig()) {
  pool.physics = c.advanced ? { physics: 'advanced', scatter: { off: c.scatter === 'off', noCorrection: c.scatter === 'nocorr' || c.scatter === 'nogrid', noGrid: c.scatter === 'nogrid' }, boneBH: c.boneBH !== 'off' } : null;
}
applyPhysics();

export async function pacsStatus() {
  try {
    const r = await fetch('api/pacs/status');
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return { configured: false, server: false };
    return { ...(await r.json()), server: true };
  } catch { return { configured: false, server: false }; }
}

async function open() {
  $('setVoice').checked = voice.enabled;
  $('setVoice').disabled = !voice.available;
  $('setVoiceInfo').textContent = voice.available ? 'Usa las voces del sistema en el idioma de la interfaz.' : 'Este navegador no tiene síntesis de voz.';
  const c = xapi.config();
  $('setXapiOn').checked = !!c.enabled; $('setXapiUrl').value = c.endpoint || ''; $('setXapiKey').value = c.key || ''; $('setXapiSecret').value = c.secret || '';
  $('setXapiInfo').textContent = `${xapi.queue().length} declaración(es) pendientes en este navegador.`;
  const ph = physicsConfig();
  $('setPhysAdv').checked = ph.advanced; $('setScatter').value = ph.scatter; $('setBoneBH').value = ph.boneBH; $('setPhysOpts').hidden = !ph.advanced;
  $('settingsDlg').showModal();
  const p = await pacsStatus();
  $('setPacsInfo').innerHTML = !p.server ? 'Sin servidor de OpenTC (p. ej. GitHub Pages): el envío al PACS es simulado.'
    : p.configured ? `PACS configurado en el servidor: <b>${p.target}</b>. El botón «Enviar al PACS» del paso Finalizar envía las imágenes por DICOMweb (STOW-RS).`
      : 'El servidor no tiene PACS configurado: el envío es simulado. Para usar Orthanc, inicie el servidor con OPENTC_PACS_URL (ver README).';
}

$('btnSettings').onclick = open;
$('setSave').onclick = () => {
  voice.enabled = $('setVoice').checked;
  xapi.setConfig({ enabled: $('setXapiOn').checked, endpoint: $('setXapiUrl').value.trim(), key: $('setXapiKey').value.trim(), secret: $('setXapiSecret').value });
  const ph = { advanced: $('setPhysAdv').checked, scatter: $('setScatter').value, boneBH: $('setBoneBH').value };
  try { localStorage.setItem(PHYS_KEY, JSON.stringify(ph)); } catch { /* sin almacenamiento */ }
  applyPhysics(ph);
  if (voice.enabled) voice.say('stayStill');
  $('settingsDlg').close();
};
$('setXapiFlush').onclick = async () => {
  xapi.setConfig({ enabled: $('setXapiOn').checked, endpoint: $('setXapiUrl').value.trim(), key: $('setXapiKey').value.trim(), secret: $('setXapiSecret').value });
  const r = await xapi.flush();
  $('setXapiInfo').textContent = r.error ? `Error del LRS: ${r.error}` : r.sent ? `${r.sent} declaración(es) enviadas.` : 'Nada que enviar (o el envío está desactivado).';
};
$('setXapiExport').onclick = () => xapi.export();
$('setPhysAdv').onchange = (e) => { $('setPhysOpts').hidden = !e.target.checked; };
