# Testwise design guide

Direction: **Pop, built around Socrates** (approved by Aubrey, Nov 2026). Duolingo is the North Star for layout,
flow and feel: bright, chunky, pressable, quick. The craft follows unslop: nothing on screen without a reason, sentence
case, real content, every state designed. Socrates is the mascot and the source of the palette. Every screen is checked
against the "Never" list at the end before it ships.

The target look is the clickable prototype (project files `testwise/redesign/prototype.html`) and the brief beside it.

## Character

- **Bright and chunky, never noisy.** White pages, heavy rounded type, buttons and answer cards you want to press.
  Color means something: blue is the thing to press or what's selected, gold is finished, green is right, red is wrong.
- **Socrates is the mascot and he's in the room.** He shows up on every important moment, reacts to what the learner
  just did, and speaks in a speech bubble. He asks more than he cheers.
- **Quick by default, big at the moments that count.** Routine taps get a short press and a tick. A right answer, a
  finished lesson and an unlocked skill get the sound, the bounce and Socrates celebrating.
- **One thing at a time.** One primary action per screen, at the bottom on phones.

## Layout and flow (from Duolingo)

- One job per screen and one primary button, full width, anchored at the bottom on phones. Secondary actions are text
  buttons under it.
- Lessons: a close button and a thick green progress bar on top, the question in the middle, the Check button at the
  bottom. After Check, a band in the answer's color rises from the bottom with Socrates, a short reason ending in the
  right answer when it was wrong ("The answer is ..."; a long choice isn't named, its card is in view and marked
  right), one row of links (Ask Socrates, Show the solution, Report) and Continue. Keep it near a third of the screen
  at 375x667: on short phones Socrates joins the title row and the reason shows at most four lines (tap for the rest).
  Focus moves to the band after Check. On the web, 1 to 4 or A to D pick a choice and Enter checks, then continues.
- The finish: a lesson-done screen (Socrates celebrating, the title, right, XP and time, one button), then, after the
  first lesson of the learner's day (the placement quiz keeps the streak but doesn't count), the streak screen (the count in goldInk, Socrates, this week's days, Continue).
- Answer choices are full-width cards, stacked, with the letter key on the left.
- The Learn tab is one path: a stack of units, one per domain, the sections interleaved. Each unit is a banner in the
  section's color (blue for the first section, teal for the second) on its darker edge, then its nodes as big ovals
  in a centered zigzag: lessons, a review after every three lessons, and a unit check last; a flag closes the path.
  Exactly one node is current: ringed, with a "Start" bubble above it and Socrates beside it on the roomier side. The
  tab opens scrolled to it. Names, status and mastery are in the card a node opens.
- A node's card opens right under it: the speech-bubble look (white, 2 px line border, 18 radius, a tail pointing up
  at the circle), the title in 19 black, a mastery bar for a started lesson, one line of why in ink2, and one primary
  button ("Start lesson", "Start review", "Start unit check", "Practice again" once done). A locked node's card says
  what opens it and has no button. Tapping outside or Escape closes it; focus returns to the circle.
- When a lesson opens the next node, the path comes back on the old current node, scrolls to the new one, which pops
  (scale 1.18) as its ring and bubble fade in. With reduced motion it just appears, already ringed.
- The top bar, over every tab: days to the test (calendar, ink; "Set date" when there is none), the streak (goldDark
  mark, goldInk count) and XP (blue mark, blueDark count), counts in 16 black tabular figures, a 2 px line under it.
  Streak and XP appear after the first lesson. Each count opens Progress.
- Navigation: four tabs, Learn, Practice, Progress and Me: bottom tabs on phones (icon in a wash when current), a left
  rail at 900 px and wider. Progress holds the countdown, the plan's track sentence and the weeks.
- Left-aligned text with a 20 px gutter. Center only a single number or word that is the point.

## Color (`app/src/theme.ts`)

Tied to Socrates: his outline is the ink, his toga cream is the well, his skin and robe orange is the gold.

| Token | Hex | Use |
| --- | --- | --- |
| bg | #FFFFFF | Every screen, cards, sheets, speech bubbles |
| well | #FEF9E7 | Sunken areas: passages, table headers, skeletons, pressed rows (his toga) |
| ink | #2D2A23 | Text and icons (his outline) |
| ink2 | #6B6558 | Secondary text, inactive tabs (5.8:1 on white) |
| ink3 | #A39E92 | Quiet marks only: disabled icons, past days in the date picker. Never text that must be read (2.7:1) |
| line | #E9E6DF | Card and input borders, the tab bar's top edge, speech bubbles |
| white | #FFFFFF | Labels and marks on a filled color |
| blue / blueDark / blueWash | #2E7BFF / #1C5FD6 / #E3EEFF | Primary action, selection, current. blueDark is the button edge and every blue text |
| gold / goldDark / goldInk | #FEB16C / #E68133 / #A9560F | Finished skills, done tasks, the streak. goldInk is gold text |
| good / goodDark / goodWash / goodInk | #1FB46B / #168A52 / #DFF6EA / #0F7A45 | Right answers, progress bars, toggles on |
| bad / badDark / badWash / badInk | #F0524F / #C93A37 / #FDE6E5 / #B02F2C | Wrong answers, destructive links, errors |
| lock / lockDark | #ECEAE4 / #D3D0C7 | Locked and disabled faces, empty progress track, a toggle that is off |
| teal / tealDark / tealWash | #12A08F / #0B7A6D / #D7F3EE | The second section (Reading and Writing) on the path; tealWash is its "current" ring, as blueWash is for Math |

Rules:

- That is the whole palette. No other shades, no opacity variants (the sheet scrim is the one exception), no gradients.
- Every filled color comes as a pair: the face and its darker edge underneath.
- Text contrast: 4.5:1 for body and small text, 3:1 only for large text (19 px black and up). In practice: body text is
  ink or ink2; colored text uses the `Dark`/`Ink` token (blueDark, goldInk, goodInk, badInk, tealDark), never the bright
  fill. Button labels are 19 px black, so white on blue (3.9:1) and on bad (3.5:1) pass as large text. White on the
  bright green does not (2.7:1), so a green button uses goodDark as its face.
- Shadows only on things that float (sheets, the tutor). Bars are separated by a 2 px line, not a shadow.

## Type

- **Nunito only**, the brand font. Titles heavy (800/900), body 600/700. No serif, no monospace, no italics except
  where meaning needs them (a title of a work in a passage).
- Sentence case everywhere, buttons included. No all-caps, no letter-spacing, no negative tracking. No periods at the
  end of titles, headings or buttons.
- Scale: hero 34/40 900; title 26/32 900; heading 20/26 900; button 19/24 900; question 19/28 700; Socrates 18/25 800
  (16/22 in tight places); body 17/25 600; label 16/21 800; small 14/19 700 in ink2; numbers 30/36 900.
- Tabular numbers (`fontVariant: ["tabular-nums"]`) wherever numbers change or line up: timers, counts, scores, XP.

## Shape and components

- Radii: buttons and cards 16, rows and inputs 14, sheets 24, small things 10. Nested corners: inner = outer − padding.
- **Primary button**: blue face on a 4 px blueDark edge; pressing pushes the face down onto the edge. Disabled: lock
  face, lockDark edge, ink2 label (4.8:1 on lock; a disabled label still says something, like "Checking…"). In the result band the button takes the answer's color (goodDark or bad).
- **Answer cards**: white, 2 px line border with a 4 px bottom; the letter sits in a small bordered key. Selected:
  blue border, blueWash fill, blueDark text. Right: good border, goodWash, goodInk. Wrong: bad border, badWash, badInk.
  Pressing flattens the bottom border. The same card is used for any single choice (minutes a day, birth month).
- **Progress bars**: 16 px, fully round, good green on a lock track.
- **Inputs**: white, 2 px line border, blue focus outline.
- **Rows**: title 17 black, detail small; an icon, when it helps recognition, sits in a 44 px blueWash circle.
- **Toggles**: good when on, lockDark when off, white knob.
- **Path nodes**: 70 x 62 ovals on a 7 px edge. Open: the section's color (blue or teal) with a white mark. Current:
  the same, ringed (6 px, 10 px out) in the section's wash (blueWash or tealWash). Finished: gold on goldDark.
  Locked: lock grey on lockDark, the mark in ink2. The mark says what it is: play for a lesson (a check once
  finished, a lock while locked), redo for a review, a chest for the unit check, a flag at the end. No numbers on
  nodes; mastery is a bar in the node's card.
- **Unit banners**: the domain name and "3 of 5" (finished nodes) in 19 px black, then "Section, unit 2 of 8" in
  19 px 800, white on the section's color, radius 18, on a 7 px edge in its dark shade.
- Icons: one hand-drawn line family (`app/src/components/icons.tsx`), 24 px grid, 2.25 px stroke, round caps. No emoji
  in the interface, ever (emoji in a learner's own typed text are fine).

## Socrates

- The animated rig (`app/src/socrates/`) is fixed: don't change the rig, its parts or its colors. Pick his mood from
  the moment: thinking while the learner works, happy on a right answer, concerned on a miss, celebrate at the end of
  a lesson, listening while a question waits for the learner.
- He speaks in the app font (Socrates style, 18/25 800) inside a **speech bubble**: white fill, 2 px line border,
  16 radius, a small tail pointing at him, no drop shadow. Beside him the bubble centers on him; under him the tail
  points up.
- Inside the result band and the tutor chat, his words sit without the tail (the band or the chat bubble already frames
  them).
- His words type out at a human pace (fast on plain words, a beat on commas and full stops) while his mouth moves. Tap
  to skip.

## Voice

- Specific beats general: "You missed two slope questions yesterday. Start there?" not "Let's keep learning!".
- Socrates asks questions and notices things. He doesn't pun about his beard or quote himself.
- Exclamation marks only for real wins (a lesson finished, a skill unlocked), one at a time.
- Plain words a 16-year-old uses. No "journey", "unlock your potential", "level up your learning", "let's dive in".
- Numbers are concrete: "12 minutes", "3 of 8", "41 days". Buttons are verb + object ("Start lesson", "Fix 4 mistakes").

## Motion

- Presses: the face moves down onto its edge (about 80 ms) and springs back. Selection pops slightly.
- Arrivals spring with a small overshoot; things that leave ease out quickly. The result band rises from the bottom.
- Stagger lists by 30 to 50 ms. Nothing loops forever except Socrates' breathing and blinking.
- Peaks: a right answer (tick sound, Socrates happy, +XP floats up), three in a row, a finished lesson (numbers count
  up, Socrates celebrates), an unlocked skill.
- Respect reduced motion: Socrates holds a still frame, movement becomes fades.

## Do

- Use the design system: tokens from `app/src/theme.ts` and shared components only, no one-off colors or sizes.
- Show the actual product: real questions, real progress, Socrates himself.
- Make the main thing big: the next task, the question, the score. Everything else steps back.
- Make headlines specific ("41 days to your SAT", not "Your plan") and wrap them by hand where a break reads better.
- Group with spacing. A border only where the thing is pressable (a card) or holds input.
- Every wait has a loading state (Socrates thinking, a skeleton of the real layout), every action a response.
- Check screenshots at 390x844, 375x667 and 1440x900 before merging.

## Never (review checklist)

Unless there's a specific design reason, and that reason is written in the PR:

- [ ] Emoji used as icons or decoration.
- [ ] ALL-CAPS or letter-spaced labels, buttons or subtitles; eyebrows above titles; section numbering.
- [ ] Gradients, glassmorphism, glows, sparkles, confetti on routine actions.
- [ ] Generic pep talk ("You've got this!", "Let's dive in!", "Amazing job!").
- [ ] More than one primary (blue) button on a screen.
- [ ] Bright fill colors used for small text (blue, gold, good, bad or teal text under 19 px black).
- [ ] Colors outside the palette, opacity tints of palette colors, extra shades.
- [ ] A speech bubble with a drop shadow, or Socrates' words in a different font from the app.
- [ ] Changes to the Socrates rig, its parts or colors.
- [ ] Borders on anything but pressable cards, inputs, tables and speech bubbles; a card inside a card; dividers between every row.
- [ ] Tags, pills or badges that repeat what the content says; placeholder numbers (0 XP, 0 streak) before any activity.
- [ ] Three-item feature lists with an icon tile per item.
- [ ] Serif or monospace fonts, random italics, negative kerning, periods at the end of titles.
- [ ] Verbose or redundant text, code-like breadcrumbs (Home / Math / Algebra).
- [ ] Untabular changing numbers (timers, counts, XP).
