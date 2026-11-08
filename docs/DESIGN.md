# Testwise design guide

Testwise should feel like a patient tutor's notebook, not a generated app template. Every screen is checked against the
"Never" list at the end before it ships.

## Character

- **Warm paper, ink and one bright blue.** The page is paper, text is ink, Azure is for the one thing to press. Color
  means something (right, wrong, streak), it is never decoration.
- **Socrates is a person in the room.** He talks in his own typeface, beside the learner's work, about what they just did.
  He asks more than he cheers.
- **Made by hand, kept simple.** The skill path is drawn in ink and lines wobble slightly. Small imperfections are on
  purpose; perfect symmetry everywhere reads as generated. Simple beats detailed: fewer elements, fewer styles.
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
| rule | #E6DDCF | The rare hairline (see Layout) |
| azure | #58A6FF | Primary action, selection, progress (brand) |
| azureInk | #2D6FC2 | Azure text on paper (links, small labels), passes contrast |
| azureWash | #E6F0FC | Selected answer background |
| terracotta | #D9774B | Socrates' warmth: streak, highlights |
| olive | #5E8F4C / wash #EAF1E3 | Correct |
| brick | #C0553F / wash #F8E7E2 | Incorrect |
| ochre | #D99A2B | XP |

That is the whole palette. No extra shades or opacity variants of these colors, no gradients, no pure white
backgrounds. Shadows only on things that float (sheets, the bottom bar), and soft.

## Type

- **Fraunces** (serif): Socrates' speech, chapter titles, big numbers (countdown, score), screen titles.
- **Nunito** (brand font): everything else, including question text and choices.
- Sentence case everywhere, buttons included. No periods at the end of titles or headings.
- Default letter-spacing. No negative tracking on headings, no letter-spaced labels.
- Italics only where meaning needs them (a title of a work in a passage). No monospace in the interface.
- Sizes: title 28/34 Fraunces 600; Socrates 19/27 Fraunces 400; body 17/25 Nunito 400; label 15/20 Nunito 700;
  small 13/18 Nunito 600.

## Layout

- Left-aligned text with a 20 px side gutter. Center only single words or numbers that are the point (a score).
- Group with space, not boxes or dividers. A hairline only where space alone can't separate two things. Never a card
  inside a card, and no bordered containers. At most one raised surface per region.
- No eyebrows (small labels above titles), no section numbering, no tags or pills for status. Say it in the sentence.
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

## Do (positive rules)

- Use the design system: tokens from `app/src/theme.ts` and shared components only, no one-off colors or sizes.
- Show the actual product: real questions, real progress, Socrates himself. No decorative stand-ins.
- Make the main thing big: the next task on Home, the question in a lesson. Everything else steps back.
- Emphasize the one call to action in Azure; secondary actions stay quiet.
- Make headlines specific ("41 days to your SAT", not "Your plan") and wrap them by hand where a break reads better
  (no single orphan word on the last line).
- Group with spacing. Delete filler badges and labels the content already says.
- Nested corners: inner radius = outer radius − padding.
- Text contrast at least 4.5:1 for body and 3:1 for large text, on paper as well as on sheets.
- Tabular numbers (`fontVariant: ["tabular-nums"]`) wherever numbers change or line up: timers, counts, scores.
- Align by eye, not pixels: optically center play icons and round shapes, hang punctuation in big quotes.
- Keep icons one family: same stroke, size and corner style.
- Every wait has a loading state (Socrates thinking, a skeleton of the real layout), and every action gets useful
  animated feedback (a pressed state, a right/wrong response), never animation for its own sake.
- Remove embellishments that don't carry information.

## Never (review checklist)

Unless there's a specific design reason, and that reason is written in the PR:

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
- [ ] Tags and pills, eyebrows, section numbering, all-caps subtitles.
- [ ] Containers with borders; squircles (superellipse app-icon corners) on cards and buttons.
- [ ] Overused dividers; extra shades and opacities of the palette colors.
- [ ] Excessive italics, negative kerning, Instrument Serif, monospace fonts in the interface.
- [ ] Over-detailed UI or diagrams; dithering; ASCII art.
- [ ] Verbose or redundant text, code-like breadcrumbs (Home / Math / Algebra), periods at the end of titles.
- [ ] Randomly italicized words; filler badges; labels that repeat what the content says.
