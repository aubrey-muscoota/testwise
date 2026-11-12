// Create the website's D1 database if it doesn't exist and write its id into
// site/wrangler.jsonc, so `wrangler deploy` can bind it. Safe to run on every deploy.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { setDatabaseId } from "../scripts/lib/wrangler-config.mjs";

const NAME = "testwise-site";
const wrangler = (...args) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8" });
const find = () => JSON.parse(wrangler("d1", "list", "--json")).find((d) => d.name === NAME);

let db = find();
if (!db) {
  wrangler("d1", "create", NAME);
  db = find();
  console.log(`Created D1 database ${NAME}`);
}
if (!db) throw new Error(`D1 database ${NAME} is still missing after create`);
const path = new URL("./wrangler.jsonc", import.meta.url);
writeFileSync(path, setDatabaseId(readFileSync(path, "utf8"), NAME, db.uuid));
console.log(`D1 ${NAME}: ${db.uuid}`);
