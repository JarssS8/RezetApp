import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'pnpm dev',
          url: 'http://localhost:3000',
          reuseExistingServer: true,
          timeout: 120_000,
          // Los e2e registran usuarios nuevos en la base de desarrollo, que ya
          // tiene gente de ejecuciones anteriores: sin esto el registro estaría
          // cerrado (regla W1-R18) y los specs de passkeys no podrían empezar.
          env: { ...process.env, ALLOW_OPEN_REGISTRATION: 'true' } as Record<string, string>,
        },
      }),
})
