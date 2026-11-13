// Reconstrucción en paralelo: un worker con WebGPU (si la GPU está disponible) y workers de CPU.
// Si no hay workers, calcula en el hilo principal.
import { reconstructSlice, topogram } from './ct.js';

export class ReconPool {
  constructor(size = Math.max(1, Math.min(navigator.deviceMemory && navigator.deviceMemory <= 4 ? 2 : 6, (navigator.hardwareConcurrency || 4) - 1))) {
    this.size = size;
    this.workers = [];
    this.pending = new Map();
    this.nextId = 1;
    this.anatomies = new Map(); // id → structs (para el modo sin workers)
    this.gpus = [];             // workers con WebGPU que funcionan
    this.useGpu = true;
    try {
      for (let n = 0; n < size; n++) this.workers.push(this.spawn('./worker.js'));
    } catch (err) {
      console.warn('Workers no disponibles; se calcula en el hilo principal.', err);
      this.workers = [];
    }
    this.gpuReady = this.initGpu();
  }

  spawn(path) {
    const worker = new Worker(new URL(path, import.meta.url), { type: 'module' });
    const entry = { worker, busy: 0 };
    worker.onmessage = ({ data }) => this.onMessage(entry, data);
    worker.onerror = (e) => console.error('Error en worker', e.message);
    return entry;
  }

  async initGpu() {
    if (!navigator.gpu || !this.workers.length) return false;
    try {
      // Dos workers de GPU: mientras uno prepara un corte en la CPU, el otro usa la GPU
      for (let i = 0; i < 2; i++) {
        const entry = this.spawn('./gpuworker.js');
        const ok = await Promise.race([this.call(entry, { type: 'init' }), new Promise((r) => setTimeout(() => r(false), 8000))]);
        if (!ok) { entry.worker.terminate(); break; }
        for (const [anatomyId, structs] of this.anatomies) await this.call(entry, { type: 'anatomy', anatomyId, structs });
        this.gpus.push(entry);
      }
      return this.gpus.length > 0;
    } catch (err) {
      console.warn('WebGPU no disponible:', err);
      return false;
    }
  }

  call(entry, msg, transfer = []) {
    const id = this.nextId++;
    entry.busy++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, entry });
      entry.worker.postMessage({ ...msg, id }, transfer);
    });
  }

  onMessage(entry, data) {
    const job = this.pending.get(data.id);
    if (!job) return;
    this.pending.delete(data.id);
    entry.busy--;
    if (data.type === 'error') job.reject(new Error(data.message));
    else job.resolve(data.result);
  }

  // Envía la anatomía del paciente a todos los workers (una vez por paciente/posición)
  async setAnatomy(anatomyId, structs) {
    this.anatomies.set(anatomyId, structs);
    const all = [...this.workers, ...this.gpus];
    await Promise.all(all.map((w) => this.call(w, { type: 'anatomy', anatomyId, structs })));
  }

  idle() { return this.workers.reduce((a, b) => (b.busy < a.busy ? b : a)); }

  get engine() { return this.gpus.length && this.useGpu ? `GPU (WebGPU) + ${this.workers.length} hilos de CPU` : this.workers.length ? `CPU (${this.workers.length} hilos)` : 'CPU'; }

  async slice(job) {
    if (this.n0 && !job.n0) job = { ...job, n0: this.n0 }; // perfil del tomógrafo (los workers no leen localStorage)
    if (job.physics === undefined && this.physics) job = { ...this.physics, ...job }; // física avanzada (Ajustes)
    if (!this.workers.length) {
      await new Promise((r) => setTimeout(r, 0));
      return reconstructSlice({ ...job, structs: this.anatomies.get(job.anatomyId) });
    }
    // La física avanzada (espectro, abanico, dispersión) y SART solo existen en la CPU
    const cpuOnly = job.physics === 'advanced' || job.algorithm === 'sart';
    if (this.gpus.length && this.useGpu && !cpuOnly) {
      const g = this.gpus.reduce((a, b) => (b.busy < a.busy ? b : a));
      const c = this.idle();
      // Si la GPU tiene cola y hay un hilo de CPU libre, la CPU también ayuda
      if (g.busy >= 6 && c.busy === 0) return this.call(c, { type: 'slice', job });
      try { return await this.call(g, { type: 'slice', job }); } catch (err) {
        console.warn('Fallo en la GPU; se usa la CPU.', err);
        this.useGpu = false;
      }
    }
    return this.call(this.idle(), { type: 'slice', job });
  }

  async topogram(job) {
    if (!this.workers.length) return topogram({ ...job, structs: this.anatomies.get(job.anatomyId) });
    return this.call(this.idle(), { type: 'topogram', job });
  }
}
