import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  reporter: "list",
  webServer: [
    { command: 'node testing/browser-server.js --demo', cwd: '../backend', url: 'http://localhost:5003/api/health', timeout: 30000 },
    { command: 'npm.cmd run dev -- --host 127.0.0.1 --port 5175', url: 'http://localhost:5175', env: { VITE_DEMO_MODE: 'true', VITE_API_URL: 'http://localhost:5003', VITE_SOCKET_URL: 'http://localhost:5003' }, timeout: 30000 },
  ],
  use: {
    baseURL: "http://localhost:5175",
    headless: true,
    launchOptions: {
      executablePath:
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    },
  },
});
