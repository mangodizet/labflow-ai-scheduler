export type Step = {
  name: string;
  dayOffset: number;
  durationMinutes: number;
  category: "Hands-on" | "Incubation" | "Assay";
  protocol: string;
};

export type CalendarConflict = {
  dayOffset?: number;
  date?: string;
  label: string;
};

export type ScheduleWarningCode =
  | "calendar-conflict"
  | "duration-exceeds-workday"
  | "invalid-duration"
  | "weekend-shift"
  | "workday-overflow";

export type ScheduledStep = Step & {
  date: Date;
  shifted: boolean;
  conflict: string | null;
  warnings: ScheduleWarningCode[];
};

type GenerateScheduleOptions = {
  steps: Step[];
  startDate: string;
  workStart: string;
  avoidWeekends: boolean;
  conflicts?: CalendarConflict[];
  workEnd?: string;
};

type ParsedTime = {
  hour: number;
  minute: number;
  totalMinutes: number;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMinutes(date: Date, minutes: number) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseTimeInput(value: string): ParsedTime | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, hourValue, minuteValue] = match;
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return {
    hour,
    minute,
    totalMinutes: hour * 60 + minute,
  };
}

function withTime(date: Date, time: ParsedTime) {
  const next = new Date(date);
  next.setHours(time.hour, time.minute, 0, 0);
  return next;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function findCalendarConflict({
  conflicts,
  dayOffset,
  date,
  includeDayOffset,
}: {
  conflicts: CalendarConflict[];
  dayOffset: number;
  date: Date;
  includeDayOffset: boolean;
}) {
  const scheduledDateKey = dateKey(date);

  return conflicts.find(
    (item) =>
      item.date === scheduledDateKey ||
      (includeDayOffset && item.dayOffset === dayOffset),
  );
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
  if (!avoidWeekends) {
    return {
      date,
      shiftedWeekend: false,
    };
  }

  const next = movePastWeekend(date);

  return {
    date: next,
    shiftedWeekend: next.getTime() !== date.getTime(),
  };
}

function isAfter(date: Date, comparison: Date) {
  return date.getTime() > comparison.getTime();
}

function addWarning(
  warnings: ScheduleWarningCode[],
  warning: ScheduleWarningCode,
) {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

function fitWithinWorkday({
  conflicts,
  date,
  dayOffset,
  durationMinutes,
  workStart,
  workEnd,
  avoidWeekends,
  cursorsByDate,
  warnings,
}: {
  conflicts: CalendarConflict[];
  date: Date;
  dayOffset: number;
  durationMinutes: number;
  workStart: ParsedTime;
  workEnd: ParsedTime;
  avoidWeekends: boolean;
  cursorsByDate: Map<string, Date>;
  warnings: ScheduleWarningCode[];
}) {
  let scheduledDate = date;
  let conflictLabel: string | null = null;
  let shouldCheckDayOffsetConflict = true;
  const workdayCapacity = workEnd.totalMinutes - workStart.totalMinutes;

  if (durationMinutes > workdayCapacity) {
    addWarning(warnings, "duration-exceeds-workday");
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const weekendResult = normalizeWorkDate(scheduledDate, avoidWeekends);
    scheduledDate = weekendResult.date;

    if (weekendResult.shiftedWeekend) {
      addWarning(warnings, "weekend-shift");
    }

    const conflict = findCalendarConflict({
      conflicts,
      date: scheduledDate,
      dayOffset,
      includeDayOffset: shouldCheckDayOffsetConflict,
    });
    shouldCheckDayOffsetConflict = false;

    if (conflict) {
      addWarning(warnings, "calendar-conflict");
      conflictLabel ??= conflict.label;
      scheduledDate = withTime(addDays(scheduledDate, 1), workStart);
      continue;
    }

    const dayStart = withTime(scheduledDate, workStart);
    const dayEnd = withTime(scheduledDate, workEnd);

    if (isAfter(dayStart, scheduledDate)) {
      scheduledDate = dayStart;
    }

    const cursor = cursorsByDate.get(dateKey(scheduledDate));

    if (cursor && isAfter(cursor, scheduledDate)) {
      scheduledDate = cursor;
    }

    const scheduledEnd = addMinutes(scheduledDate, durationMinutes);

    if (durationMinutes > workdayCapacity || !isAfter(scheduledEnd, dayEnd)) {
      cursorsByDate.set(dateKey(scheduledDate), scheduledEnd);
      return {
        conflict: conflictLabel,
        date: scheduledDate,
      };
    }

    addWarning(warnings, "workday-overflow");
    scheduledDate = withTime(addDays(scheduledDate, 1), workStart);
  }

  cursorsByDate.set(dateKey(scheduledDate), addMinutes(scheduledDate, durationMinutes));
  return {
    conflict: conflictLabel,
    date: scheduledDate,
  };
}

export function generateSchedule({
  steps,
  startDate,
  workStart,
  avoidWeekends,
  conflicts = [],
  workEnd = "17:00",
}: GenerateScheduleOptions): ScheduledStep[] {
  const baseDate = parseDateInput(startDate);
  const parsedWorkStart = parseTimeInput(workStart);
  const parsedWorkEnd = parseTimeInput(workEnd);

  if (
    !baseDate ||
    !parsedWorkStart ||
    !parsedWorkEnd ||
    parsedWorkEnd.totalMinutes <= parsedWorkStart.totalMinutes
  ) {
    return [];
  }

  const cursorsByDate = new Map<string, Date>();

  return steps.map((step) => {
    const warnings: ScheduleWarningCode[] = [];
    const originalDate = withTime(addDays(baseDate, step.dayOffset), parsedWorkStart);
    const durationMinutes =
      Number.isFinite(step.durationMinutes) && step.durationMinutes > 0
        ? step.durationMinutes
        : 1;
    let candidateDate = originalDate;

    if (durationMinutes !== step.durationMinutes) {
      addWarning(warnings, "invalid-duration");
    }

    const weekendResult = normalizeWorkDate(candidateDate, avoidWeekends);
    candidateDate = weekendResult.date;

    if (weekendResult.shiftedWeekend) {
      addWarning(warnings, "weekend-shift");
    }

    const placement = fitWithinWorkday({
      conflicts,
      date: candidateDate,
      dayOffset: step.dayOffset,
      durationMinutes,
      workStart: parsedWorkStart,
      workEnd: parsedWorkEnd,
      avoidWeekends,
      cursorsByDate,
      warnings,
    });

    return {
      ...step,
      durationMinutes,
      date: placement.date,
      shifted:
        placement.date.getTime() !== originalDate.getTime() ||
        durationMinutes !== step.durationMinutes,
      conflict: placement.conflict,
      warnings,
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
