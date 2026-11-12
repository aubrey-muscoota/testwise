// The Testwise website. Static pages come from site/dist (built by
// site/build.mjs); this Worker adds the few dynamic bits:
//   /open        redirects into the app (APP_URL), like a short link
//   /api/beta    stores a beta sign-up in D1
//   /robots.txt  and X-Robots-Tag, so the site stays out of search until launch
//   data-contact links point at CONTACT_EMAIL once it's set

const MONTHS = new Set(["2026-12", "2027-03", "2027-05", "2027-06", "later", "unbooked"]);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export function parseSignup(body) {
  if (!body || typeof body !== "object") return { error: "bad_request" };
  if (body.website) return { spam: true };
  const email = String(body.email ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return { error: "email" };
  if (body.age_ok !== true && body.age_ok !== "on") return { error: "age" };
  const month = MONTHS.has(body.test_month) ? body.test_month : "unbooked";
  return { email, test_month: month };
}

async function readBody(request) {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return request.json().catch(() => null);
  if (type.includes("form")) return Object.fromEntries(await request.formData());
  return null;
}

async function beta(request, env) {
  const isJson = (request.headers.get("content-type") ?? "").includes("application/json");
  const parsed = parseSignup(await readBody(request));
  const reply = (status, data) =>
    isJson
      ? Response.json(data, { status })
      : Response.redirect(new URL(status === 200 ? "/beta/?joined=1" : "/beta/", request.url), 303);
  if (parsed.error) return reply(400, { error: parsed.error });
  if (!parsed.spam) {
    // Signing up twice just keeps the newest test month.
    await env.DB.prepare(
      "INSERT INTO beta_signups (email, test_month) VALUES (?1, ?2) ON CONFLICT(email) DO UPDATE SET test_month = excluded.test_month",
    ).bind(parsed.email, parsed.test_month).run();
  }
  return reply(200, { ok: true });
}

class ContactLink {
  constructor(email) { this.email = email; }
  element(el) {
    el.setAttribute("href", `mailto:${this.email}`);
    el.setInnerContent(this.email);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const indexing = env.INDEXING === "on";

    if (url.pathname === "/open" || url.pathname === "/open/") {
      return Response.redirect(env.APP_URL, 302);
    }
    if (url.pathname === "/api/beta") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
      return beta(request, env);
    }
    if (url.pathname === "/robots.txt") {
      return new Response(indexing ? "User-agent: *\nAllow: /\n" : "User-agent: *\nDisallow: /\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    let response = await env.ASSETS.fetch(request);
    const isHtml = (response.headers.get("content-type") ?? "").includes("text/html");
    if (isHtml && env.CONTACT_EMAIL) {
      response = new HTMLRewriter().on("a[data-contact]", new ContactLink(env.CONTACT_EMAIL)).transform(response);
    }
    if (!indexing) {
      response = new Response(response.body, response);
      response.headers.set("x-robots-tag", "noindex");
    }
    return response;
  },
};
