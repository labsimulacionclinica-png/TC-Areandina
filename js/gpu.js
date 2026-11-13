// Reconstrucción acelerada con WebGPU: proyección, filtrado y retroproyección en la GPU.
// La rasterización, el ruido y la reconstrucción iterativa siguen en la CPU (son baratos).
import { MU_WATER } from './phantom.js';
import { SCANNER, spatialFilter } from './ct.js';

const PROJECT = /* wgsl */ `
struct P { n: u32, nDet: u32, K: u32, layer: u32, E: f32, d: f32, px: f32, pad: f32 };
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> soft: array<f32>;
@group(0) @binding(2) var<storage, read> hard: array<f32>;
@group(0) @binding(3) var<storage, read> motion: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> outS: array<f32>;
@group(0) @binding(5) var<storage, read_write> outH: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let b = id.x; let v = id.y;
  if (b >= p.nDet || v >= p.K) { return; }
  let th = f32(v) * 3.14159265358979 / f32(p.K);
  let c = cos(th); let s = sin(th);
  let t = (f32(b) - f32(p.nDet - 1u) * 0.5) * p.d;
  let R = p.E * 0.5;
  let m = motion[v];
  var mx = m.x; var my = m.y;
  if (p.layer == 1u) { mx = mx + m.z; my = my + m.w; }
  var gx = (t * c + R * s - mx + R - p.px * 0.5) / p.px;
  var gy = (t * s - R * c - my + R - p.px * 0.5) / p.px;
  let n = p.n; let lim = f32(n - 1u);
  var sS = 0.0; var sH = 0.0;
  for (var k = 0u; k < n; k = k + 1u) {
    if (gx >= 0.0 && gy >= 0.0 && gx < lim && gy < lim) {
      let ix = u32(gx); let iy = u32(gy);
      let fx = gx - f32(ix); let fy = gy - f32(iy);
      let q = iy * n + ix;
      let w00 = (1.0 - fx) * (1.0 - fy); let w10 = fx * (1.0 - fy); let w01 = (1.0 - fx) * fy; let w11 = fx * fy;
      sS = sS + soft[q] * w00 + soft[q + 1u] * w10 + soft[q + n] * w01 + soft[q + n + 1u] * w11;
      sH = sH + hard[q] * w00 + hard[q + 1u] * w10 + hard[q + n] * w01 + hard[q + n + 1u] * w11;
    }
    gx = gx - s; gy = gy + c;
  }
  let o = v * p.nDet + b;
  if (p.layer == 1u) { outS[o] = outS[o] + sS * p.px; outH[o] = outH[o] + sH * p.px; }
  else { outS[o] = sS * p.px; outH[o] = sH * p.px; }
}`;

// Variante con muestreo bilineal por hardware (texturas rg32float filtrables: x = blando, y = duro)
const PROJECT_TEX = /* wgsl */ `
struct P { n: u32, nDet: u32, K: u32, layer: u32, E: f32, d: f32, px: f32, pad: f32 };
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;
@group(0) @binding(3) var<storage, read> motion: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> outS: array<f32>;
@group(0) @binding(5) var<storage, read_write> outH: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let b = id.x; let v = id.y;
  if (b >= p.nDet || v >= p.K) { return; }
  let th = f32(v) * 3.14159265358979 / f32(p.K);
  let c = cos(th); let s = sin(th);
  let t = (f32(b) - f32(p.nDet - 1u) * 0.5) * p.d;
  let R = p.E * 0.5;
  let m = motion[v];
  var mx = m.x; var my = m.y;
  if (p.layer == 1u) { mx = mx + m.z; my = my + m.w; }
  let inv = 1.0 / f32(p.n);
  // coordenadas de textura normalizadas: (g + 0.5) / n
  var u = ((t * c + R * s - mx + R - p.px * 0.5) / p.px + 0.5) * inv;
  var w = ((t * s - R * c - my + R - p.px * 0.5) / p.px + 0.5) * inv;
  let du = -s * inv; let dw = c * inv;
  var acc = vec2<f32>(0.0, 0.0);
  for (var k = 0u; k < p.n; k = k + 1u) {
    acc = acc + textureSampleLevel(tex, smp, vec2<f32>(u, w), 0.0).xy;
    u = u + du; w = w + dw;
  }
  let o = v * p.nDet + b;
  if (p.layer == 1u) { outS[o] = outS[o] + acc.x * p.px; outH[o] = outH[o] + acc.y * p.px; }
  else { outS[o] = acc.x * p.px; outH[o] = acc.y * p.px; }
}`;

// Filtro: la fila del sinograma y el núcleo se cargan en memoria compartida del grupo
const FILTER = /* wgsl */ `
struct F { nDet: u32, K: u32, a: u32, b: u32, d: f32, x: f32, y: f32, z: f32 };
@group(0) @binding(0) var<uniform> f: F;
@group(0) @binding(1) var<storage, read> sino: array<f32>;
@group(0) @binding(2) var<storage, read> h: array<f32>;
@group(0) @binding(3) var<storage, read_write> q: array<f32>;
var<workgroup> row: array<f32, 512>;
var<workgroup> hk: array<f32, 1024>;
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3<u32>, @builtin(workgroup_id) wid: vec3<u32>) {
  let v = wid.y; let n = f.nDet;
  for (var i = lid.x; i < n; i = i + 256u) { row[i] = sino[v * n + i]; }
  for (var i = lid.x; i < 2u * n - 1u; i = i + 256u) { hk[i] = h[i]; }
  workgroupBarrier();
  for (var b = lid.x; b < n; b = b + 256u) {
    var acc = 0.0;
    for (var k = 0u; k < n; k = k + 1u) { acc = acc + row[k] * hk[b + n - 1u - k]; }
    q[v * n + b] = acc * f.d;
  }
}`;

const BACKPROJECT = /* wgsl */ `
struct B { NR: u32, nDet: u32, K: u32, a: u32, rpx: f32, d: f32, mw: f32, z: f32 };
@group(0) @binding(0) var<uniform> u: B;
@group(0) @binding(1) var<storage, read> q: array<f32>;
@group(0) @binding(2) var<storage, read_write> img: array<f32>;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let j = id.x; let i = id.y;
  if (i >= u.NR || j >= u.NR) { return; }
  let x = (f32(j) - f32(u.NR - 1u) * 0.5) * u.rpx;
  let y = (f32(u.NR - 1u) * 0.5 - f32(i)) * u.rpx;
  let half = f32(u.nDet - 1u) * 0.5;
  let lim = f32(u.nDet - 1u);
  var acc = 0.0;
  for (var v = 0u; v < u.K; v = v + 1u) {
    let th = f32(v) * 3.14159265358979 / f32(u.K);
    let tb = (x * cos(th) + y * sin(th)) / u.d + half;
    if (tb >= 0.0 && tb < lim) {
      let b0 = u32(tb); let fr = tb - f32(b0);
      acc = acc + q[v * u.nDet + b0] * (1.0 - fr) + q[v * u.nDet + b0 + 1u] * fr;
    }
  }
  img[i * u.NR + j] = 1000.0 * ((acc * 3.14159265358979 / f32(u.K)) / u.mw - 1.0);
}`;

export class GpuRecon {
  static async create() {
    if (!globalThis.navigator?.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return null;
    const tex = adapter.features.has('float32-filterable');
    const device = await adapter.requestDevice({ requiredFeatures: tex ? ['float32-filterable'] : [] });
    return new GpuRecon(device, tex);
  }

  constructor(device, tex = false) {
    this.device = device;
    this.tex = tex;
    const mk = (code) => device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code }), entryPoint: 'main' } });
    this.pProject = mk(tex ? PROJECT_TEX : PROJECT);
    if (tex) this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.textures = new Map();
    this.pFilter = mk(FILTER);
    this.pBack = mk(BACKPROJECT);
    this.bufs = new Map();
  }

  buf(name, size, usage) {
    let b = this.bufs.get(name);
    if (!b || b.size < size) {
      b?.destroy();
      b = this.device.createBuffer({ size: Math.max(16, Math.ceil(size / 16) * 16), usage });
      this.bufs.set(name, b);
    }
    return b;
  }

  upload(name, data) {
    const b = this.buf(name, data.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    this.device.queue.writeBuffer(b, 0, data);
    return b;
  }

  uniform(name, u32s, f32s) {
    const ab = new ArrayBuffer(32), dv = new DataView(ab);
    u32s.forEach((v, i) => dv.setUint32(i * 4, v, true));
    f32s.forEach((v, i) => dv.setFloat32(16 + i * 4, v, true));
    const b = this.buf(name, 32, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.device.queue.writeBuffer(b, 0, ab);
    return b;
  }

  group(pipeline, buffers) {
    return this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })) });
  }

  async read(src, bytes, name) {
    const st = this.buf(name, bytes, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(src, 0, st, 0, bytes);
    this.device.queue.submit([enc.finish()]);
    await st.mapAsync(GPUMapMode.READ, 0, bytes);
    const out = new Float32Array(st.getMappedRange(0, bytes).slice(0));
    st.unmap();
    return out;
  }

  dispatch(pipeline, group, x, y) {
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(x, y);
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  async project(ctx, slot = 0) {
    const { K, nDet, n, E, d, px, soft, hard, moving, motion } = ctx;
    const out = K * nDet * 4, OUT = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC;
    const oS = this.buf('ps' + slot, out, OUT), oH = this.buf('ph' + slot, out, OUT);
    const mot = this.upload('motion' + slot, motion);
    const layers = [[soft, hard]];
    if (moving) layers.push([moving.soft, moving.hard]);
    layers.forEach(([s, h], layer) => {
      const u = this.uniform(`up${layer}_${slot}`, [n, nDet, K, layer], [E, d, px, 0]);
      if (this.tex) {
        const key = `tex${layer}_${slot}`;
        let t = this.textures.get(key);
        if (!t || t.width !== n) {
          t?.destroy();
          t = this.device.createTexture({ size: [n, n], format: 'rg32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
          this.textures.set(key, t);
        }
        const rg = new Float32Array(2 * n * n);
        for (let i = 0; i < n * n; i++) { rg[2 * i] = s[i]; rg[2 * i + 1] = h[i]; }
        this.device.queue.writeTexture({ texture: t }, rg, { bytesPerRow: n * 8 }, [n, n]);
        const g = this.device.createBindGroup({
          layout: this.pProject.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: u } }, { binding: 1, resource: t.createView() }, { binding: 2, resource: this.sampler },
            { binding: 3, resource: { buffer: mot } }, { binding: 4, resource: { buffer: oS } }, { binding: 5, resource: { buffer: oH } }],
        });
        this.dispatch(this.pProject, g, Math.ceil(nDet / 64), K);
      } else {
        const bS = this.upload(`soft${layer}_${slot}`, s), bH = this.upload(`hard${layer}_${slot}`, h);
        this.dispatch(this.pProject, this.group(this.pProject, [u, bS, bH, mot, oS, oH]), Math.ceil(nDet / 64), K);
      }
    });
    const ps = await this.read(oS, out, 'rps' + slot);
    const ph = await this.read(oH, out, 'rph' + slot);
    return { ps, ph };
  }

  async filterBackproject(ctx, sino, slot = 0) {
    const { job, K, nDet, d } = ctx;
    const NR = SCANNER.recon;
    const s = this.upload('sino' + slot, sino);
    const h = this.upload('h' + slot, spatialFilter(job.kernel, d, nDet));
    const q = this.buf('q' + slot, K * nDet * 4, GPUBufferUsage.STORAGE);
    this.dispatch(this.pFilter, this.group(this.pFilter, [this.uniform('uf' + slot, [nDet, K, 0, 0], [d, 0, 0, 0]), s, h, q]), 1, K);
    const img = this.buf('img' + slot, NR * NR * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    this.dispatch(this.pBack, this.group(this.pBack, [this.uniform('ub' + slot, [NR, nDet, K, 0], [job.dfov / NR, d, MU_WATER[job.kv], 0]), q, img]), Math.ceil(NR / 16), Math.ceil(NR / 16));
    return this.read(img, NR * NR * 4, 'rimg' + slot);
  }
}
