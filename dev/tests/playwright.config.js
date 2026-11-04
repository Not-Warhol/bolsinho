// Bolsinho — testes automáticos com o motor do Safari (WebKit).
// Correr:  cd tests && npx playwright test
const { defineConfig, devices } = require('@playwright/test');
const fs = require('fs'); const path = require('path');
// na pasta de trabalho o site está em ../pwa; no repositório os testes estão em dev/tests e o site na raiz
const ROOT = fs.existsSync(path.join(__dirname, '..', 'pwa', 'index.html')) ? '..' : '../..';

const PORT = 8790;
const se = devices['iPhone SE'];

module.exports = defineConfig({
  testDir: './specs',
  timeout: 60_000,
  fullyParallel: true,
  workers: 4,
  reporter: [['list'], ['json', { outputFile: 'results/results.json' }]],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    serviceWorkers: 'block',
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
  },
  webServer: {
    command: `python3 -m http.server ${PORT} --directory ${ROOT}`,
    port: PORT,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'iphone-se', use: { ...se, browserName: 'webkit' } },
    { name: 'iphone-15', use: { ...devices['iPhone 15'], browserName: 'webkit' } },
    { name: 'iphone-15-pro-max', use: { ...devices['iPhone 15 Pro Max'], browserName: 'webkit' } },
    // "Texto grande": o Safari aumenta o texto (aA → 130%) ≈ ecrã do SE com 30% menos largura útil.
    { name: 'texto-grande', use: { ...se, browserName: 'webkit', viewport: { width: 288, height: 513 }, deviceScaleFactor: 2.6 } },
  ],
});
