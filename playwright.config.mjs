// Pruebas de extremo a extremo (navegador real).
//   npm run test:e2e            → usa el Chrome instalado en el equipo (sin descargar navegadores)
//   E2E_CHANNEL=msedge npm run test:e2e   → con Microsoft Edge
// En la integración continua se usa el Chromium de Playwright (E2E_CHANNEL=chromium).
import { defineConfig } from '@playwright/test';

const channel = process.env.E2E_CHANNEL || 'chrome';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5181',
    ...(channel === 'chromium' ? {} : { channel }),
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--enable-unsafe-webgpu'] },
  },
  webServer: { command: 'node server.mjs 5181', url: 'http://localhost:5181/api/health', reuseExistingServer: true, timeout: 20000 },
});
