# Testwise design guide

Testwise should feel like a patient tutor's notebook, not a generated app template. Every screen is checked against the
"Never" list at the end before it ships.

## Character

- **Warm paper, ink and one bright blue.** The page is paper, text is ink, Azure is for the one thing to press. Color
  means something (right, wrong, streak), it is never decoration.
- **Socrates is a person in the room.** He talks in his own typeface, beside the learner's work, about what they just did.
  He asks more than he cheers.
- **Made by hand.** Lines wobble slightly, chapter numbers are Roman, the skill path is drawn in ink. Small imperfections
  are on purpose; symmetry everywhere reads as generated.
- **Calm by default, lively at the moments that count.** Motion and sound mark a right answer, a finished lesson or an
  unlocked skill. Between those, things stay still.

## Color (app/src/theme.ts)

| Token | Hex | Use |
| --- | --- | --- |
| paper | #FBF7F0 | Screen background |
| paperDeep | #F3ECDF | Sunken areas: passages, the path's ground, input wells |
| sheet | #FFFDF9 | Raised surfaces that hold work (question, sheet) |
| ink | #22252B | Body text, icons |
| inkSoft | #5E6470 | Secondary text |
| rule | #E6DDCF | Hairlines and dividers |
| azure | #58A6FF | Primary action, selection, progress (brand) |
| azureInk | #2D6FC2 | Azure text on paper (links, small labels), passes contrast |
| azureWash | #E6F0FC | Selected answer background |
| terracotta | #D9774B | Socrates' warmth: streak, highlights, chapter numerals |
| olive | #5E8F4C / wash #EAF1E3 | Correct |
| brick | #C0553F / wash #F8E7E2 | Incorrect |
| ochre | #D99A2B | XP |

No gradients. No pure white backgrounds. Shadows only on things that float (sheets, the bottom bar), and soft.

## Type

- **Fraunces** (serif): Socrates' speech, chapter titles, big numbers (countdown, score), screen titles.
- **Nunito** (brand font): everything else, including question text and choices.
- Sentence case everywhere, buttons included. Letter-spacing only on tiny overlines, and sparingly.
- Sizes: title 28/34 Fraunces 600; Socrates 19/27 Fraunces 400; body 17/25 Nunito 400; label 15/20 Nunito 700;
  small 13/18 Nunito 600.

## Layout

- Left-aligned text with a 20 px side gutter. Center only single words or numbers that are the point (a score).
- Group with space and hairlines, not boxes. Never a card inside a card. At most one raised surface per region.
- One primary action per screen, anchored at the bottom on phones. Secondary actions are text buttons.
- Vary rhythm: the top of Home is not three identical cards. Today's plan reads as a short list with a single
  highlighted next step.

## Socrates

- The animated rig (`app/src/socrates/`) replaces the PNG everywhere. Pick his mood from the moment: thinking while the
  learner works, happy on a right answer, concerned on a miss, celebrate at the end of a lesson, listening while the
  tutor chat waits.
- His words type out at a human pace (fast on plain words, a beat on commas and full stops) while his mouth moves.
- Speech sits beside or under him in Fraunces with a small hand-drawn tail, no bordered bubble with a drop shadow.

## Voice

- Specific beats general: "You missed two slope questions yesterday. Start there?" not "Let's keep learning!".
- Socrates asks questions and notices things. He doesn't pun about his beard or quote himself.
- Exclamation marks only for real wins (a lesson finished, a skill unlocked), one at a time.
- Plain words a 16-year-old uses. No "journey", "unlock your potential", "level up your learning", "let's dive in".
- Numbers are concrete: "12 minutes", "3 of 8", "41 days".

## Icons and imagery

- Line icons drawn in react-native-svg (`app/src/components/icons.tsx`): 24 px grid, 1.75 px stroke, round caps, a
  little irregular. No emoji in the interface, ever (emoji in a learner's own typed text are fine).
- Illustration is Socrates and the drawn path; no stock 3D shapes, sparkles or blobs.

## Motion

- Springs with a small overshoot for things that arrive; quick ease-out for things that leave.
- Stagger lists by 30 to 50 ms. Nothing loops forever except Socrates' breathing and blinking.
- Respect reduced motion: Socrates holds a still frame, transitions become fades.

## Never (review checklist)

- [ ] Emoji used as icons or decoration (🔥 ⚡ 🌱 🏛 ⏱).
- [ ] ALL-CAPS or letter-spaced button labels.
- [ ] A stack of identical rounded cards with soft shadows, or a colored left border on a card.
- [ ] Everything centered.
- [ ] Gradients, glassmorphism, glowing blobs, sparkles.
- [ ] Generic pep talk ("You've got this!", "Let's dive in!", "Shall we begin our journey?").
- [ ] A speech bubble that is a bordered, shadowed rectangle.
- [ ] Placeholder-feeling numbers (0 XP, 0 streak shown as a badge before the learner has done anything).
- [ ] Three-item feature lists with an icon tile per item.
- [ ] Pure white backgrounds or pure black text.
