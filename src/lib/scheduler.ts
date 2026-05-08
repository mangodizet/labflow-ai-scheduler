export type Step = {
  name: string;
  dayOffset: number;
  durationMinutes: number;
  category: "Hands-on" | "Incubation" | "Assay";
  protocol: string;
};

export type CalendarConflict = {
  dayOffset: number;
  label: string;
};

export type ScheduledStep = Step & {
  date: Date;
  shifted: boolean;
  conflict: string | null;
};

type GenerateScheduleOptions = {
  steps: Step[];
  startDate: string;
  workStart: string;
  avoidWeekends: boolean;
  conflicts?: CalendarConflict[];
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function withTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function movePastWeekend(date: Date) {
  const next = new Date(date);
  const day = next.getDay();

  if (day === 6) {
    next.setDate(next.getDate() + 2);
  }

  if (day === 0) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

function normalizeWorkDate(date: Date, avoidWeekends: boolean) {
  return avoidWeekends ? movePastWeekend(date) : date;
}

function resolveScheduledDate(
  originalDate: Date,
  avoidWeekends: boolean,
  conflict?: CalendarConflict,
) {
  let date = normalizeWorkDate(originalDate, avoidWeekends);

  if (conflict) {
    date = normalizeWorkDate(addDays(date, 1), avoidWeekends);
  }

  return date;
}

export function generateSchedule({
  steps,
  startDate,
  workStart,
  avoidWeekends,
  conflicts = [],
}: GenerateScheduleOptions): ScheduledStep[] {
  const baseDate = new Date(`${startDate}T00:00:00`);

  return steps.map((step) => {
    const originalDate = withTime(addDays(baseDate, step.dayOffset), workStart);
    const conflict = conflicts.find((item) => item.dayOffset === step.dayOffset);
    const date = resolveScheduledDate(originalDate, avoidWeekends, conflict);

    return {
      ...step,
      date,
      shifted: date.getTime() !== originalDate.getTime(),
      conflict: conflict?.label ?? null,
    };
  });
}

export function sumStepMinutes(steps: Step[], category?: Step["category"]) {
  return steps.reduce((total, step) => {
    if (category && step.category !== category) {
      return total;
    }

    return total + step.durationMinutes;
  }, 0);
}
