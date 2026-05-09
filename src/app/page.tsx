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

type Language = "en" | "ko";

const templateCopy = {
  en: {
    "thp1-m2":
      "PMA treatment, resting, IL4/IL13 polarization, encapsulation, and Live/Dead assays.",
    "cell-culture-maintenance":
      "Routine media changes, passaging, and imaging checkpoints for adherent cell workflows.",
  },
  ko: {
    "thp1-m2":
      "PMA 처리, resting, IL4/IL13 polarization, encapsulation, Live/Dead assay를 포함한 일정입니다.",
    "cell-culture-maintenance":
      "부착 세포 워크플로우를 위한 배지 교체, 계대, 이미징 체크포인트 일정입니다.",
  },
} as const;

const copy = {
  en: {
    languageLabel: "Language",
    appTitle: "Experiment Scheduler",
    appDescription:
      "Build a rule-based research timeline, avoid weekend work, check simulated calendar conflicts, and prepare events for Google Calendar sync.",
    steps: "Steps",
    handsOn: "Hands-on",
    adjusted: "Adjusted",
    googleCalendar: "Google Calendar",
    googleCalendarDescription:
      "Connect Google through Supabase OAuth before replacing mock conflicts with real calendar events.",
    connectedAs: "Connected as",
    disconnect: "Disconnect",
    connectGoogle: "Connect Google Calendar",
    missingSupabase:
      "Add Supabase environment variables before connecting Google Calendar.",
    readConnectionError: "Unable to read the current Google connection.",
    disconnected: "Google Calendar disconnected.",
    experimentTemplate: "Experiment template",
    selectExperiment: "Select experiment",
    chooseTemplate:
      "Choose an experiment template, then set a start date and preferred time to generate the timeline.",
    startDate: "Start date",
    preferredStartTime: "Preferred start time",
    avoidWeekendWork: "Avoid weekend work",
    mvpBuildOrder: "MVP build order",
    buildOrder: [
      "Template-based scheduling",
      "Weekend avoidance",
      "Calendar conflict detection",
      "Google Calendar event sync",
      "Protocol and note links",
    ],
    generatedTimeline: "Generated timeline",
    previewBeforeCalendar: "Preview before creating Google Calendar events.",
    prepareCalendarSync: "Prepare Calendar Sync",
    readyForCalendar:
      "events are ready. Connect Google Calendar in the next integration step.",
    noTimeline: "No timeline generated yet",
    noTimelineDescription:
      "Select an experiment template, start date, and preferred start time to preview the schedule.",
    day: "Day",
    protocolPlaceholder: "Protocol link placeholder",
    conflictAvoided: "Conflict avoided",
    duration: "Duration",
    categories: {
      "Hands-on": "Hands-on",
      Incubation: "Incubation",
      Assay: "Assay",
    },
  },
  ko: {
    languageLabel: "언어",
    appTitle: "실험 스케줄러",
    appDescription:
      "실험 워크플로우를 규칙 기반 일정으로 만들고, 주말 작업과 캘린더 충돌을 피한 뒤 Google Calendar 동기화를 준비합니다.",
    steps: "단계",
    handsOn: "실작업",
    adjusted: "조정됨",
    googleCalendar: "구글 캘린더",
    googleCalendarDescription:
      "실제 캘린더 이벤트로 충돌을 확인하려면 Supabase OAuth로 Google을 연결하세요.",
    connectedAs: "연결된 계정",
    disconnect: "연결 해제",
    connectGoogle: "구글 캘린더 연결",
    missingSupabase:
      "구글 캘린더를 연결하려면 먼저 Supabase 환경변수를 추가하세요.",
    readConnectionError: "현재 구글 연결 상태를 읽을 수 없습니다.",
    disconnected: "구글 캘린더 연결이 해제되었습니다.",
    experimentTemplate: "실험 템플릿",
    selectExperiment: "실험 선택",
    chooseTemplate:
      "실험 템플릿을 선택한 뒤 시작 날짜와 선호 시작 시간을 설정하면 일정이 생성됩니다.",
    startDate: "시작 날짜",
    preferredStartTime: "선호 시작 시간",
    avoidWeekendWork: "주말 작업 피하기",
    mvpBuildOrder: "MVP 개발 순서",
    buildOrder: [
      "템플릿 기반 스케줄링",
      "주말 회피",
      "캘린더 충돌 감지",
      "Google Calendar 이벤트 동기화",
      "프로토콜과 노트 링크",
    ],
    generatedTimeline: "생성된 일정",
    previewBeforeCalendar: "Google Calendar에 만들기 전에 일정을 미리 확인합니다.",
    prepareCalendarSync: "캘린더 동기화 준비",
    readyForCalendar:
      "개의 이벤트가 준비되었습니다. 다음 연동 단계에서 Google Calendar를 연결하세요.",
    noTimeline: "아직 생성된 일정이 없습니다",
    noTimelineDescription:
      "실험 템플릿, 시작 날짜, 선호 시작 시간을 설정하면 일정 미리보기가 표시됩니다.",
    day: "Day",
    protocolPlaceholder: "프로토콜 링크 자리",
    conflictAvoided: "피한 충돌",
    duration: "소요 시간",
    categories: {
      "Hands-on": "실작업",
      Incubation: "배양/대기",
      Assay: "분석",
    },
  },
} as const;

function formatDate(date: Date, language: Language) {
  return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(date: Date, language: Language) {
  return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(minutes: number, language: Language) {
  if (minutes < 60) {
    return language === "ko" ? `${minutes}분` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (language === "ko") {
    return remainder ? `${hours}시간 ${remainder}분` : `${hours}시간`;
  }

  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function getTemplateSummary(templateId: string, language: Language, fallback: string) {
  return (
    templateCopy[language][templateId as keyof (typeof templateCopy)[Language]] ??
    fallback
  );
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("en");
  const [templateId, setTemplateId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [workStart, setWorkStart] = useState("");
  const [avoidWeekends, setAvoidWeekends] = useState(true);
  const [syncStatus, setSyncStatus] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const t = copy[language];

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
          setAuthStatus(t.readConnectionError);
        }
      }
    }

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, [canConnectGoogle, t.readConnectionError]);

  async function handleGoogleConnect() {
    if (!canConnectGoogle) {
      setAuthStatus(
        t.missingSupabase,
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
    setAuthStatus(t.disconnected);
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
              {t.appTitle}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#55675c]">
              {t.appDescription}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="border border-[#d8e2d4] bg-white px-4 py-3">
              <span className="block text-[#637568]">{t.languageLabel}</span>
              <div className="mt-2 flex gap-1">
                <button
                  className={`border px-2 py-1 text-xs font-semibold ${
                    language === "en"
                      ? "border-[#2f6f4e] bg-[#2f6f4e] text-white"
                      : "border-[#d8e2d4] text-[#405347]"
                  }`}
                  onClick={() => setLanguage("en")}
                >
                  EN
                </button>
                <button
                  className={`border px-2 py-1 text-xs font-semibold ${
                    language === "ko"
                      ? "border-[#2f6f4e] bg-[#2f6f4e] text-white"
                      : "border-[#d8e2d4] text-[#405347]"
                  }`}
                  onClick={() => setLanguage("ko")}
                >
                  KO
                </button>
              </div>
            </div>
            <div className="border border-[#d8e2d4] bg-white px-4 py-3">
              <span className="block text-[#637568]">{t.steps}</span>
              <strong className="mt-1 block text-2xl">{schedule.length}</strong>
            </div>
            <div className="border border-[#d8e2d4] bg-white px-4 py-3">
              <span className="block text-[#637568]">{t.handsOn}</span>
              <strong className="mt-1 block text-2xl">
                {formatDuration(handsOnMinutes, language)}
              </strong>
            </div>
            <div className="border border-[#d8e2d4] bg-white px-4 py-3">
              <span className="block text-[#637568]">{t.adjusted}</span>
              <strong className="mt-1 block text-2xl">{shiftedCount}</strong>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="flex flex-col gap-5 border border-[#d8e2d4] bg-white p-5">
            <div className="border border-[#d8e2d4] bg-[#f8faf7] p-4">
              <h2 className="text-sm font-semibold text-[#26382d]">{t.googleCalendar}</h2>
              <p className="mt-2 text-sm leading-6 text-[#66756b]">
                {t.googleCalendarDescription}
              </p>
              {userEmail ? (
                <div className="mt-4 space-y-3">
                  <p className="border border-[#d8e2d4] bg-white px-3 py-2 text-sm font-medium text-[#2f6f4e]">
                    {t.connectedAs} {userEmail}
                  </p>
                  <button
                    onClick={handleSignOut}
                    className="w-full border border-[#bfd0c4] bg-white px-4 py-2 text-sm font-semibold text-[#405347] transition hover:bg-[#eef5ef]"
                  >
                    {t.disconnect}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGoogleConnect}
                  className="mt-4 w-full border border-[#2f6f4e] bg-white px-4 py-2 text-sm font-semibold text-[#2f6f4e] transition hover:bg-[#eef5ef]"
                >
                  {t.connectGoogle}
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
                {t.experimentTemplate}
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
                <option value="">{t.selectExperiment}</option>
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <p className="mt-3 text-sm leading-6 text-[#66756b]">
                {template
                  ? getTemplateSummary(template.id, language, template.summary)
                  : t.chooseTemplate}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <label className="text-sm font-semibold text-[#26382d]" htmlFor="startDate">
                  {t.startDate}
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
                  {t.preferredStartTime}
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
              <span>{t.avoidWeekendWork}</span>
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
              <h2 className="text-sm font-semibold text-[#26382d]">{t.mvpBuildOrder}</h2>
              <ol className="mt-3 space-y-2 text-sm leading-6 text-[#607067]">
                {t.buildOrder.map((item, index) => (
                  <li key={item}>
                    {index + 1}. {item}
                  </li>
                ))}
              </ol>
            </div>
          </aside>

          <section className="border border-[#d8e2d4] bg-white">
            <div className="flex flex-col gap-2 border-b border-[#d8e2d4] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#17211b]">{t.generatedTimeline}</h2>
                <p className="text-sm text-[#66756b]">{t.previewBeforeCalendar}</p>
              </div>
              <button
                onClick={() =>
                  setSyncStatus(
                    language === "ko"
                      ? `${schedule.length}${t.readyForCalendar}`
                      : `${schedule.length} ${t.readyForCalendar}`,
                  )
                }
                disabled={!canGenerateSchedule}
                className="w-full border border-[#2f6f4e] bg-[#2f6f4e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#25583f] disabled:cursor-not-allowed disabled:border-[#bfd0c4] disabled:bg-[#d8e2d4] disabled:text-[#66756b] sm:w-auto"
              >
                {t.prepareCalendarSync}
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
                    <p className="text-sm font-semibold text-[#2f6f4e]">
                      {t.day} {step.dayOffset}
                    </p>
                    <p className="mt-1 text-sm text-[#66756b]">
                      {formatDate(step.date, language)}
                    </p>
                    <p className="text-sm text-[#66756b]">
                      {formatTime(step.date, language)}
                    </p>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-[#17211b]">{step.name}</h3>
                      <span className="border border-[#d8e2d4] px-2 py-1 text-xs font-semibold text-[#55675c]">
                        {t.categories[step.category]}
                      </span>
                      {step.shifted ? (
                        <span className="border border-[#e8c889] bg-[#fff7df] px-2 py-1 text-xs font-semibold text-[#795b16]">
                          {t.adjusted}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#66756b]">
                      {t.protocolPlaceholder}: {step.protocol}
                    </p>
                    {step.conflict ? (
                      <p className="mt-2 text-sm font-medium text-[#8a4b16]">
                        {t.conflictAvoided}: {step.conflict}
                      </p>
                    ) : null}
                  </div>

                  <div className="border border-[#d8e2d4] bg-[#f8faf7] px-3 py-2 text-sm text-[#26382d] md:text-center">
                    <span className="block text-[#66756b]">{t.duration}</span>
                    <strong className="mt-1 block text-base">
                      {formatDuration(step.durationMinutes, language)}
                    </strong>
                  </div>
                </article>
                ))}
              </div>
            ) : (
              <div className="px-5 py-16 text-center">
                <h3 className="text-lg font-semibold text-[#17211b]">{t.noTimeline}</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#66756b]">
                  {t.noTimelineDescription}
                </p>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
