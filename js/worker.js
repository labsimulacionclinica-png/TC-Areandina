// Worker: reconstruye cortes y topogramas fuera del hilo principal.
import { reconstructSlice, topogram } from './ct.js';

const anatomies = new Map();

self.onmessage = ({ data }) => {
  try {
    if (data.type === 'anatomy') {
      anatomies.set(data.anatomyId, data.structs);
      if (anatomies.size > 6) anatomies.delete(anatomies.keys().next().value);
      self.postMessage({ id: data.id, type: 'ok' });
      return;
    }
    const structs = anatomies.get(data.job.anatomyId);
    if (!structs) throw new Error('Anatomía no cargada en el worker');
    if (data.type === 'slice') {
      const img = reconstructSlice({ ...data.job, structs });
      self.postMessage({ id: data.id, type: 'result', result: img }, [img.buffer]);
    } else if (data.type === 'topogram') {
      const t = topogram({ ...data.job, structs });
      self.postMessage({ id: data.id, type: 'result', result: t }, [t.img.buffer, t.dw.buffer]);
    }
  } catch (err) {
    self.postMessage({ id: data.id, type: 'error', message: err.message });
  }
};
