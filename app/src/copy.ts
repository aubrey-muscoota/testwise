// What Socrates says when there's no data to say something more specific.
// Voice (docs/DESIGN.md): specific, plain, curious. He asks and notices.
// No puns about his beard, no "journey", exclamation marks only for real wins.
// Screens prefer real data (the plan's status, a task's why, the wrong-answer
// reason, the learner's numbers) and fall back to these.

export const lines = {
  // Right answer, nothing more specific to say.
  correct: [
    "Yes. Could you explain why to a friend?",
    "That's it. What gave it away?",
    "Right. Did you check it another way, or trust it?",
    "Correct. Was that a guess or a sure thing?",
    "Good. Would you get it again in a week?",
  ],
  // Wrong answer without a reason on file for that choice.
  incorrect: [
    "Not this time. Where did it turn?",
    "Close? Look at the solution and find the step you skipped.",
    "That's not it. Which part felt shaky?",
    "No. Want to talk it through with me?",
  ],
  // A missed question coming back at the end of the lesson.
  retry: [
    "This one came back. Slower this time?",
    "You missed this earlier. What will you do differently?",
  ],
  next: [
    "Next one. Read the last line first.",
    "Here's another. What is it really asking?",
    "Take this one slowly.",
  ],
  review: [
    "These are ones you missed before. Do they look different now?",
    "A few you got wrong earlier. Let's see what stuck.",
  ],
  placement: [
    "Answer what you can. A guess is fine, it still tells me something.",
    "Easy to hard. Guessing is fine, I only want a rough picture.",
  ],
  loading: [
    "Finding questions you haven't seen…",
    "Picking the next set…",
  ],
  // Tutor chat when the network fails.
  tutorOffline: "I can't reach my notes right now. The worked solution is below.",
};

export function pick(list: readonly string[], seed?: number) {
  const i = seed == null ? Math.floor(Math.random() * list.length) : Math.abs(seed) % list.length;
  return list[i];
}

// ─── Formatting ──────────────────────────────────────────────────────────────

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const monthName = (m: number) => MONTHS[m];
export const shortMonth = (m: number) => MONTHS[m].slice(0, 3);

// "2027-03-13" → a local Date at noon (safe across DST).
export function parseDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
export function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function todayIso() {
  return isoDay(new Date());
}
export function daysBetween(a: string, b: string) {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}

// "Saturday, March 13"
export function longDay(iso: string) {
  const d = parseDay(iso);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
// "Mar 13"
export function shortDay(iso: string) {
  const d = parseDay(iso);
  return `${shortMonth(d.getMonth())} ${d.getDate()}`;
}
// "Nov 8 – 14", "Nov 29 – Dec 5"
export function dayRange(a: string, b: string) {
  const x = parseDay(a);
  const y = parseDay(b);
  if (a === b) return shortDay(a);
  if (x.getMonth() === y.getMonth()) return `${shortDay(a)} – ${y.getDate()}`;
  return `${shortDay(a)} – ${shortDay(b)}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// "about 14 minutes", "6 minutes"
export function minutes(m: number, about = false) {
  const n = Math.max(1, Math.round(m));
  return `${about ? "about " : ""}${plural(n, "minute")}`;
}

// 254 → "4:14"
export function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// "Systems, slopes and transitions"
export function listOf(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// Keeps the last two words of a title together, so no single word sits alone on the last line.
export function noOrphan(t: string) {
  const i = t.lastIndexOf(" ");
  return i > 0 && t.length - i < 14 ? `${t.slice(0, i)}\u00a0${t.slice(i + 1)}` : t;
}

// A plan task title without its "Learn: " prefix.
export function taskName(title: string) {
  return title.replace(/^(Learn|Review|Practice):\s*/i, "");
}
