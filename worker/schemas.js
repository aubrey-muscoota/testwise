// Request body shapes. They are lenient on purpose: a missing or odd field
// falls back to the same default the handlers used before (and the handler
// returns its usual 404/400), so old app builds keep working.
import { z } from "zod";

const optString = z.preprocess((v) => (v == null ? undefined : String(v)), z.string().optional()).catch(undefined);

export const LessonStart = z.object({
  skill_id: optString,
  placement: z.coerce.boolean().catch(false).default(false),
  section: z.string().regex(/^[a-z0-9-]{1,40}$/).optional().catch(undefined),
}).catch({ placement: false });

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

// v1.5 practice sessions.
export const Practice = z.object({
  mode: optString,
  skill_id: optString,
  skill_ids: z.array(z.string().regex(/^[a-z0-9-]{1,60}$/)).max(40).optional().catch(undefined),
  section: z.string().regex(/^[a-z0-9-]{1,40}$/).optional().catch(undefined),
  n: z.coerce.number().int().min(1).max(100).optional().catch(undefined),
}).catch({});
