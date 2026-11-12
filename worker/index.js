// Testwise API, a Cloudflare Worker. Static app files are served from app/dist
// by Workers static assets; everything under /api/ comes here.
//
// Routing is Hono; request bodies are parsed with the zod shapes in schemas.js.
// Each handler lives in routes/ and takes (env, request, learnerId, body).

import { Hono } from "hono";
import { json, fail, requireLearner, today as localToday } from "./lib/http.js";
import * as S from "./schemas.js";
import { tree } from "./routes/tree.js";
import { startLesson, startPlacement, finishLesson } from "./routes/lessons.js";
import { answer } from "./routes/answers.js";
import { socrates } from "./routes/socrates.js";
import { report } from "./routes/reports.js";
import { createLearner, consentState, setConsent, deleteLearner, exportLearner } from "./routes/learners.js";
import { profileRoute, setProfile, planRoute } from "./routes/plan.js";
import { startPractice, practiceSummary } from "./routes/practice.js";
import { pathRoute, checkedNode } from "./routes/path.js";
import { getExam, isReady, learnerExam, listExams, publicExam } from "./lib/exam.js";

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

const api = new Hono().basePath("/api");

api.get("/health", () => json({ ok: true }));

api.post("/learners", async (c) => createLearner(c.env, c.req.raw, S.NewLearner.parse(await readBody(c.req.raw))));

// The test picker: every exam pack, ready or not yet (docs/API.md, "Exams").
// Open without a learner: setup shows it before anyone exists.
api.get("/exams", async (c) => json({ exams: await listExams(c.env) }));

// The exam pack (exams/<id>/exam.json + voice.json + domain weights). Open
// without a learner so setup can show the picked exam's name, dates and
// disclaimer (?exam=<id>, a ready exam); with one, it is always that
// learner's exam. Test dates are filtered by the caller's local day.
api.get("/exam", async (c) => {
  const learner = await requireLearner(c.env, c.req.header("x-learner") || c.req.query("learner"));
  const asked = c.req.query("exam");
  let exam = null;
  if (!learner && asked) {
    if (!/^[a-z0-9-]{1,40}$/.test(asked) || !(await isReady(c.env, asked))) return fail(404, "unknown exam");
    exam = await getExam(c.env, asked);
  }
  exam ??= await learnerExam(c.env, learner?.id ?? null);
  return json(publicExam(exam, localToday(c.req.raw)));
});

// Everything else needs a known learner id, from the header, query or body.
api.use("*", async (c, next) => {
  const raw = c.req.method === "POST" ? await readBody(c.req.raw) : {};
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const id = c.req.header("x-learner") || c.req.query("learner") || body.learner;
  const learner = await requireLearner(c.env, id);
  if (!learner) return fail(401, "unknown learner");
  c.set("learner", learner.id);
  c.set("body", body);
  await next();
});

const route = (schema, handler) => (c) => {
  const b = schema ? schema.parse(c.get("body")) : {};
  return handler(c.env, c.req.raw, c.get("learner"), b);
};

api.get("/tree", route(null, (env, request, learnerId) => tree(env, request, learnerId)));
api.post("/consent", route(S.Consent, (env, request, learnerId, b) => setConsent(env, learnerId, b)));
api.post("/learner/delete", route(null, (env, request, learnerId) => deleteLearner(env, learnerId)));
api.get("/learner/export", route(null, (env, request, learnerId) => exportLearner(env, learnerId)));
// A start may name its path circle only if the path offers that exact start
// (routes/path.js checkedNode); otherwise the node is dropped.
api.post("/lessons", route(S.LessonStart, async (env, request, learnerId, b) => b.placement
  ? startPlacement(env, request, learnerId, b.all_sections ? { all: true } : b.section || null)
  : startLesson(env, request, learnerId, b.skill_id || null, await checkedNode(env, request, learnerId, b.node, "/api/lessons", b))));
api.post("/answers", route(S.Answer, answer));
api.post("/lessons/finish", route(S.Finish, finishLesson));
// Socrates sends the question and the student's messages to Anthropic, so it
// needs the learner's explicit OK first (App Store Guideline 5.1.2(i)).
api.post("/socrates", route(S.Socrates, async (env, request, learnerId, b) => {
  if (!(await consentState(env, learnerId)).ai_consent) return fail(403, "consent_required");
  return socrates(env, request, learnerId, b);
}));
api.post("/reports", route(S.Report, (env, request, learnerId, b) => report(env, learnerId, b)));
// v1.5: test-date profile, the personalized plan, and practice mode (docs/API.md).
api.get("/profile", route(null, profileRoute));
api.post("/profile", route(S.Profile, setProfile));
api.get("/plan", route(null, planRoute));
// The Learn tab's one path (docs/API.md, "Path").
api.get("/path", route(null, pathRoute));
api.get("/practice/summary", route(null, practiceSummary));
api.post("/practice", async (c) => {
  let execCtx = null;
  try { execCtx = c.executionCtx; } catch { /* not available outside a Worker */ }
  const b = S.Practice.parse(c.get("body"));
  b.node = await checkedNode(c.env, c.req.raw, c.get("learner"), b.node, "/api/practice", b);
  return startPractice(c.env, c.req.raw, c.get("learner"), b, execCtx);
});

api.notFound(() => fail(404, "not found"));
api.onError((err) => {
  console.error(err);
  return fail(500, "server error");
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/testwise/, ""); // also works when mounted at muscoota.com/testwise
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (path !== url.pathname) {
      url.pathname = path;
      request = new Request(url, request);
    }
    return api.fetch(request, env, ctx);
  },
};
