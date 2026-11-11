import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './live-tests', workers: 1, timeout: 60000, reporter: 'list',
  use: { baseURL: 'http://localhost:5174', headless: true, launchOptions: { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } },
  webServer: [
    { command: 'node testing/browser-server.js --live', cwd: '../backend', url: 'http://localhost:5002/api/health', timeout: 900000 },
    { command: 'npm.cmd run dev -- --host 127.0.0.1 --port 5174', url: 'http://localhost:5174', env: { VITE_DEMO_MODE: 'false', VITE_API_URL: 'http://localhost:5002', VITE_SOCKET_URL: 'http://localhost:5002' }, timeout: 30000 },
  ],
});
