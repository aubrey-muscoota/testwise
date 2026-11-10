// Small helpers for wrangler.jsonc, shared by scripts/setup.mjs and the tests.

// The two places Testwise runs. Production is the top level of wrangler.jsonc,
// staging is env.staging.
export const TARGETS = {
  production: { database: "testwise" },
  staging: { database: "testwise-staging" },
};

// Strip // and /* */ comments so JSON.parse can read wrangler.jsonc. Leaves
// anything inside strings alone (URLs contain "//").
export function stripJsonComments(text) {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2) + 1;
      if (i === 0) break;
    } else {
      out += c;
    }
  }
  return out;
}

export const parseWranglerConfig = (text) => JSON.parse(stripJsonComments(text));

// Write the database id into the d1 entry with this database_name, and only
// that one. Throws when the name isn't there, so a typo can't deploy staging
// against the production database.
export function setDatabaseId(text, databaseName, id) {
  const name = databaseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`("database_name":\\s*"${name}",\\s*"database_id":\\s*")[^"]*(")`, "g");
  const matches = text.match(re) ?? [];
  if (matches.length !== 1) {
    throw new Error(`Expected one d1 entry named ${databaseName} in wrangler.jsonc, found ${matches.length}`);
  }
  return text.replace(re, `$1${id}$2`);
}
