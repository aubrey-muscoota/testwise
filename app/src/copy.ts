// Socrates' lines, from the testwise voice guide.
export const lines = {
  correct: [
    "A wise choice indeed!",
    "Your reasoning is as sharp as my beard!",
    "Truth is beautiful, and so is that answer.",
    "Socrates approves. And I don't say that lightly.",
    "That's the stuff of scholars.",
    "Even Plato would applaud that answer.",
    "You've nailed it. Logic wins again.",
    "Bravo! You're thinking like a philosopher.",
  ],
  incorrect: [
    "Hmm… not quite. Let's think it through.",
    "Mistakes are the path to mastery.",
    "No shame in missing one. We'll try again.",
    "A misstep? Good! That means you're moving.",
    "Ah, a noble misstep.",
    "That wasn't it, but now we're closer.",
    "Wisdom grows from error.",
  ],
  lessonStart: [
    "Shall we begin our journey?",
    "The pursuit of knowledge begins with a single tap.",
    "Ah! A fresh challenge. Let's embrace it.",
    "Let's stretch those brain cells.",
    "A blank slate and a curious mind. Perfect.",
    "I sense a breakthrough on the horizon.",
  ],
  lessonComplete: [
    "Marvelous work, truly!",
    "Knowledge: 1. Confusion: 0.",
    "You are wiser than when we began, and that is success.",
    "That was a lesson well lived!",
    "Each step forward sharpens the mind.",
    "Excellent work, and onward we go.",
    "I'm proud of you, learner.",
  ],
  streak: [
    "Your streak is on fire!",
    "You've got momentum, learner. Don't stop now.",
    "Consistency: the philosopher's true ally.",
    "That streak is glorious. Keep it burning!",
  ],
  retryQueue: [
    "Let's give it another go, shall we?",
    "New attempt, new insight.",
    "It's never the same river twice.",
  ],
  placement: [
    "Let's see what you already know. No pressure!",
    "Show me what you've got. Guessing is fine.",
  ],
  review: [
    "Let's revisit our past steps with fresh eyes.",
    "Review is the mother of memory.",
    "Even I reread scrolls now and then.",
  ],
  unlock: [
    "A new challenge reveals itself!",
    "A door opens. Shall we walk through it?",
    "You've proven yourself. Onward!",
  ],
  loading: [
    "Contemplating the mysteries…",
    "Consulting the Oracle…",
    "Ah, the gears of logic are turning.",
  ],
};

export function pick(list: string[], seed?: number) {
  const i = seed == null ? Math.floor(Math.random() * list.length) : Math.abs(seed) % list.length;
  return list[i];
}
