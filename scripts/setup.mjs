// Create the D1 database for a target if it doesn't exist, then write its id
// into wrangler.jsonc so `wrangler deploy` can bind it. Safe to run on every
// deploy. Usage: node scripts/setup.mjs [production|staging]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { TARGETS, setDatabaseId } from "./lib/wrangler-config.mjs";

const target = process.argv[2] ?? "production";
if (!TARGETS[target]) {
  console.error(`Unknown target "${target}". Use one of: ${Object.keys(TARGETS).join(", ")}`);
  process.exit(1);
}
const NAME = TARGETS[target].database;
const wrangler = (...args) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8" });

let db = JSON.parse(wrangler("d1", "list", "--json")).find((d) => d.name === NAME);
if (!db) {
  wrangler("d1", "create", NAME);
  db = JSON.parse(wrangler("d1", "list", "--json")).find((d) => d.name === NAME);
  console.log(`Created D1 database ${NAME}`);
}
if (!db) throw new Error(`D1 database ${NAME} is still missing after create`);
console.log(`D1 ${NAME}: ${db.uuid}`);

const path = new URL("../wrangler.jsonc", import.meta.url);
writeFileSync(path, setDatabaseId(readFileSync(path, "utf8"), NAME, db.uuid));
