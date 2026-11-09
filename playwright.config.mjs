// Renderer screenshot checks: every item type at three screen sizes.
// Run: npm run build:app && npx playwright test
// New baselines (after an intended change, reviewed by eye first): npx playwright test --update-snapshots
import { defineConfig } from "@playwright/test";

const PORT = 8795;

export default defineConfig({
  testDir: "test/ui",
  outputDir: "test/ui/results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "test/ui/report" }]] : "list",
  expect: {
    toHaveScreenshot: {
      // Allow for anti-aliasing differences between Chromium builds, not layout changes.
      maxDiffPixelRatio: 0.002,
      threshold: 0.3,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    reducedMotion: "reduce",
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "America/New_York",
  },
  webServer: {
    command: `node scripts/serve-dist.mjs ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: "iphone-15", use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } },
    { name: "iphone-se", use: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 1 } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  ],
});
