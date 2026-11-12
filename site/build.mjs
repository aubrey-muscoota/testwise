// Builds the website into site/dist: copies site/public as is, and wraps each
// page in site/pages with the shared head, header and footer.
// Usage: node site/build.mjs
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const root = new URL("./", import.meta.url);
const dist = new URL("dist/", root);

rmSync(dist, { recursive: true, force: true });
cpSync(new URL("public/", root), dist, { recursive: true });

const NAV = [
  ["/#how", "How it works"],
  ["/#socrates", "Socrates"],
  ["/#privacy", "Privacy"],
  ["/beta/", "Beta"],
];
const FOOT = [
  ["/beta/", "Beta"],
  ["/privacy/", "Privacy"],
  ["/terms/", "Terms"],
  ["/support/", "Support"],
  ["/delete-data/", "Delete data"],
];

const escape = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// Each page starts with a comment holding its title and description:
// <!-- title: ... -->
// <!-- description: ... -->
function meta(text, key) {
  const m = text.match(new RegExp(`<!--\\s*${key}:\\s*(.*?)\\s*-->`));
  if (!m) throw new Error(`Page is missing its ${key} comment`);
  return m[1];
}

function layout({ title, description, path, body, script }) {
  const links = (items) =>
    items.map(([href, label]) => `<a href="${href}"${href === path ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta name="theme-color" content="#FFFFFF">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&display=swap">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/components.css">
<link rel="stylesheet" href="/css/site.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="wrap site-head">
<a class="wordmark" href="/">Testwise</a>
<nav class="site-nav" aria-label="Main">${links(NAV)}</nav>
<a class="open" href="/open">Open Testwise</a>
</header>
<main id="main">
${body.trim()}
</main>
<footer class="wrap site-foot">
<nav class="foot-links" aria-label="More">${links(FOOT)}</nav>
<p>Testwise is not affiliated with or endorsed by College Board, ETS, GMAC or CFA Institute. SAT, GRE, GMAT and CFA are trademarks of their owners.</p>
<p>© 2026 Muscoota Ventures LLC</p>
</footer>
${script ? `<script src="${script}" defer></script>\n` : ""}</body>
</html>
`;
}

for (const file of readdirSync(new URL("pages/", root))) {
  if (!file.endsWith(".html")) continue;
  const name = file.replace(/\.html$/, "");
  const text = readFileSync(new URL(`pages/${file}`, root), "utf8");
  const path = name === "index" ? "/" : `/${name}/`;
  const scriptMatch = text.match(/<!--\s*script:\s*(.*?)\s*-->/);
  const html = layout({
    title: meta(text, "title"),
    description: meta(text, "description"),
    path,
    body: text.replace(/<!--\s*(title|description|script):.*?-->\n?/g, ""),
    script: scriptMatch?.[1],
  });
  if (name === "404") {
    writeFileSync(new URL("404.html", dist), html);
    continue;
  }
  const dir = name === "index" ? dist : new URL(`${name}/`, dist);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL("index.html", dir), html);
}
console.log("Built site/dist");
