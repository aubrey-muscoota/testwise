// Every item type renderer, at three screen sizes, against the baselines in
// test/ui/__screenshots__. The fixtures are app/src/lab/items.json; the page is
// the renderer check page (?lab=renderers), which draws each one with the
// lesson's own components.
//
//   npm run build:app && npx playwright test            compare
//   npx playwright test --update-snapshots              accept a reviewed change
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fixtures = JSON.parse(readFileSync(new URL("../../app/src/lab/items.json", import.meta.url), "utf8"));

// Socrates' ambient motion draws random numbers; a fixed sequence keeps frames identical.
const SEEDED_RANDOM = `(() => { let s = 20261109; Math.random = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; })();`;

for (const f of fixtures) {
  for (const state of f.states) {
    test(`${f.id} ${state}`, async ({ page }) => {
      const errors = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
      await page.addInitScript(SEEDED_RANDOM);
      await page.goto(`/?lab=renderers&item=${f.id}&state=${state}`);
      await page.getByTestId("lab-ready").waitFor({ timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready);
      // Entrances are fades under reduced motion; let them land.
      await page.waitForTimeout(800);

      // Nothing wider than the screen.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, "page wider than the viewport").toBeLessThanOrEqual(0);
      // The parts that must be there.
      await expect(page.getByTestId("stem")).toBeVisible();
      if (f.item.figure) await expect(page.getByRole("img", { name: f.item.figure.alt })).toBeAttached();
      if (f.item.type === "mc") await expect(page.getByRole("radio")).toHaveCount(f.item.choices.length);
      else await expect(page.getByLabel("Your answer")).toBeAttached();

      await expect(page).toHaveScreenshot(`${f.id}-${state}.png`);

      // A question taller than the screen: its lower end too (last choices and the Check bar).
      if (state === "idle") {
        const scrolled = await page.evaluate(() => {
          const el = document.querySelector("[data-testid=lab-body]");
          if (!el || el.scrollHeight <= el.clientHeight + 2) return false;
          el.scrollTop = el.scrollHeight;
          return true;
        });
        if (scrolled) {
          await page.waitForTimeout(300);
          await expect(page).toHaveScreenshot(`${f.id}-${state}-end.png`);
        }
      }
      expect(errors, "console errors").toEqual([]);
    });
  }
}
