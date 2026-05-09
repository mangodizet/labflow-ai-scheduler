"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  generateSchedule,
  sumStepMinutes,
  type CalendarConflict,
  type ScheduleWarningCode,
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

type Language = "en" | "ko";

const languageStorageKey = "labflow-language";

type CalendarBusyBlock = {
  start: string;
  end: string;
  summary?: string;
};

type CalendarConflictResult = {
  busySignature: string;
  conflicts: CalendarConflict[];
};

type DraftEvent = ScheduledStep & {
  id: string;
};

type DraftEventEdit = {
  name: string;
  date: string;
  time: string;
  durationMinutes: number;
};

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
      "Build a rule-based research timeline, avoid weekend work, check Google Calendar conflicts, and sync final events.",
    steps: "Steps",
    handsOn: "Hands-on",
    adjusted: "Adjusted",
    warnings: "Warnings",
    googleCalendar: "Google Calendar",
    googleCalendarDescription:
      "Connect Google through Supabase OAuth to read busy blocks and sync approved experiment events.",
    connectedAs: "Connected as",
    disconnect: "Disconnect",
    connectGoogle: "Connect Google Calendar",
    missingSupabase:
      "Add Supabase environment variables before connecting Google Calendar.",
    readConnectionError: "Unable to read the current Google connection.",
    disconnected: "Google Calendar disconnected.",
    loadingCalendarConflicts: "Checking Google Calendar conflicts...",
    calendarConflictsLoaded: "Google Calendar conflicts loaded.",
    calendarConflictsUnavailable:
      "Google Calendar conflicts are unavailable. The schedule can still be edited manually.",
    calendarConflictsChanged:
      "Calendar conflicts changed. Review the updated draft before syncing.",
    refreshCalendarConflicts: "Refresh conflicts",
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
    previewBeforeCalendar: "Review and edit the draft calendar before syncing.",
    draftCalendar: "Draft calendar",
    editEvent: "Edit event",
    eventName: "Event name",
    eventDate: "Date",
    eventTime: "Time",
    eventDuration: "Duration minutes",
    selectEventToEdit: "Select a calendar event to edit its draft details.",
    prepareCalendarSync: "Sync to Google Calendar",
    syncingCalendar: "Syncing...",
    calendarSyncComplete: "events were added to Google Calendar.",
    calendarSyncFailed: "Unable to sync Google Calendar.",
    calendarPersistenceWarning:
      "Calendar events were created, but Supabase could not save the sync record.",
    connectBeforeSync: "Connect Google Calendar before syncing events.",
    duplicateSync:
      "This schedule has already been synced. Edit the draft schedule before syncing again.",
    noTimeline: "No timeline generated yet",
    noTimelineDescription:
      "Select an experiment template, start date, and preferred start time to preview the schedule.",
    day: "Day",
    protocolPlaceholder: "Protocol link placeholder",
    conflictAvoided: "Conflict avoided",
    duration: "Duration",
    warningMessages: {
      "calendar-conflict": "Moved to avoid a calendar conflict.",
      "duration-exceeds-workday": "Duration is longer than one working day.",
      "invalid-duration": "Invalid duration was adjusted to 1 minute.",
      "weekend-shift": "Moved to avoid weekend work.",
      "workday-overflow": "Moved to the next workday because it exceeded working hours.",
    },
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
      "실험 워크플로우를 규칙 기반 일정으로 만들고, 주말 작업과 Google Calendar 충돌을 피한 뒤 최종 일정을 동기화합니다.",
    steps: "단계",
    handsOn: "작업 시간",
    adjusted: "조정됨",
    warnings: "주의사항",
    googleCalendar: "구글 캘린더",
    googleCalendarDescription:
      "Supabase OAuth로 Google을 연결하면 기존 캘린더 busy block을 읽고 승인된 실험 일정을 동기화합니다.",
    connectedAs: "연결된 계정",
    disconnect: "연결 해제",
    connectGoogle: "구글 캘린더 연결",
    missingSupabase:
      "구글 캘린더를 연결하려면 먼저 Supabase 환경변수를 추가하세요.",
    readConnectionError: "현재 구글 연결 상태를 읽을 수 없습니다.",
    disconnected: "구글 캘린더 연결이 해제되었습니다.",
    loadingCalendarConflicts: "Google Calendar 충돌을 확인하는 중입니다...",
    calendarConflictsLoaded: "Google Calendar 충돌 정보를 불러왔습니다.",
    calendarConflictsUnavailable:
      "Google Calendar 충돌 정보를 불러올 수 없습니다. 일정은 직접 수정할 수 있습니다.",
    calendarConflictsChanged:
      "캘린더 충돌 정보가 변경되었습니다. 업데이트된 초안 일정을 확인한 뒤 다시 동기화하세요.",
    refreshCalendarConflicts: "충돌 정보 새로고침",
    experimentTemplate: "실험 템플릿",
    selectExperiment: "실험 선택",
    chooseTemplate:
      "실험 템플릿을 선택한 뒤 시작 날짜와 희망 시작 시간을 설정하면 일정이 생성됩니다.",
    startDate: "시작 날짜",
    preferredStartTime: "희망 시작 시간",
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
    previewBeforeCalendar: "Google Calendar에 등록하기 전에 초안 일정을 확인하고 수정합니다.",
    draftCalendar: "초안 캘린더",
    editEvent: "일정 수정",
    eventName: "일정 이름",
    eventDate: "날짜",
    eventTime: "시간",
    eventDuration: "소요 시간(분)",
    selectEventToEdit: "수정할 캘린더 일정을 선택하세요.",
    prepareCalendarSync: "구글 캘린더에 동기화",
    syncingCalendar: "동기화 중...",
    calendarSyncComplete: "개의 이벤트를 Google Calendar에 추가했습니다.",
    calendarSyncFailed: "Google Calendar 동기화에 실패했습니다.",
    calendarPersistenceWarning:
      "캘린더 이벤트는 생성됐지만 Supabase에 동기화 기록을 저장하지 못했습니다.",
    connectBeforeSync: "이벤트를 동기화하려면 먼저 Google Calendar를 연결하세요.",
    duplicateSync:
      "이미 동기화된 일정입니다. 다시 동기화하려면 초안 일정을 수정하세요.",
    noTimeline: "아직 생성된 일정이 없습니다",
    noTimelineDescription:
      "실험 템플릿, 시작 날짜, 희망 시작 시간을 설정하면 일정 미리보기가 표시됩니다.",
    day: "Day",
    protocolPlaceholder: "프로토콜 링크 자리",
    conflictAvoided: "피한 충돌",
    duration: "소요 시간",
    warningMessages: {
      "calendar-conflict": "캘린더 충돌을 피하기 위해 이동했습니다.",
      "duration-exceeds-workday": "소요 시간이 하루 근무시간보다 깁니다.",
      "invalid-duration": "잘못된 소요 시간을 1분으로 조정했습니다.",
      "weekend-shift": "주말 작업을 피하기 위해 이동했습니다.",
      "workday-overflow": "근무시간을 초과해 다음 근무일로 이동했습니다.",
    },
    categories: {
      "Hands-on": "작업",
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

function formatWarning(
  warning: ScheduleWarningCode,
  messages: Record<ScheduleWarningCode, string>,
) {
  return messages[warning];
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatTimeInput(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
}

function formatLocalDateTime(date: Date) {
  return `${formatDateInput(date)}T${formatTimeInput(date)}:00`;
}

function combineDateAndTime(dateValue: string, timeValue: string) {
  return new Date(`${dateValue}T${timeValue || "00:00"}:00`);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

function getScheduleTimeRange(template: (typeof templates)[number], startDate: string) {
  const baseDate = combineDateAndTime(startDate, "00:00");
  const lastOffset = Math.max(...template.steps.map((step) => step.dayOffset), 0);

  return {
    timeMax: addDays(baseDate, lastOffset + 14).toISOString(),
    timeMin: baseDate.toISOString(),
  };
}

function getTemplateSummary(templateId: string, language: Language, fallback: string) {
  return (
    templateCopy[language][templateId as keyof (typeof templateCopy)[Language]] ??
    fallback
  );
}

function getInitialLanguage(): Language {
  if (typeof window === "undefined") {
    return "en";
  }

  return window.localStorage.getItem(languageStorageKey) === "ko" ? "ko" : "en";
}

async function fetchCalendarConflicts(
  template: (typeof templates)[number],
  startDate: string,
  language: Language,
): Promise<CalendarConflictResult> {
  const range = getScheduleTimeRange(template, startDate);
  const response = await fetch(
    `/api/calendar/events?timeMin=${encodeURIComponent(
      range.timeMin,
    )}&timeMax=${encodeURIComponent(range.timeMax)}`,
  );
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? "Google Calendar conflicts are unavailable.");
  }

  const busyBlocks = (data?.busy ?? []) as CalendarBusyBlock[];

  return {
    busySignature: JSON.stringify(busyBlocks),
    conflicts: busyBlocks.map((block) => {
      const start = new Date(block.start);
      const end = new Date(block.end);
      const timeLabel = `${formatTime(start, language)} - ${formatTime(
        end,
        language,
      )}`;

      return {
        date: formatDateInput(start),
        label: block.summary ? `${block.summary}, ${timeLabel}` : timeLabel,
      };
    }),
  };
}

export default function Home() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  const [templateId, setTemplateId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [workStart, setWorkStart] = useState("");
  const [avoidWeekends, setAvoidWeekends] = useState(true);
  const [syncStatus, setSyncStatus] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [authStatus, setAuthStatus] = useState("");
  const [calendarStatus, setCalendarStatus] = useState("");
  const [calendarConflicts, setCalendarConflicts] = useState<CalendarConflict[]>([]);
  const [calendarRefreshToken, setCalendarRefreshToken] = useState(0);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string, DraftEventEdit>>({});
  const [selectedEventId, setSelectedEventId] = useState("");
  const previousBusySignature = useRef("");
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
      conflicts: calendarConflicts,
    });
  }, [avoidWeekends, calendarConflicts, startDate, template, workStart]);

  const shiftedCount = schedule.filter((step) => step.shifted).length;
  const handsOnMinutes = sumStepMinutes(schedule, "Hands-on");
  const warningCount = schedule.reduce(
    (total, step) => total + step.warnings.length,
    0,
  );
  const canConnectGoogle = hasSupabaseBrowserConfig();
  const draftEvents = useMemo<DraftEvent[]>(() => {
    return schedule.map((step, index) => {
      const id = `${step.dayOffset}-${step.name}-${index}`;
      const edit = draftEdits[id];

      if (!edit) {
        return {
          ...step,
          id,
        };
      }

      return {
        ...step,
        id,
        name: edit.name,
        date: combineDateAndTime(edit.date, edit.time),
        durationMinutes: edit.durationMinutes,
      };
    });
  }, [draftEdits, schedule]);
  const selectedEvent = draftEvents.find((event) => event.id === selectedEventId);
  const groupedDraftEvents = useMemo(() => {
    return draftEvents.reduce<Record<string, DraftEvent[]>>((groups, event) => {
      const key = formatDateInput(event.date);
      groups[key] = [...(groups[key] ?? []), event];
      return groups;
    }, {});
  }, [draftEvents]);
  const draftDates = Object.keys(groupedDraftEvents).sort();

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

  useEffect(() => {
    window.localStorage.setItem(languageStorageKey, language);
  }, [language]);

  useEffect(() => {
    let isMounted = true;

    async function loadCalendarConflicts() {
      if (!template || !startDate || !workStart || !userEmail) {
        setCalendarConflicts([]);
        setCalendarStatus("");
        return;
      }

      setCalendarStatus(t.loadingCalendarConflicts);

      try {
        const result = await fetchCalendarConflicts(
          template,
          startDate,
          language,
        );

        if (isMounted) {
          setCalendarConflicts(result.conflicts);
          setCalendarStatus(t.calendarConflictsLoaded);

          if (previousBusySignature.current !== result.busySignature) {
            previousBusySignature.current = result.busySignature;
            setDraftEdits({});
            setSelectedEventId("");
          }
        }
      } catch {
        if (isMounted) {
          setCalendarConflicts([]);
          setCalendarStatus(t.calendarConflictsUnavailable);
        }
      }
    }

    void loadCalendarConflicts();

    return () => {
      isMounted = false;
    };
  }, [
    calendarRefreshToken,
    language,
    startDate,
    t.calendarConflictsLoaded,
    t.calendarConflictsUnavailable,
    t.loadingCalendarConflicts,
    template,
    userEmail,
    workStart,
  ]);

  useEffect(() => {
    if (!template || !startDate || !workStart || !userEmail) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setCalendarRefreshToken((current) => current + 1);
    }, 60_000);

    function refreshOnFocus() {
      setCalendarRefreshToken((current) => current + 1);
    }

    window.addEventListener("focus", refreshOnFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [startDate, template, userEmail, workStart]);

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
    setCalendarConflicts([]);
    setCalendarStatus("");
    previousBusySignature.current = "";
  }

  function handleLanguageSelection(nextLanguage: Language) {
    setLanguage(nextLanguage);
    window.localStorage.setItem(languageStorageKey, nextLanguage);
  }

  function handleTemplateSelection(value: string) {
    setTemplateId(value);
    setSyncStatus("");
    setDraftEdits({});
    setSelectedEventId("");
  }

  function handleStartDateInput(value: string) {
    setStartDate(value);
    setSyncStatus("");
    setDraftEdits({});
    setSelectedEventId("");
  }

  function handleWorkStartInput(value: string) {
    setWorkStart(value);
    setSyncStatus("");
    setDraftEdits({});
    setSelectedEventId("");
  }

  function handleWeekendPreferenceInput(checked: boolean) {
    setAvoidWeekends(checked);
    setSyncStatus("");
    setDraftEdits({});
    setSelectedEventId("");
  }

  function updateDraftEvent(id: string, patch: Partial<DraftEventEdit>) {
    const event = draftEvents.find((item) => item.id === id);

    if (!event) {
      return;
    }

    setDraftEdits((current) => {
      const baseEdit = {
        name: event.name,
        date: formatDateInput(event.date),
        time: formatTimeInput(event.date),
        durationMinutes: event.durationMinutes,
      };

      return {
        ...current,
        [id]: {
          ...baseEdit,
          ...current[id],
          ...patch,
        },
      };
    });
    setSyncStatus("");
  }

  async function handleCalendarSync() {
    if (!userEmail) {
      setSyncStatus(t.connectBeforeSync);
      return;
    }

    setIsSyncing(true);
    setSyncStatus(t.syncingCalendar);

    try {
      if (template) {
        const result = await fetchCalendarConflicts(
          template,
          startDate,
          language,
        );

        if (result.busySignature !== previousBusySignature.current) {
          previousBusySignature.current = result.busySignature;
          setCalendarConflicts(result.conflicts);
          setCalendarStatus(t.calendarConflictsLoaded);
          setDraftEdits({});
          setSelectedEventId("");
          setSyncStatus(t.calendarConflictsChanged);
          return;
        }
      }

      const response = await fetch("/api/calendar/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          events: draftEvents.map((event) => ({
            category: event.category,
            conflict: event.conflict,
            date: formatLocalDateTime(event.date),
            dayOffset: event.dayOffset,
            durationMinutes: event.durationMinutes,
            id: event.id,
            name: event.name,
            protocol: event.protocol,
          })),
          run: {
            avoidWeekends,
            preferredStartTime: workStart,
            startDate,
            templateName: template?.name ?? "Untitled experiment",
          },
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.duplicate ? t.duplicateSync : data?.error ?? t.calendarSyncFailed,
        );
      }

      const createdCount = data?.createdEvents?.length ?? draftEvents.length;
      const successMessage =
        language === "ko"
          ? `${createdCount}${t.calendarSyncComplete}`
          : `${createdCount} ${t.calendarSyncComplete}`;
      setSyncStatus(
        data?.persistenceWarning
          ? `${successMessage} ${t.calendarPersistenceWarning}`
          : successMessage,
      );
    } catch (error) {
      setSyncStatus(
        error instanceof Error ? error.message : t.calendarSyncFailed,
      );
    } finally {
      setIsSyncing(false);
    }
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
                  onClick={() => handleLanguageSelection("en")}
                >
                  EN
                </button>
                <button
                  className={`border px-2 py-1 text-xs font-semibold ${
                    language === "ko"
                      ? "border-[#2f6f4e] bg-[#2f6f4e] text-white"
                      : "border-[#d8e2d4] text-[#405347]"
                  }`}
                  onClick={() => handleLanguageSelection("ko")}
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
              <span className="block text-[#637568]">{t.warnings}</span>
              <strong className="mt-1 block text-2xl">{warningCount}</strong>
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
                  {canGenerateSchedule ? (
                    <button
                      onClick={() =>
                        setCalendarRefreshToken((current) => current + 1)
                      }
                      className="w-full border border-[#bfd0c4] bg-white px-4 py-2 text-sm font-semibold text-[#405347] transition hover:bg-[#eef5ef]"
                    >
                      {t.refreshCalendarConflicts}
                    </button>
                  ) : null}
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
              {calendarStatus ? (
                <p className="mt-3 text-sm font-medium text-[#2f6f4e]" role="status">
                  {calendarStatus}
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
                onClick={handleCalendarSync}
                disabled={!canGenerateSchedule || isSyncing}
                className="w-full border border-[#2f6f4e] bg-[#2f6f4e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#25583f] disabled:cursor-not-allowed disabled:border-[#bfd0c4] disabled:bg-[#d8e2d4] disabled:text-[#66756b] sm:w-auto"
              >
                {isSyncing ? t.syncingCalendar : t.prepareCalendarSync}
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
              <div className="grid gap-5 p-5 xl:grid-cols-[1fr_280px]">
                <div>
                  <h3 className="text-base font-semibold text-[#17211b]">{t.draftCalendar}</h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {draftDates.map((dateKey) => (
                      <section
                        key={dateKey}
                        className="min-h-40 border border-[#d8e2d4] bg-[#fbfdf9]"
                      >
                        <div className="border-b border-[#d8e2d4] px-3 py-2">
                          <p className="text-sm font-semibold text-[#2f6f4e]">
                            {formatDate(new Date(`${dateKey}T00:00:00`), language)}
                          </p>
                        </div>
                        <div className="space-y-2 p-3">
                          {groupedDraftEvents[dateKey].map((event) => (
                            <button
                              key={event.id}
                              onClick={() => setSelectedEventId(event.id)}
                              className={`w-full border px-3 py-2 text-left transition ${
                                selectedEventId === event.id
                                  ? "border-[#2f6f4e] bg-[#eef5ef]"
                                  : "border-[#d8e2d4] bg-white hover:border-[#8fad99]"
                              }`}
                            >
                              <span className="block text-xs font-semibold text-[#2f6f4e]">
                                {formatTime(event.date, language)} ·{" "}
                                {formatDuration(event.durationMinutes, language)}
                              </span>
                              <span className="mt-1 block text-sm font-semibold text-[#17211b]">
                                {event.name}
                              </span>
                              <span className="mt-1 inline-block border border-[#d8e2d4] px-2 py-0.5 text-xs text-[#55675c]">
                                {t.categories[event.category]}
                              </span>
                              {event.warnings.length ? (
                                <span className="mt-2 block text-xs font-medium text-[#8a4b16]">
                                  {t.warnings}: {event.warnings.length}
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>

                <aside className="border border-[#d8e2d4] bg-[#f8faf7] p-4">
                  <h3 className="text-base font-semibold text-[#17211b]">{t.editEvent}</h3>
                  {selectedEvent ? (
                    <div className="mt-4 space-y-4">
                      <label className="block text-sm font-semibold text-[#26382d]">
                        {t.eventName}
                        <input
                          className="mt-2 w-full border border-[#bfd0c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f6f4e]"
                          value={selectedEvent.name}
                          onChange={(event) =>
                            updateDraftEvent(selectedEvent.id, {
                              name: event.currentTarget.value,
                            })
                          }
                        />
                      </label>

                      <label className="block text-sm font-semibold text-[#26382d]">
                        {t.eventDate}
                        <input
                          className="mt-2 w-full border border-[#bfd0c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f6f4e]"
                          type="date"
                          value={formatDateInput(selectedEvent.date)}
                          onChange={(event) =>
                            updateDraftEvent(selectedEvent.id, {
                              date: event.currentTarget.value,
                            })
                          }
                        />
                      </label>

                      <label className="block text-sm font-semibold text-[#26382d]">
                        {t.eventTime}
                        <input
                          className="mt-2 w-full border border-[#bfd0c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f6f4e]"
                          type="time"
                          value={formatTimeInput(selectedEvent.date)}
                          onChange={(event) =>
                            updateDraftEvent(selectedEvent.id, {
                              time: event.currentTarget.value,
                            })
                          }
                        />
                      </label>

                      <label className="block text-sm font-semibold text-[#26382d]">
                        {t.eventDuration}
                        <input
                          className="mt-2 w-full border border-[#bfd0c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f6f4e]"
                          min="1"
                          type="number"
                          value={selectedEvent.durationMinutes}
                          onChange={(event) =>
                            updateDraftEvent(selectedEvent.id, {
                              durationMinutes: Math.max(
                                1,
                                Number(event.currentTarget.value),
                              ),
                            })
                          }
                        />
                      </label>

                      <div className="border border-[#d8e2d4] bg-white p-3 text-sm leading-6 text-[#66756b]">
                        <p>
                          {t.day} {selectedEvent.dayOffset}
                        </p>
                        <p>
                          {t.protocolPlaceholder}: {selectedEvent.protocol}
                        </p>
                        {selectedEvent.conflict ? (
                          <p className="font-medium text-[#8a4b16]">
                            {t.conflictAvoided}: {selectedEvent.conflict}
                          </p>
                        ) : null}
                        {selectedEvent.warnings.length ? (
                          <div className="mt-2 border-t border-[#d8e2d4] pt-2">
                            <p className="font-semibold text-[#8a4b16]">
                              {t.warnings}
                            </p>
                            <ul className="mt-1 space-y-1">
                              {selectedEvent.warnings.map((warning) => (
                                <li key={warning}>
                                  {formatWarning(warning, t.warningMessages)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm leading-6 text-[#66756b]">
                      {t.selectEventToEdit}
                    </p>
                  )}
                </aside>
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
