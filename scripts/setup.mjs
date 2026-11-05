// Create the D1 database if it doesn't exist, then write its id into
// wrangler.jsonc so `wrangler deploy` can bind it. Safe to run on every deploy.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const NAME = "testwise";
const wrangler = (...args) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8" });

let db = JSON.parse(wrangler("d1", "list", "--json")).find((d) => d.name === NAME);
if (!db) {
  wrangler("d1", "create", NAME);
  db = JSON.parse(wrangler("d1", "list", "--json")).find((d) => d.name === NAME);
  console.log(`Created D1 database ${NAME}`);
}
console.log(`D1 ${NAME}: ${db.uuid}`);

const path = new URL("../wrangler.jsonc", import.meta.url);
const text = readFileSync(path, "utf8");
writeFileSync(path, text.replace(/"database_id":\s*"[^"]*"/, `"database_id": "${db.uuid}"`));
