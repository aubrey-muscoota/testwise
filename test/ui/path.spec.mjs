// The Learn path at three screen sizes against the baselines in
// test/ui/__screenshots__. The page is the path review page (?lab=path), which
// draws fixtures from app/src/lab/path.json (scripts/path-lab-fixtures.mjs,
// built by the real worker/path.js) with the app's own Shell and Learn screen.
//
//   npm run build:app && npx playwright test            compare
//   npx playwright test --update-snapshots              accept a reviewed change
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fixtures = JSON.parse(readFileSync(new URL("../../app/src/lab/path.json", import.meta.url), "utf8"));
const SEEDED_RANDOM = `(() => { let s = 20261112; Math.random = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; })();`;

const CASES = [
  { name: "fresh", state: "fresh" },
  { name: "mid-card", state: "mid", open: fixtures.states.mid.current },
  { name: "locked-card", state: "mid", open: "skill:alg-systems" },
  { name: "review-card", state: "mid", open: "review:alg:1" },
  { name: "teal", state: "teal" },
  { name: "all-done", state: "done", open: "end" },
];

for (const c of CASES) {
  test(`path ${c.name}`, async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    await page.addInitScript(SEEDED_RANDOM);
    await page.goto(`/?lab=path&state=${c.state}${c.open ? `&open=${c.open}` : ""}`);
    await page.getByTestId("lab-ready").waitFor({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "page wider than the viewport").toBeLessThanOrEqual(0);
    const path = fixtures.states[c.state];
    // Exactly one circle is current, and it can be found by name.
    expect(path.units.flatMap((u) => u.nodes).concat([path.end]).filter((n) => n.state === "current")).toHaveLength(1);
    await expect(page.getByTestId(`node-${path.current}`)).toBeAttached();
    await expect(page.getByRole("tab", { name: "Learn" })).toBeVisible();
    if (c.open) {
      const card = page.getByTestId("node-card");
      await expect(card).toBeVisible();
      const node = [...path.units.flatMap((u) => u.nodes), path.end].find((n) => n.id === c.open);
      await expect(page.getByTestId("node-start")).toHaveCount(node.state === "locked" ? 0 : 1);
      // The whole card is on screen, above the tab bar.
      const box = await card.boundingBox();
      const vh = page.viewportSize().height;
      expect(box.y + box.height, "card cut off").toBeLessThanOrEqual(vh);
    }
    await expect(page).toHaveScreenshot(`path-${c.name}.png`);
    expect(errors, "console errors").toEqual([]);
  });
}
