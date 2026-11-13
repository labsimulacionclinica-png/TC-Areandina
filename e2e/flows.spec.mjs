// Recorridos completos en un navegador real: preparan al paciente, adquieren, leen y comprueban el informe.
import { test, expect } from '@playwright/test';

// Atajo para el paso del paciente y la sala (los mismos clics que haría un estudiante)
async function prepare(page, { caseKey, contrast = 'no', arms = 'up', landmark, checks = [], companion = 'fuera' }) {
  await page.goto('/');
  await page.locator(`input[name=case][value="${caseKey}"]`).check();
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  await page.locator('#btnAskId').click();
  await page.locator('#chkId').check();
  await page.locator('#btnLabs').click();
  if (await page.locator('#pregRow').isVisible()) await page.locator('#chkPreg').check();
  await page.locator(`#segContrast [data-v=${contrast}]`).click();
  if (contrast === 'apto') await page.locator('#selCatheter').selectOption('18G');
  for (const cb of await page.locator('#metalList input').all()) await cb.check();
  await page.locator(`#segCompanion [data-v=${companion}]`).click();
  await page.locator('#stepsNav [data-step=sala]').click();
  await page.locator(`#segArms [data-v=${arms}]`).click();
  for (const id of checks) await page.locator(`#${id}`).check();
  await page.locator('#chkLasers').check();
  // Centrar la mesa leyendo el desvío del láser coronal
  const txt = await page.locator('#laserState').textContent();
  const mm = +(txt.match(/(\d+) mm/) || [0, 0])[1] * (txt.includes('DEBAJO') ? -1 : 1);
  await page.locator('#rngHeight').evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input')); }, mm);
  await expect(page.locator('#laserState')).toHaveText(/línea medioaxilar/);
  await page.locator('#selLandmark').selectOption(landmark);
  await page.locator('#btnZero').click();
  await page.locator('#btnIso').click();
}

async function planAndScan(page, { protocol, range, topo }) {
  await page.locator('#stepsNav [data-step=protocolo]').click();
  await page.locator('#selProtocol').selectOption(protocol);
  await page.locator('#btnLoadProtocol').click();
  await page.locator('#stepsNav [data-step=topograma]').click();
  if (topo) { await page.locator('#topoStart').fill(String(topo[0])); await page.locator('#topoLen').fill(String(topo[1])); }
  await page.locator('#btnTopo').click();
  await expect(page.locator('#btnTopo')).toBeEnabled();
  await page.locator('#rangeStart').fill(String(range[0]));
  await page.locator('#rangeEnd').fill(String(range[1]));
  await page.locator('#rangeEnd').dispatchEvent('change');
  await page.locator('#stepsNav [data-step=adquisicion]').click();
  await page.locator('#btnScan').click();
}

async function finish(page, answer) {
  await page.locator('#stepsNav [data-step=finalizar]').click();
  await page.locator(`#qOptions input[value="${answer}"]`).check();
  await page.locator('#chkSend').check();
  await page.locator('#btnFinish').click();
  await expect(page.locator('#reportDlg')).toBeVisible();
  return page.locator('#reportBody').innerText();
}

test('TC de cráneo completo: identifica el hematoma y obtiene ≥ 90 %', async ({ page }) => {
  await prepare(page, { caseKey: 'craneo-hic', arms: 'down', landmark: 'nasion', checks: ['chkHolder', 'chkStrap'] });
  await planAndScan(page, { protocol: 'head', range: [-138, 25] });
  await expect(page.locator('#stepsNav [data-step=visor]')).toHaveClass(/active/, { timeout: 120000 });
  await expect(page.locator('#seriesTabs button')).toHaveCount(1);
  const report = await finish(page, 1);
  const pct = +report.match(/(\d+)\s*%/)[1];
  expect(pct).toBeGreaterThanOrEqual(90);
});

test('Artefacto de escalera: se corrige reconstruyendo desde los datos brutos (100 %)', async ({ page }) => {
  await page.goto('/?case=art-escalera');
  await expect(page.locator('#alertDlg')).toBeVisible({ timeout: 120000 });
  await page.locator('#alertBtns button').first().click();
  await page.locator('#rcKernel').selectOption('lung');
  await page.locator('#rcThk').selectOption('1.25');
  await page.locator('#btnRecon').click();
  await expect(page.locator('#rcMsg')).toHaveText(/sin dosis adicional/, { timeout: 120000 });
  await page.locator('#stepsNav [data-step=finalizar]').click();
  await page.locator('#qOptions input').nth(4).check();
  await page.locator('#btnFinish').click();
  await expect(page.locator('#reportBody')).toContainText('100');
});

test('Interfaz en inglés y portugués', async ({ page }) => {
  await page.goto('/?lang=en');
  await expect(page.locator('#startDlg')).toContainText('Guided practice (with hints)');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('#stepsNav')).toContainText('Room & positioning');
  await page.locator('#langSel').selectOption('pt');
  await expect(page.locator('#stepsNav')).toContainText('Sala e posicionamento');
  await page.locator('#langSel').selectOption('es');
  await expect(page.locator('#stepsNav')).toContainText('Sala y posición');
});

test('Editor de casos: crear, guardar y abrir en el simulador', async ({ page }) => {
  await page.goto('/editor.html');
  await page.locator('#title').fill('Caso E2E');
  await page.locator('#order').fill('TC de abdomen de prueba');
  await page.locator('#pName').fill('Paciente Prueba');
  await page.locator('#qOpts input').nth(0).fill('Normal');
  await page.locator('#qOpts input').nth(1).fill('Lesión hepática');
  await page.locator('#qCorrect').selectOption('1');
  await page.locator('#btnSave').click();
  await expect(page.locator('#saveMsg')).toContainText('Guardado');
  await page.locator('#btnTry').click();
  await expect(page.locator('#patientStrip')).toContainText('Paciente Prueba');
});

test('Tableta vertical: sin desplazamiento horizontal', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  for (const s of ['paciente', 'sala', 'visor', 'finalizar']) {
    await page.locator(`#stepsNav [data-step=${s}]`).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, `paso ${s}`).toBeLessThanOrEqual(1);
  }
  await ctx.close();
});

test('Sin errores en la consola al recorrer los pasos', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  for (const s of ['sala', 'topograma', 'protocolo', 'contraste', 'adquisicion', 'visor', 'finalizar', 'paciente']) await page.locator(`#stepsNav [data-step=${s}]`).click();
  await page.goto('/teacher.html');
  await page.goto('/editor.html');
  expect(errors).toEqual([]);
});
