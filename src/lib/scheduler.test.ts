import { describe, expect, it } from "vitest";

import { generateSchedule, sumStepMinutes, type Step } from "./scheduler";

const steps: Step[] = [
  {
    name: "Seed Cells",
    dayOffset: 0,
    durationMinutes: 45,
    category: "Hands-on",
    protocol: "Cell Seeding SOP",
  },
  {
    name: "Encapsulation",
    dayOffset: 4,
    durationMinutes: 240,
    category: "Hands-on",
    protocol: "Encapsulation SOP",
  },
  {
    name: "Live/Dead Assay",
    dayOffset: 5,
    durationMinutes: 120,
    category: "Assay",
    protocol: "Live/Dead Assay Instructions",
  },
];

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function time(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

describe("generateSchedule", () => {
  it("moves weekend tasks to the next weekday when weekend avoidance is enabled", () => {
    const schedule = generateSchedule({
      steps,
      startDate: "2026-05-11",
      workStart: "09:00",
      avoidWeekends: true,
    });

    expect(isoDate(schedule[2].date)).toBe("2026-05-18");
    expect(schedule[2].shifted).toBe(true);
    expect(schedule[2].warnings).toContain("weekend-shift");
  });

  it("rechecks weekend avoidance after a conflict shift", () => {
    const schedule = generateSchedule({
      steps,
      startDate: "2026-05-11",
      workStart: "09:00",
      avoidWeekends: true,
      conflicts: [{ dayOffset: 4, label: "Lab seminar" }],
    });

    expect(isoDate(schedule[1].date)).toBe("2026-05-18");
    expect(schedule[1].conflict).toBe("Lab seminar");
    expect(schedule[1].shifted).toBe(true);
    expect(schedule[1].warnings).toEqual([
      "calendar-conflict",
      "weekend-shift",
    ]);
  });

  it("keeps weekend dates when weekend avoidance is disabled", () => {
    const schedule = generateSchedule({
      steps,
      startDate: "2026-05-11",
      workStart: "09:00",
      avoidWeekends: false,
    });

    expect(isoDate(schedule[2].date)).toBe("2026-05-16");
    expect(schedule[2].shifted).toBe(false);
  });

  it("can detect conflicts by scheduled calendar date", () => {
    const schedule = generateSchedule({
      steps,
      startDate: "2026-05-11",
      workStart: "09:00",
      avoidWeekends: true,
      conflicts: [{ date: "2026-05-15", label: "Calendar busy block" }],
    });

    expect(isoDate(schedule[1].date)).toBe("2026-05-18");
    expect(schedule[1].conflict).toBe("Calendar busy block");
    expect(schedule[1].warnings).toContain("calendar-conflict");
    expect(schedule[1].warnings).toContain("weekend-shift");
  });

  it("places multiple steps on the same day sequentially", () => {
    const schedule = generateSchedule({
      steps: [
        {
          name: "Step A",
          dayOffset: 0,
          durationMinutes: 45,
          category: "Hands-on",
          protocol: "Protocol A",
        },
        {
          name: "Step B",
          dayOffset: 0,
          durationMinutes: 30,
          category: "Hands-on",
          protocol: "Protocol B",
        },
      ],
      startDate: "2026-05-11",
      workStart: "09:00",
      avoidWeekends: true,
    });

    expect(time(schedule[0].date)).toBe("09:00");
    expect(time(schedule[1].date)).toBe("09:45");
  });

  it("moves overflowing work to the next workday", () => {
    const schedule = generateSchedule({
      steps: [
        {
          name: "Long Setup",
          dayOffset: 0,
          durationMinutes: 420,
          category: "Hands-on",
          protocol: "Setup SOP",
        },
        {
          name: "Follow-up",
          dayOffset: 0,
          durationMinutes: 120,
          category: "Hands-on",
          protocol: "Follow-up SOP",
        },
      ],
      startDate: "2026-05-11",
      workStart: "09:00",
      workEnd: "17:00",
      avoidWeekends: true,
    });

    expect(isoDate(schedule[1].date)).toBe("2026-05-12");
    expect(time(schedule[1].date)).toBe("09:00");
    expect(schedule[1].warnings).toContain("workday-overflow");
  });

  it("returns an empty schedule for invalid schedule inputs", () => {
    const schedule = generateSchedule({
      steps,
      startDate: "2026-02-31",
      workStart: "09:00",
      avoidWeekends: true,
    });

    expect(schedule).toEqual([]);
  });

  it("clamps invalid step durations and reports a warning", () => {
    const schedule = generateSchedule({
      steps: [
        {
          name: "Broken Step",
          dayOffset: 0,
          durationMinutes: 0,
          category: "Hands-on",
          protocol: "Protocol",
        },
      ],
      startDate: "2026-05-11",
      workStart: "09:00",
      avoidWeekends: true,
    });

    expect(schedule[0].durationMinutes).toBe(1);
    expect(schedule[0].warnings).toContain("invalid-duration");
  });
});

describe("sumStepMinutes", () => {
  it("can filter totals by step category", () => {
    expect(sumStepMinutes(steps, "Hands-on")).toBe(285);
    expect(sumStepMinutes(steps, "Assay")).toBe(120);
    expect(sumStepMinutes(steps)).toBe(405);
  });
});
