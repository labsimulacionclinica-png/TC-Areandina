// Worker con WebGPU: reconstruye los cortes de uno en uno (la GPU ya trabaja en paralelo).
import { prepareSlice, measure, finishSlice } from './ct.js';
import { GpuRecon } from './gpu.js';

let gpu = null;
const anatomies = new Map();
// Varios cortes en vuelo a la vez (cada uno con sus búferes): la CPU prepara uno mientras la GPU calcula otro
const SLOTS = 4;
const free = Array.from({ length: SLOTS }, (_, i) => i);
const waiting = [];
const acquire = () => (free.length ? Promise.resolve(free.pop()) : new Promise((r) => waiting.push(r)));
const release = (s) => (waiting.length ? waiting.shift()(s) : free.push(s));

async function handle(data) {
  try {
    if (data.type === 'init') {
      gpu = await GpuRecon.create().catch(() => null);
      self.postMessage({ id: data.id, type: 'result', result: !!gpu });
      return;
    }
    if (data.type === 'anatomy') {
      anatomies.set(data.anatomyId, data.structs);
      if (anatomies.size > 6) anatomies.delete(anatomies.keys().next().value);
      self.postMessage({ id: data.id, type: 'result', result: true });
      return;
    }
    const structs = anatomies.get(data.job.anatomyId);
    if (!structs) throw new Error('Anatomía no cargada en el worker de GPU');
    const slot = await acquire();
    try {
      const ctx = prepareSlice({ ...data.job, structs });
      const { ps, ph } = await gpu.project(ctx, slot);
      const sino = measure(ctx, ps, ph);
      const img = await gpu.filterBackproject(ctx, sino, slot);
      const out = finishSlice(ctx, img);
      self.postMessage({ id: data.id, type: 'result', result: out }, [out.buffer]);
    } finally { release(slot); }
  } catch (err) {
    self.postMessage({ id: data.id, type: 'error', message: err.message });
  }
}

// init y anatomía en orden; los cortes se solapan entre sí
let setup = Promise.resolve();
self.onmessage = ({ data }) => {
  if (data.type === 'slice') setup.then(() => handle(data));
  else setup = setup.then(() => handle(data));
};
