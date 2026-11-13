import test from 'node:test';
import assert from 'node:assert/strict';
import { dicomSlice, zip, uid } from '../js/dicom.js';

// Lector mínimo de DICOM explícito little endian para comprobar lo que escribimos
function parse(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(new TextDecoder().decode(bytes.slice(128, 132)), 'DICM');
  const tags = new Map();
  let o = 132;
  while (o < bytes.length) {
    const g = dv.getUint16(o, true), e = dv.getUint16(o + 2, true);
    const vr = new TextDecoder().decode(bytes.slice(o + 4, o + 6));
    let len, start;
    if (['OB', 'OW', 'SQ', 'UN', 'UT'].includes(vr)) { len = dv.getUint32(o + 8, true); start = o + 12; } else { len = dv.getUint16(o + 6, true); start = o + 8; }
    tags.set(`${g.toString(16).padStart(4, '0')},${e.toString(16).padStart(4, '0')}`, { vr, data: bytes.slice(start, start + len) });
    o = start + len;
  }
  return tags;
}
const str = (t) => new TextDecoder().decode(t.data).replace(/[\0 ]+$/, '');

test('DICOM: cabecera, UID, geometría LPS y píxeles en HU', () => {
  const img = new Int16Array(256 * 256);
  img[0] = -1000; img[256 * 256 - 1] = 1234;
  const meta = { patientName: 'Perez^Juan', patientId: 'CC123', birth: '1970-01-02', sex: 'M', studyUid: uid(), seriesUid: uid(), frameUid: uid(), seriesNumber: 2, seriesDesc: 'Prueba', date: new Date('2026-11-05T10:00:00Z'), kv: 120, mas: 200, kernel: 'Estandar', thickness: 5, dfov: 380, ww: 400, wl: 40 };
  const tags = parse(dicomSlice(img, 620, 3, meta));
  assert.equal(str(tags.get('0002,0010')), '1.2.840.10008.1.2.1');
  assert.equal(str(tags.get('0008,0016')), '1.2.840.10008.5.1.4.1.1.2');
  assert.equal(str(tags.get('0008,0060')), 'CT');
  assert.equal(str(tags.get('0010,0010')), 'SIMULADO^Perez^Juan');
  assert.equal(str(tags.get('0020,0013')), '4');
  assert.equal(str(tags.get('0020,1041')), '-620');
  const pos = str(tags.get('0020,0032')).split('\\').map(Number);
  assert.ok(Math.abs(pos[0] + 189.258) < 0.01 && Math.abs(pos[2] + 620) < 1e-9);
  const px = tags.get('7fe0,0010').data;
  const v = new Int16Array(px.buffer.slice(px.byteOffset, px.byteOffset + px.byteLength));
  assert.equal(v.length, 65536);
  assert.equal(v[0], -1000);
  assert.equal(v[65535], 1234);
  for (const t of ['0008,0018', '0020,000d', '0020,000e']) assert.match(str(tags.get(t)), /^2\.25\.\d+$/);
  // Los valores deben tener longitud par
  for (const [, t] of tags) assert.equal(t.data.length % 2, 0);
});

test('ZIP sin compresión con la firma y el directorio central', async () => {
  const blob = zip([{ name: 'a.dcm', data: new Uint8Array([1, 2, 3, 4]) }, { name: 'b/c.dcm', data: new Uint8Array(10) }]);
  const b = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(b.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint32(b.length - 22, true), 0x06054b50);
  assert.equal(dv.getUint16(b.length - 12, true), 2);
});
