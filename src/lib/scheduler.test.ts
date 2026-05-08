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
});

describe("sumStepMinutes", () => {
  it("can filter totals by step category", () => {
    expect(sumStepMinutes(steps, "Hands-on")).toBe(285);
    expect(sumStepMinutes(steps, "Assay")).toBe(120);
    expect(sumStepMinutes(steps)).toBe(405);
  });
});
