// Genera un paquete SCORM 1.2 (ZIP) para subirlo a Moodle u otra plataforma.
//   node scripts/build-scorm.mjs                                  → simulador completo (el estudiante elige el caso)
//   node scripts/build-scorm.mjs --case angio-tep --mode evaluacion → un caso concreto, con nota
// El ZIP queda en dist/. En Moodle: Añadir actividad → Paquete SCORM → subir el ZIP.
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => s.trim().split(/\s+/)).map(([k, v]) => [k, v ?? true]));
const caseKey = args.case || null, mode = args.mode === 'evaluacion' ? 'evaluacion' : 'practica';
const EXCLUDE = new Set(['node_modules', 'dist', 'data', 'tests', 'scripts', '.git', '.github', '.claude']);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (EXCLUDE.has(e.name) || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const xml = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

function manifest(files, launch, title) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="opentc-sim-${caseKey || 'completo'}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org">
    <organization identifier="org">
      <title>${xml(title)}</title>
      <item identifier="item1" identifierref="res1"><title>${xml(title)}</title><adlcp:masteryscore>60</adlcp:masteryscore></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res1" type="webcontent" adlcp:scormtype="sco" href="${xml(launch)}">
${files.map((f) => `      <file href="${xml(f)}"/>`).join('\n')}
    </resource>
  </resources>
</manifest>
`;
}

// ZIP sin compresión
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function zip(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const n = Buffer.from(name, 'utf8'), crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    parts.push(h, n, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

// --site: ZIP del sitio estático (para GitHub Pages, Netlify Drop, un servidor web o una memoria USB)
if (args.site) {
  const all = (await walk(root)).map((p) => relative(root, p).split(sep).join('/')).filter((f) => !/\.log$/.test(f));
  const entries = [];
  for (const f of all) entries.push({ name: f, data: await readFile(join(root, f)) });
  await mkdir(join(root, 'dist'), { recursive: true });
  const out = join(root, 'dist', 'opentc-sitio.zip');
  await writeFile(out, zip(entries));
  console.log(`Sitio estático: ${relative(root, out)} (${all.length} archivos)`);
  process.exit(0);
}

const files = (await walk(root)).map((p) => relative(root, p).split(sep).join('/')).filter((f) => !/\.(md|log)$/.test(f) && f !== 'server.mjs' && f !== 'package.json');
const launch = caseKey ? `index.html?case=${caseKey}&mode=${mode}` : 'index.html';
const title = caseKey ? `OpenTC Sim — ${caseKey} (${mode})` : 'OpenTC Sim — simulador de TC';
const entries = [{ name: 'imsmanifest.xml', data: Buffer.from(manifest(files, launch, title)) }];
for (const f of files) entries.push({ name: f, data: await readFile(join(root, f)) });
await mkdir(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', `opentc-scorm${caseKey ? `-${caseKey}-${mode}` : ''}.zip`);
await writeFile(out, zip(entries));
console.log(`Paquete SCORM 1.2: ${relative(root, out)} (${files.length} archivos, ${((await stat(out)).size / 1e6).toFixed(1)} MB)`);
