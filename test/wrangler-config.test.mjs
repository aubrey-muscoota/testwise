import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TARGETS, parseWranglerConfig, setDatabaseId, stripJsonComments } from "../scripts/lib/wrangler-config.mjs";

const text = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const config = parseWranglerConfig(text);
const staging = config.env?.staging;

test("wrangler.jsonc has production at the top level and a staging env", () => {
  assert.equal(config.name, "testwise");
  assert.ok(staging, "env.staging is missing");
  assert.equal(staging.name, "testwise-staging");
});

test("each target binds its own database as DB", () => {
  const prod = config.d1_databases.find((d) => d.binding === "DB");
  const stage = staging.d1_databases.find((d) => d.binding === "DB");
  assert.equal(prod.database_name, TARGETS.production.database);
  assert.equal(stage.database_name, TARGETS.staging.database);
  assert.notEqual(prod.database_name, stage.database_name);
  assert.equal(stage.migrations_dir, prod.migrations_dir);
});

test("staging repeats every production var (wrangler doesn't inherit vars)", () => {
  assert.deepEqual(Object.keys(staging.vars).sort(), Object.keys(config.vars).sort());
});

test("setDatabaseId changes only the named database", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const out = parseWranglerConfig(setDatabaseId(text, "testwise-staging", id));
  assert.equal(out.env.staging.d1_databases[0].database_id, id);
  assert.equal(out.d1_databases[0].database_id, config.d1_databases[0].database_id);

  const out2 = parseWranglerConfig(setDatabaseId(text, "testwise", id));
  assert.equal(out2.d1_databases[0].database_id, id);
  assert.equal(out2.env.staging.d1_databases[0].database_id, staging.d1_databases[0].database_id);
});

test("setDatabaseId refuses an unknown database name", () => {
  assert.throws(() => setDatabaseId(text, "testwise-prod", "x"), /found 0/);
});

test("stripJsonComments keeps // inside strings", () => {
  const src = '{ "u": "https://a.b//c", // note\n "n": 1 /* x */ }';
  assert.deepEqual(JSON.parse(stripJsonComments(src)), { u: "https://a.b//c", n: 1 });
});
