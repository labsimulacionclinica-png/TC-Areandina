// Exportación DICOM (CT Image Storage, Explicit VR Little Endian) empaquetada en un ZIP sin compresión.
// Las imágenes son simuladas: el nombre del paciente lleva el prefijo «SIMULADO».

const enc = new TextEncoder();

export function uid() {
  // UID derivado de un UUID (raíz 2.25, ISO/IEC 9834-8)
  const b = crypto.getRandomValues(new Uint8Array(16));
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  return `2.25.${n}`;
}

class Writer {
  constructor() { this.parts = []; this.len = 0; }
  push(u8) { this.parts.push(u8); this.len += u8.length; }
  u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); this.push(b); }
  u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); this.push(b); }
  // Elemento con VR explícito
  el(group, elem, vr, value) {
    let data;
    if (value instanceof Uint8Array) data = value;
    else if (vr === 'US') { data = new Uint8Array(2); new DataView(data.buffer).setUint16(0, value, true); }
    else if (vr === 'UL') { data = new Uint8Array(4); new DataView(data.buffer).setUint32(0, value, true); }
    else {
      let s = String(value);
      data = enc.encode(s);
      if (data.length % 2) data = enc.encode(s + (vr === 'UI' ? '\0' : ' '));
    }
    this.u16(group); this.u16(elem); this.push(enc.encode(vr));
    if (['OB', 'OW', 'SQ', 'UN', 'UT'].includes(vr)) { this.u16(0); this.u32(data.length); }
    else this.u16(data.length);
    this.push(data);
  }
  bytes() {
    const out = new Uint8Array(this.len);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

const ds = (v) => (Math.round(v * 1000) / 1000).toString();
const da = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const tm = (d) => d.toISOString().slice(11, 19).replace(/:/g, '');

// meta: { patientName, patientId, birth, sex, studyUid, seriesUid, seriesNumber, seriesDesc, frameUid, date, kv, mas, kernel, thickness, dfov, ww, wl }
export function dicomSlice(img, z, index, meta) {
  const N = 256, rpx = meta.dfov / N;
  const sop = uid();
  const body = new Writer();
  const date = meta.date;
  body.el(0x0008, 0x0008, 'CS', 'ORIGINAL\\PRIMARY\\AXIAL');
  body.el(0x0008, 0x0016, 'UI', '1.2.840.10008.5.1.4.1.1.2');
  body.el(0x0008, 0x0018, 'UI', sop);
  body.el(0x0008, 0x0020, 'DA', da(date));
  body.el(0x0008, 0x0030, 'TM', tm(date));
  body.el(0x0008, 0x0060, 'CS', 'CT');
  body.el(0x0008, 0x0070, 'LO', 'OpenTC Sim (simulado)');
  body.el(0x0008, 0x103e, 'LO', meta.seriesDesc.slice(0, 64));
  body.el(0x0010, 0x0010, 'PN', `SIMULADO^${meta.patientName}`.slice(0, 64));
  body.el(0x0010, 0x0020, 'LO', meta.patientId);
  body.el(0x0010, 0x0030, 'DA', meta.birth.replace(/-/g, ''));
  body.el(0x0010, 0x0040, 'CS', meta.sex);
  body.el(0x0018, 0x0050, 'DS', ds(meta.thickness));
  body.el(0x0018, 0x0060, 'DS', ds(meta.kv));
  body.el(0x0018, 0x1152, 'IS', String(Math.round(meta.mas)));
  body.el(0x0018, 0x1210, 'SH', meta.kernel.slice(0, 16));
  body.el(0x0018, 0x5100, 'CS', 'HFS');
  body.el(0x0020, 0x000d, 'UI', meta.studyUid);
  body.el(0x0020, 0x000e, 'UI', meta.seriesUid);
  body.el(0x0020, 0x0011, 'IS', String(meta.seriesNumber));
  body.el(0x0020, 0x0013, 'IS', String(index + 1));
  // Sistema LPS: x hacia la izquierda del paciente, y hacia posterior, z hacia craneal
  body.el(0x0020, 0x0032, 'DS', [-(N - 1) / 2 * rpx, -(N - 1) / 2 * rpx, -z].map(ds).join('\\'));
  body.el(0x0020, 0x0037, 'DS', '1\\0\\0\\0\\1\\0');
  body.el(0x0020, 0x0052, 'UI', meta.frameUid);
  body.el(0x0020, 0x1041, 'DS', ds(-z));
  body.el(0x0028, 0x0002, 'US', 1);
  body.el(0x0028, 0x0004, 'CS', 'MONOCHROME2');
  body.el(0x0028, 0x0010, 'US', N);
  body.el(0x0028, 0x0011, 'US', N);
  body.el(0x0028, 0x0030, 'DS', `${ds(rpx)}\\${ds(rpx)}`);
  body.el(0x0028, 0x0100, 'US', 16);
  body.el(0x0028, 0x0101, 'US', 16);
  body.el(0x0028, 0x0102, 'US', 15);
  body.el(0x0028, 0x0103, 'US', 1);
  body.el(0x0028, 0x1050, 'DS', ds(meta.wl));
  body.el(0x0028, 0x1051, 'DS', ds(meta.ww));
  body.el(0x0028, 0x1052, 'DS', '0');
  body.el(0x0028, 0x1053, 'DS', '1');
  body.el(0x0028, 0x1054, 'LO', 'HU');
  body.el(0x7fe0, 0x0010, 'OW', new Uint8Array(img.buffer.slice(img.byteOffset, img.byteOffset + img.byteLength)));

  const metaW = new Writer();
  metaW.el(0x0002, 0x0001, 'OB', new Uint8Array([0, 1]));
  metaW.el(0x0002, 0x0002, 'UI', '1.2.840.10008.5.1.4.1.1.2');
  metaW.el(0x0002, 0x0003, 'UI', sop);
  metaW.el(0x0002, 0x0010, 'UI', '1.2.840.10008.1.2.1');
  metaW.el(0x0002, 0x0012, 'UI', '2.25.302291742934190436318461893524154716011');
  metaW.el(0x0002, 0x0013, 'SH', 'OPENTC_SIM_1');
  const metaBytes = metaW.bytes();
  const head = new Writer();
  head.push(new Uint8Array(128));
  head.push(enc.encode('DICM'));
  head.el(0x0002, 0x0000, 'UL', metaBytes.length);
  head.push(metaBytes);
  head.push(body.bytes());
  return head.bytes();
}

// ZIP "store" (sin compresión)
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }

export function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
    c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + size;
  }
  const cSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

// Cuerpo multipart/related para DICOMweb STOW-RS (PS3.18 §10.5): una parte application/dicom por objeto
export function multipartRelated(objects, boundary = `opentc-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`) {
  const enc = new TextEncoder();
  const chunks = [];
  for (const o of objects) chunks.push(enc.encode(`--${boundary}\r\nContent-Type: application/dicom\r\nContent-Length: ${o.length}\r\n\r\n`), o, enc.encode('\r\n'));
  chunks.push(enc.encode(`--${boundary}--\r\n`));
  const body = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let p = 0;
  for (const c of chunks) { body.set(c, p); p += c.length; }
  return { body, contentType: `multipart/related; type="application/dicom"; boundary=${boundary}` };
}