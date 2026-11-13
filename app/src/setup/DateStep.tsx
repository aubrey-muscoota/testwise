// "When's your SAT?": the exam's next official test days as cards (from the
// pack, already filtered to the learner's day by the API, and again here in
// case the saved pack is old), then "Another date" (a calendar) and "I haven't
// booked it yet". An exam with no official days on file shows the calendar.
import React, { useState } from "react";
import { Text } from "react-native";
import type { Exam, ProfileAnswers, TestDate } from "../api";
import { daysBetween, longDay, parseDay, plural, shortDay, todayIso } from "../copy";
import { space, type } from "../theme";
import { DatePick } from "./DatePick";
import { OptionCard, Options } from "./OptionCard";
import { SetupFrame } from "./SetupFrame";
import { buttonOf, frameOf, setupLine, StepProps } from "./shared";

const SHOWN = 4;

/** The official days still ahead of `today`, with deadlines that have passed dropped. */
export function upcoming(dates: TestDate[] | undefined, today: string, n = SHOWN): TestDate[] {
  return (dates ?? [])
    .filter((d) => d.date > today)
    .slice(0, n)
    .map((d) => (d.register_by && d.register_by < today ? { ...d, register_by: undefined } : d));
}

// "23 days away", "About 4 months away".
export function away(days: number) {
  if (days <= 1) return "Tomorrow";
  if (days <= 45) return `${days} days away`;
  return `About ${plural(Math.round(days / 30.44), "month")} away`;
}

// "Saturday, December 5", with the year when it's far enough out to be unclear.
export function dateTitle(iso: string, today = todayIso()) {
  return daysBetween(today, iso) > 300 ? `${longDay(iso)}, ${parseDay(iso).getFullYear()}` : longDay(iso);
}

function dateDetail(d: TestDate, today: string) {
  const parts = [away(daysBetween(today, d.date))];
  if (d.anticipated) parts.push("Date not confirmed yet");
  // A no-break space keeps "Feb 19" together on narrow phones.
  else if (d.register_by) parts.push(`Register by ${shortDay(d.register_by).replace(" ", "\u00a0")}`);
  return parts.join(". ");
}

type Choice = string | "none" | "custom" | null;

export function DateStep({ exam, initial, onSubmit, ...frame }: StepProps<ProfileAnswers> & {
  exam: Exam | null;
  initial: { exam_date: string | null; not_booked: boolean } | null;
}) {
  const today = todayIso();
  const dates = upcoming(exam?.test_dates, today);
  const official = dates.some((d) => d.date === initial?.exam_date);
  const [custom, setCustom] = useState<string | null>(!official && initial?.exam_date && initial.exam_date >= today ? initial.exam_date : null);
  const [choice, setChoice] = useState<Choice>(official ? initial!.exam_date : custom ? "custom" : initial?.not_booked ? "none" : null);
  // With no official days, the calendar is the step.
  const [calendar, setCalendar] = useState(dates.length === 0);
  const [pending, setPending] = useState<string | null>(custom);
  const weeks = exam?.plan.default_weeks ?? 8;
  const line = setupLine(exam, "date");

  const submit = (c: Choice, day = custom) => {
    if (c === "none") return onSubmit({ not_booked: true });
    if (c === "custom" && day) return onSubmit({ exam_date: day });
    if (c && c !== "custom") return onSubmit({ exam_date: c });
  };

  if (calendar) {
    const only = dates.length === 0;
    return (
      <SetupFrame
        {...frameOf(frame)}
        line={line}
        stepKey="calendar"
        onBack={only ? frame.onBack : () => setCalendar(false)}
        backLabel={only ? frame.backLabel : "Back to the dates"}
        button={buttonOf(frame, !!pending, () => { setCustom(pending); setChoice("custom"); submit("custom", pending); })}
        secondary={only ? { title: "I haven't booked it yet", onPress: () => { setChoice("none"); submit("none"); }, disabled: frame.busy } : null}
      >
        <DatePick value={pending} onChange={setPending} />
        <Text style={[type.body, { marginTop: space(2), minHeight: 25 }]} aria-live="polite">
          {pending ? `${longDay(pending)}. That's ${plural(daysBetween(today, pending), "day")} from today.` : " "}
        </Text>
      </SetupFrame>
    );
  }

  return (
    <SetupFrame
      {...frameOf(frame)}
      line={line}
      stepKey="cards"
      button={buttonOf(frame, !!choice && (choice !== "custom" || !!custom), () => submit(choice))}
    >
      <Options label="Test date">
        {dates.map((d) => (
          <OptionCard key={d.date} testID={`date-${d.date}`} title={dateTitle(d.date, today)} detail={dateDetail(d, today)} selected={choice === d.date} onPress={() => setChoice(d.date)} />
        ))}
        <OptionCard
          testID="date-other"
          title="Another date"
          detail={custom ? dateTitle(custom, today) : "Pick the day on a calendar"}
          selected={choice === "custom"}
          onPress={() => { setPending(custom); setCalendar(true); }}
        />
        <OptionCard
          testID="date-none"
          title="I haven't booked it yet"
          detail={`I'll plan for about ${weeks} weeks`}
          selected={choice === "none"}
          onPress={() => setChoice("none")}
        />
      </Options>
    </SetupFrame>
  );
}
