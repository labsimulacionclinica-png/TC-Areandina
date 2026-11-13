// Identidad institucional y documentos imprimibles (informe, certificado, resumen de turno).
export const BRAND = {
  institution: 'Fundación Universitaria del Área Andina',
  short: 'Areandina',
  city: 'Bogotá',
  faculty: 'Facultad de Ciencias de la Salud y del Deporte',
  lab: 'Laboratorios de Salud y Deporte Bogotá',
  credit: 'Desarrollado por los Laboratorios de Salud y Deporte Bogotá de la Facultad de Ciencias de la Salud y del Deporte',
  logo: 'img/areandina.png',
  product: 'OpenTC Sim · Simulador educativo de tomografía computarizada',
  colors: { green: '#8bb443', greenDark: '#4f8a1d', magenta: '#da1274', orange: '#f29a12', gray: '#535353' },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Hoja de estilos de impresión (A4, fondo blanco, colores del logo)
const PRINT_CSS = `
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #222; font-size: 10.5pt; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .doc-head { display: flex; gap: 14px; align-items: center; padding-bottom: 8px; border-bottom: 4px solid transparent;
    border-image: linear-gradient(90deg, ${BRAND.colors.orange} 0 33%, ${BRAND.colors.green} 33% 66%, ${BRAND.colors.magenta} 66% 100%) 1; }
  .doc-head img { width: 64px; height: 64px; object-fit: contain; }
  .doc-head .inst { flex: 1; line-height: 1.3; }
  .doc-head .inst b { font-size: 12pt; color: ${BRAND.colors.gray}; }
  .doc-head .inst span { display: block; color: #555; font-size: 9pt; }
  .doc-head .title { text-align: right; font-size: 9pt; color: #555; }
  .doc-head .title b { display: block; font-size: 13pt; color: ${BRAND.colors.greenDark}; }
  h2 { font-size: 12pt; color: ${BRAND.colors.greenDark}; margin: 14px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { background: #f3f6ee; color: #333; }
  .id-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 14px; margin-top: 10px; font-size: 9.5pt; }
  .id-grid div span { display: block; color: #777; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; }
  .verdict { display: flex; gap: 14px; align-items: center; margin-top: 10px; padding: 8px 12px; border-radius: 8px; background: #f6f8f3; border: 1px solid #e0e6d6; }
  .verdict .num { font-size: 26pt; font-weight: 700; }
  .ok { color: #2e7d32; } .warn { color: #b26a00; } .err { color: #c62828; }
  .bar { height: 7px; background: #eee; border-radius: 4px; overflow: hidden; min-width: 80px; }
  .bar i { display: block; height: 100%; }
  .bar i.ok { background: ${BRAND.colors.green}; } .bar i.warn { background: ${BRAND.colors.orange}; } .bar i.err { background: ${BRAND.colors.magenta}; }
  .lists { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .lists ul { margin: 4px 0 0; padding-left: 16px; }
  .box { border: 1px solid #e3e3e3; border-radius: 6px; padding: 6px 10px; }
  .box.good { border-left: 4px solid ${BRAND.colors.green}; } .box.improve { border-left: 4px solid ${BRAND.colors.orange}; }
  .learn { border-left: 4px solid ${BRAND.colors.magenta}; background: #fdf3f8; padding: 6px 10px; margin-top: 8px; font-size: 9.5pt; line-height: 1.45; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 34px; font-size: 9pt; text-align: center; }
  .sign div { border-top: 1px solid #555; padding-top: 4px; }
  .doc-foot { margin-top: 18px; padding-top: 6px; border-top: 1px solid #ddd; font-size: 8pt; color: #666; display: flex; justify-content: space-between; gap: 10px; }
  .cert { border: 2px solid ${BRAND.colors.green}; border-radius: 8px; padding: 12px 16px; }
  .cert-code { width: 100%; font-family: monospace; font-size: 7.5pt; border: 1px solid #ccc; }
  .metrics { display: flex; gap: 10px; flex-wrap: wrap; } .metrics div { border: 1px solid #ddd; border-radius: 6px; padding: 4px 8px; }
  .metrics span { display: block; font-size: 8pt; color: #777; }
  .no-print, button { display: none !important; }
  a { color: inherit; text-decoration: none; }
`;

export function docHeader(title, subtitle = '') {
  return `<header class="doc-head"><img src="${BRAND.logo}" alt="${BRAND.short}">
    <div class="inst"><b>${BRAND.institution}</b><span>${BRAND.faculty}</span><span>${BRAND.lab} · ${BRAND.city}</span></div>
    <div class="title"><b>${esc(title)}</b>${esc(subtitle)}</div></header>`;
}

export function docFooter() {
  return `<footer class="doc-foot"><span>${BRAND.credit}.</span><span>${BRAND.product}. Simulación educativa con pacientes ficticios: no es un documento clínico. Impreso el ${new Date().toLocaleString('es')}.</span></footer>`;
}

// Imprime un documento HTML en un marco oculto (no depende de los estilos ni del estado de la aplicación)
export function printDocument(title, bodyHtml) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  const base = document.baseURI;
  frame.srcdoc = `<!doctype html><html lang="es"><head><meta charset="utf-8"><base href="${esc(base)}"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`;
  frame.onload = async () => {
    const doc = frame.contentDocument;
    await Promise.all([...doc.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60000);
  };
  document.body.append(frame);
}
