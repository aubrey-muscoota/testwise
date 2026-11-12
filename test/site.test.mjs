// The website Worker (site/worker.js): sign-up parsing, /open and robots.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, { parseSignup } from "../site/worker.js";
import { parseWranglerConfig } from "../scripts/lib/wrangler-config.mjs";

test("a valid sign-up is normalised", () => {
  assert.deepEqual(parseSignup({ email: " Sam@Example.com ", test_month: "2027-03", age_ok: true }),
    { email: "sam@example.com", test_month: "2027-03" });
});

test("an unknown test month becomes unbooked", () => {
  assert.equal(parseSignup({ email: "a@b.co", test_month: "1999-01", age_ok: true }).test_month, "unbooked");
});

test("bad email, no age confirmation and the honeypot are caught", () => {
  assert.deepEqual(parseSignup({ email: "nope", age_ok: true }), { error: "email" });
  assert.deepEqual(parseSignup({ email: "a@b.co" }), { error: "age" });
  assert.deepEqual(parseSignup({ email: "a@b.co", age_ok: true, website: "x" }), { spam: true });
  assert.deepEqual(parseSignup(null), { error: "bad_request" });
});

test("/open redirects to the app and robots stay off until launch", async () => {
  const env = { APP_URL: "https://app.example", INDEXING: "off" };
  const open = await worker.fetch(new Request("https://site.example/open"), env);
  assert.equal(open.status, 302);
  assert.equal(open.headers.get("location"), "https://app.example/");
  const robots = await worker.fetch(new Request("https://site.example/robots.txt"), env);
  assert.match(await robots.text(), /Disallow: \//);
});

test("the website config keeps indexing off and its own database", () => {
  const config = parseWranglerConfig(readFileSync(new URL("../site/wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(config.name, "testwise-site");
  assert.equal(config.vars.INDEXING, "off");
  assert.deepEqual(config.d1_databases.map((d) => d.database_name), ["testwise-site"]);
});
