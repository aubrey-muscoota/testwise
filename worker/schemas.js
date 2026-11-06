// Request body shapes. They are lenient on purpose: a missing or odd field
// falls back to the same default the handlers used before (and the handler
// returns its usual 404/400), so old app builds keep working.
import { z } from "zod";

const optString = z.preprocess((v) => (v == null ? undefined : String(v)), z.string().optional()).catch(undefined);

export const LessonStart = z.object({
  skill_id: optString,
  placement: z.coerce.boolean().catch(false).default(false),
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
