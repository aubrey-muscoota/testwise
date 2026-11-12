// Request body shapes. They are lenient on purpose: a missing or odd field
// falls back to the same default the handlers used before (and the handler
// returns its usual 404/400), so old app builds keep working.
import { z } from "zod";

const optString = z.preprocess((v) => (v == null ? undefined : String(v)), z.string().optional()).catch(undefined);

// Which circle on the Learn path a lesson or practice set was started from
// (GET /api/path gives it in each circle's start body). Anything else is dropped.
export const NODE_RE = /^(skill|review|check):[a-z0-9-]{1,60}(:\d{1,2})?$|^end$|^due$/;
const optNode = z.string().regex(NODE_RE).optional().catch(undefined);

export const LessonStart = z.object({
  skill_id: optString,
  placement: z.coerce.boolean().catch(false).default(false),
  section: z.string().regex(/^[a-z0-9-]{1,40}$/).optional().catch(undefined),
  // Placement over every section of the exam (setup's "Find my level").
  all_sections: z.coerce.boolean().catch(false).default(false),
  node: optNode,
}).catch({ placement: false, all_sections: false });

export const Answer = z.object({
  item_id: optString,
  lesson_id: optString,
  response: z.preprocess((v) => (v == null ? "" : String(v)), z.string()).catch(""),
  time_ms: z.number().finite().optional().catch(undefined),
}).catch({ response: "" });

export const Finish = z.object({ lesson_id: optString }).catch({});

const Turn = z.object({ role: z.enum(["student", "socrates"]), content: z.string() });
export const Socrates = z.object({
  item_id: optString,
  response: z.preprocess((v) => (v == null ? "" : String(v)), z.string()).catch(""),
  history: z.array(z.unknown()).catch([]).default([])
    .transform((h) => h.filter((t) => Turn.safeParse(t).success)),
}).catch({ response: "", history: [] });

export const Report = z.object({ item_id: optString, note: optString }).catch({});

const optBool = z.boolean().optional().catch(undefined);
export const Consent = z.object({ age_13_plus: optBool, ai: optBool }).catch({});

// v1.5 profile. A field that is present but malformed becomes "__invalid__"
// so the handler can answer 400 with a reason; an absent field stays
// undefined and is left unchanged.
const present = (inner) => inner.optional().catch("__invalid__");
export const Profile = z.object({
  exam_date: present(z.union([z.string(), z.null()])),
  not_booked: z.boolean().optional().catch(undefined),
  target_score: present(z.union([z.number(), z.null()])),
  daily_minutes: present(z.number()),
}).catch({});

// POST /api/learners: the age answer, and from setup the picked exam and the
// profile, so the learner is created with them in one call. Old app builds
// send only age_13_plus. A malformed exam_id becomes "__invalid__" (400).
export const NewLearner = z.object({
  age_13_plus: optBool,
  exam_id: z.string().regex(/^[a-z0-9-]{1,40}$/).optional().catch("__invalid__"),
  profile: Profile.optional().catch(undefined),
}).catch({});

// v1.5 practice sessions.
export const Practice = z.object({
  mode: optString,
  skill_id: optString,
  skill_ids: z.array(z.string().regex(/^[a-z0-9-]{1,60}$/)).max(40).optional().catch(undefined),
  section: z.string().regex(/^[a-z0-9-]{1,40}$/).optional().catch(undefined),
  n: z.coerce.number().int().min(1).max(100).optional().catch(undefined),
  node: optNode,
}).catch({});

// GET /api/path response (worker/path.js). Not parsed at runtime: the unit and
// end-to-end tests check the shape against it, and docs/API.md describes it.
const Start = z.object({ method: z.literal("POST"), path: z.enum(["/api/lessons", "/api/practice"]), body: z.record(z.string(), z.unknown()) });
const NodeBase = {
  id: z.string().regex(NODE_RE),
  state: z.enum(["done", "current", "open", "locked"]),
  title: z.string().min(1),
  why: z.string().min(1),
  locked_reason: z.string().min(1).optional(),
  start: Start.nullable(),
};
const PathNode = z.discriminatedUnion("kind", [
  z.object({ ...NodeBase, kind: z.literal("skill"), skill_id: z.string(), mastery: z.number().int().min(0).max(100), tested_out: z.boolean(), questions: z.number().int(), minutes: z.number() }),
  z.object({ ...NodeBase, kind: z.literal("review"), skill_ids: z.array(z.string()).min(1), due: z.number().int().min(0), questions: z.number().int(), minutes: z.number() }),
  z.object({ ...NodeBase, kind: z.literal("check"), skill_ids: z.array(z.string()).min(1), questions: z.number().int(), minutes: z.number() }),
]);
export const PathResponse = z.object({
  date: z.string(),
  exam_date: z.string(),
  exam_date_assumed: z.boolean(),
  days_left: z.number().int(),
  phase: z.enum(["learn", "strengthen", "test_ready", "rest", "after"]),
  stats: z.object({ xp: z.number(), streak: z.number(), xp_today: z.number(), reviews_due: z.number() }),
  current: z.string(),
  units: z.array(z.object({
    id: z.string(), name: z.string(), section_id: z.string(), section_name: z.string(), section_index: z.number().int().min(0), section_kind: z.enum(["numbers", "words"]),
    number: z.number().int().min(1), of: z.number().int().min(1), done: z.number().int().min(0), total: z.number().int().min(1),
    nodes: z.array(PathNode).min(1),
  })),
  end: z.object({ ...NodeBase, kind: z.literal("end"), task_title: z.string().nullable() }),
});
