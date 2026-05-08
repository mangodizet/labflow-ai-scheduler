"use client";

import { useEffect, useMemo, useState } from "react";

import {
  generateSchedule,
  sumStepMinutes,
  type CalendarConflict,
  type ScheduledStep,
  type Step,
} from "@/lib/scheduler";
import {
  getCurrentUserEmail,
  signInWithGoogleCalendar,
  signOut,
} from "@/lib/supabase/auth";
import { hasSupabaseBrowserConfig } from "@/lib/supabase/client";

const templates = [
  {
    id: "thp1-m2",
    name: "THP-1 M2 Polarization",
    summary: "PMA treatment, resting, IL4/IL13 polarization, encapsulation, and Live/Dead assays.",
    steps: [
      {
        name: "PMA Treatment",
        dayOffset: 0,
        durationMinutes: 30,
        category: "Hands-on",
        protocol: "PMA Treatment Protocol",
      },
      {
        name: "Wash + Resting Begins",
        dayOffset: 1,
        durationMinutes: 45,
        category: "Hands-on",
        protocol: "THP-1 Wash SOP",
      },
      {
        name: "IL4 / IL13 Treatment",
        dayOffset: 3,
        durationMinutes: 30,
        category: "Hands-on",
        protocol: "M2 Polarization Protocol",
      },
      {
        name: "Encapsulation",
        dayOffset: 6,
        durationMinutes: 240,
        category: "Hands-on",
        protocol: "Encapsulation SOP",
      },
      {
        name: "Live/Dead Assay - Day 1",
        dayOffset: 7,
        durationMinutes: 120,
        category: "Assay",
        protocol: "Live/Dead Assay Instructions",
      },
      {
        name: "Live/Dead Assay - Day 3",
        dayOffset: 9,
        durationMinutes: 120,
        category: "Assay",
        protocol: "Live/Dead Assay Instructions",
      },
    ] satisfies Step[],
  },
  {
    id: "cell-culture-maintenance",
    name: "Cell Culture Maintenance",
    summary: "Routine media changes, passaging, and imaging checkpoints for adherent cell workflows.",
    steps: [
      {
        name: "Seed Cells",
        dayOffset: 0,
        durationMinutes: 45,
        category: "Hands-on",
        protocol: "Cell Seeding SOP",
      },
      {
        name: "Media Change",
        dayOffset: 2,
        durationMinutes: 30,
        category: "Hands-on",
        protocol: "Media Change Protocol",
      },
      {
        name: "Passage Cells",
        dayOffset: 4,
        durationMinutes: 75,
        category: "Hands-on",
        protocol: "Passaging SOP",
      },
      {
        name: "Imaging Checkpoint",
        dayOffset: 5,
        durationMinutes: 60,
        category: "Assay",
        protocol: "Microscopy Checklist",
      },
    ] satisfies Step[],
  },
];

const mockCalendarConflicts: CalendarConflict[] = [
  { dayOffset: 6, label: "Lab seminar, 1:30 PM - 2:30 PM" },
  { dayOffset: 7, label: "PI meeting, 11:00 AM - 12:00 PM" },
];

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export default function Home() {
  const [templateId, setTemplateId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [workStart, setWorkStart] = useState("");
  const [avoidWeekends, setAvoidWeekends] = useState(true);
  const [syncStatus, setSyncStatus] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const template = templates.find((item) => item.id === templateId);
  const canGenerateSchedule = Boolean(template && startDate && workStart);

  const schedule = useMemo<ScheduledStep[]>(() => {
    if (!template || !startDate || !workStart) {
      return [];
    }

    return generateSchedule({
      steps: template.steps,
      startDate,
      workStart,
      avoidWeekends,
      conflicts: mockCalendarConflicts,
    });
  }, [avoidWeekends, startDate, template, workStart]);

  const shiftedCount = schedule.filter((step) => step.shifted).length;
  const handsOnMinutes = sumStepMinutes(schedule, "Hands-on");
  const canConnectGoogle = hasSupabaseBrowserConfig();

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      if (!canConnectGoogle) {
        return;
      }

      try {
        const email = await getCurrentUserEmail();

        if (isMounted) {
          setUserEmail(email);
        }
      } catch {
        if (isMounted) {
          setAuthStatus("Unable to read the current Google connection.");
        }
      }
    }

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, [canConnectGoogle]);

  async function handleGoogleConnect() {
    if (!canConnectGoogle) {
      setAuthStatus(
        "Add Supabase environment variables before connecting Google Calendar.",
      );
      return;
    }

    const { error } = await signInWithGoogleCalendar();

    if (error) {
      setAuthStatus(error.message);
    }
  }

  async function handleSignOut() {
    if (!canConnectGoogle) {
      return;
    }

    const { error } = await signOut();

    if (error) {
      setAuthStatus(error.message);
      return;
    }

    setUserEmail(null);
    setAuthStatus("Google Calendar disconnected.");
  }

  function handleTemplateSelection(value: string) {
    setTemplateId(value);
    setSyncStatus("");
  }

  function handleStartDateInput(value: string) {
    setStartDate(value);
    setSyncStatus("");
  }

  function handleWorkStartInput(value: string) {
    setWorkStart(value);
    setSyncStatus("");
  }

  function handleWeekendPreferenceInput(checked: boolean) {
    setAvoidWeekends(checked);
    setSyncStatus("");
  }

  return (
    <main className="min-h-screen bg-[#f4f7f3] text-[#17211b]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-[#d8e2d4] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4c6b57]">
              LabFlow AI
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[#142018] sm:text-4xl">
              Experiment Scheduler
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#55675c]">
              Build a rule-based research timeline, avoid weekend work, check simulated calendar conflicts, and prepare events for Google Calendar sync.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div className="border border-[#d8e2d4] bg-white px-4 py-3">
              <span className="block text-[#637568]">Steps</span>
              <strong className="mt-1 block text-2xl">{schedule.length}</strong>
            </div>
            <div className="border border-[#d8e2d4] bg-white px-4 py-3">
              <span className="block text-[#637568]">Hands-on</span>
              <strong className="mt-1 block text-2xl">{formatDuration(handsOnMinutes)}</strong>
            </div>
            <div className="border border-[#d8e2d4] bg-white px-4 py-3">
              <span className="block text-[#637568]">Adjusted</span>
              <strong className="mt-1 block text-2xl">{shiftedCount}</strong>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="flex flex-col gap-5 border border-[#d8e2d4] bg-white p-5">
            <div className="border border-[#d8e2d4] bg-[#f8faf7] p-4">
              <h2 className="text-sm font-semibold text-[#26382d]">Google Calendar</h2>
              <p className="mt-2 text-sm leading-6 text-[#66756b]">
                Connect Google through Supabase OAuth before replacing mock conflicts with real calendar events.
              </p>
              {userEmail ? (
                <div className="mt-4 space-y-3">
                  <p className="border border-[#d8e2d4] bg-white px-3 py-2 text-sm font-medium text-[#2f6f4e]">
                    Connected as {userEmail}
                  </p>
                  <button
                    onClick={handleSignOut}
                    className="w-full border border-[#bfd0c4] bg-white px-4 py-2 text-sm font-semibold text-[#405347] transition hover:bg-[#eef5ef]"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGoogleConnect}
                  className="mt-4 w-full border border-[#2f6f4e] bg-white px-4 py-2 text-sm font-semibold text-[#2f6f4e] transition hover:bg-[#eef5ef]"
                >
                  Connect Google Calendar
                </button>
              )}
              {authStatus ? (
                <p className="mt-3 text-sm font-medium text-[#8a4b16]" role="status">
                  {authStatus}
                </p>
              ) : null}
            </div>

            <div>
              <label className="text-sm font-semibold text-[#26382d]" htmlFor="template">
                Experiment template
              </label>
              <select
                id="template"
                value={templateId}
                onChange={(event) => {
                  handleTemplateSelection(event.currentTarget.value);
                }}
                onInput={(event) => {
                  handleTemplateSelection(event.currentTarget.value);
                }}
                className="mt-2 w-full border border-[#bfd0c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f6f4e]"
              >
                <option value="">Select experiment</option>
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <p className="mt-3 text-sm leading-6 text-[#66756b]">
                {template
                  ? template.summary
                  : "Choose an experiment template, then set a start date and preferred time to generate the timeline."}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <label className="text-sm font-semibold text-[#26382d]" htmlFor="startDate">
                  Start date
                </label>
                <input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    handleStartDateInput(event.currentTarget.value);
                  }}
                  onInput={(event) => {
                    handleStartDateInput(event.currentTarget.value);
                  }}
                  className="mt-2 w-full border border-[#bfd0c4] px-3 py-2 text-sm outline-none focus:border-[#2f6f4e]"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-[#26382d]" htmlFor="workStart">
                  Preferred start time
                </label>
                <input
                  id="workStart"
                  type="time"
                  value={workStart}
                  onChange={(event) => {
                    handleWorkStartInput(event.currentTarget.value);
                  }}
                  onInput={(event) => {
                    handleWorkStartInput(event.currentTarget.value);
                  }}
                  className="mt-2 w-full border border-[#bfd0c4] px-3 py-2 text-sm outline-none focus:border-[#2f6f4e]"
                />
              </div>
            </div>

            <label className="flex items-center justify-between gap-4 border border-[#d8e2d4] bg-[#f8faf7] px-4 py-3 text-sm font-semibold text-[#26382d]">
              <span>Avoid weekend work</span>
              <input
                type="checkbox"
                checked={avoidWeekends}
                onChange={(event) => {
                  handleWeekendPreferenceInput(event.currentTarget.checked);
                }}
                onInput={(event) => {
                  handleWeekendPreferenceInput(event.currentTarget.checked);
                }}
                className="h-5 w-5 accent-[#2f6f4e]"
              />
            </label>

            <div className="border border-[#d8e2d4] bg-[#f8faf7] p-4">
              <h2 className="text-sm font-semibold text-[#26382d]">MVP build order</h2>
              <ol className="mt-3 space-y-2 text-sm leading-6 text-[#607067]">
                <li>1. Template-based scheduling</li>
                <li>2. Weekend avoidance</li>
                <li>3. Calendar conflict detection</li>
                <li>4. Google Calendar event sync</li>
                <li>5. Protocol and note links</li>
              </ol>
            </div>
          </aside>

          <section className="border border-[#d8e2d4] bg-white">
            <div className="flex flex-col gap-2 border-b border-[#d8e2d4] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#17211b]">Generated timeline</h2>
                <p className="text-sm text-[#66756b]">Preview before creating Google Calendar events.</p>
              </div>
              <button
                onClick={() =>
                  setSyncStatus(
                    `${schedule.length} events are ready. Connect Google Calendar in the next integration step.`,
                  )
                }
                disabled={!canGenerateSchedule}
                className="w-full border border-[#2f6f4e] bg-[#2f6f4e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#25583f] disabled:cursor-not-allowed disabled:border-[#bfd0c4] disabled:bg-[#d8e2d4] disabled:text-[#66756b] sm:w-auto"
              >
                Prepare Calendar Sync
              </button>
            </div>
            {syncStatus ? (
              <p
                className="border-b border-[#d8e2d4] bg-[#f8faf7] px-5 py-3 text-sm font-medium text-[#2f6f4e]"
                role="status"
              >
                {syncStatus}
              </p>
            ) : null}

            {canGenerateSchedule ? (
              <div className="divide-y divide-[#edf2ea]">
                {schedule.map((step, index) => (
                <article key={`${step.name}-${index}`} className="grid gap-4 px-5 py-5 md:grid-cols-[150px_1fr_140px] md:items-start">
                  <div>
                    <p className="text-sm font-semibold text-[#2f6f4e]">Day {step.dayOffset}</p>
                    <p className="mt-1 text-sm text-[#66756b]">{formatDate(step.date)}</p>
                    <p className="text-sm text-[#66756b]">{formatTime(step.date)}</p>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-[#17211b]">{step.name}</h3>
                      <span className="border border-[#d8e2d4] px-2 py-1 text-xs font-semibold text-[#55675c]">
                        {step.category}
                      </span>
                      {step.shifted ? (
                        <span className="border border-[#e8c889] bg-[#fff7df] px-2 py-1 text-xs font-semibold text-[#795b16]">
                          Adjusted
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#66756b]">
                      Protocol link placeholder: {step.protocol}
                    </p>
                    {step.conflict ? (
                      <p className="mt-2 text-sm font-medium text-[#8a4b16]">
                        Conflict avoided: {step.conflict}
                      </p>
                    ) : null}
                  </div>

                  <div className="border border-[#d8e2d4] bg-[#f8faf7] px-3 py-2 text-sm text-[#26382d] md:text-center">
                    <span className="block text-[#66756b]">Duration</span>
                    <strong className="mt-1 block text-base">{formatDuration(step.durationMinutes)}</strong>
                  </div>
                </article>
                ))}
              </div>
            ) : (
              <div className="px-5 py-16 text-center">
                <h3 className="text-lg font-semibold text-[#17211b]">No timeline generated yet</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#66756b]">
                  Select an experiment template, start date, and preferred start time to preview the schedule.
                </p>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
