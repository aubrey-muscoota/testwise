// What each daily goal gives on a learning day, in words. Kept free of imports
// so test/setup.test.mjs can check it against worker/plan.js (lessonCap).

// Lessons a day at `m` minutes: about 6 minutes each, within three quarters of the day.
export function lessonsFor(m: number) {
  return Math.max(1, Math.floor((0.75 * m) / 6));
}

export function goalDetail(m: number) {
  const lessons = lessonsFor(m);
  if (lessons >= 2) return `${lessons === 2 ? "Two" : lessons} lessons and a practice set`;
  if (m < 10) return "One lesson";
  if (m < 15) return "A lesson and a few more questions";
  return "A lesson, then reviews and a short set";
}
