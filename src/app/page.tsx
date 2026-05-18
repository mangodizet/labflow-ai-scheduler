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
  getCurrentUserProfile,
  signInWithGoogleCalendar,
  signOut,
} from "@/lib/supabase/auth";
import {
  createSupabaseBrowserClient,
  hasSupabaseBrowserConfig,
} from "@/lib/supabase/client";

type ExperimentTemplate = {
  id: string;
  name: string;
  summary: string;
  steps: Step[];
  source?: "local" | "supabase";
};

type TemplateDraftStep = Step & {
  id: string;
};

const templates: ExperimentTemplate[] = [
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
type DayPeriod = "AM" | "PM";

const languageStorageKey = "labflow-language";
const customTemplateStorageKey = "labflow-custom-templates";
const thp1ProtocolSample = `THP-1 Differentiation and Polarization in 2D
M0 Differentiation
1. Measure cell density and viability of THP-1 monocytes.
2. Spin cells at 300 g for 5 minutes.
3. Aspirate media and resuspend cells in RPMI.
4. Add RPMI + 100 ng/mL PMA to flask.
5. Plate cells at 300k/mL.
6. Culture for 2 days.
7. Aspirate media, wash with PBS, add fresh RPMI, and culture for 2 more days.
M2 Polarization
8. Aspirate media. Add RPMI + 20 ng/mL IL-4 and 20 ng/mL IL-13.
9. Culture for 3 days.`;

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

type TemplateBuilderState = {
  name: string;
  summary: string;
  steps: TemplateDraftStep[];
};

type ExperimentTemplateRow = {
  id: string;
  name: string;
  summary: string | null;
};

type WorkflowStepRow = {
  category: string;
  day_offset: number;
  duration_minutes: number;
  name: string;
  protocol_label: string | null;
  sort_order: number;
  template_id: string;
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
    templateBuilder: "Template builder",
    protocolQuickBuilder: "Protocol quick builder",
    protocolQuickBuilderDescription:
      "Paste a rough protocol and generate an editable schedule draft. The sample below follows the THP-1 PDF workflow.",
    protocolText: "Protocol text",
    loadPdfSample: "Load THP-1 PDF sample",
    generateDraftFromProtocol: "Generate draft",
    protocolDraftGenerated: "Draft generated. Review the steps, then save the template.",
    protocolDraftNeedsText: "Paste or load protocol text first.",
    templateName: "Template name",
    templateSummary: "Template summary",
    addTemplateStep: "Add step",
    saveTemplate: "Save template",
    updateTemplate: "Update template",
    savingTemplate: "Saving...",
    editSelectedTemplate: "Edit selected",
    deleteSelectedTemplate: "Delete selected",
    deletingTemplate: "Deleting...",
    cancelTemplateEdit: "Cancel edit",
    templateSyncFailed:
      "Unable to load saved templates. Local templates are still available.",
    templateSaved: "Template saved.",
    templateUpdated: "Template updated.",
    templateDeleted: "Template deleted.",
    templateSaveFailed: "Unable to save the template.",
    templateDeleteFailed: "Unable to delete the template.",
    templateNeedsName: "Add a template name and at least one step name.",
    removeStep: "Remove",
    stepName: "Step name",
    dayOffset: "Day offset",
    category: "Category",
    protocol: "Protocol",
    startDate: "Start date",
    preferredStartTime: "Preferred start time",
    preferredTimePlaceholder: "9:00",
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
    deleteCalendarSync: "Delete synced events",
    syncingCalendar: "Syncing...",
    deletingCalendar: "Deleting...",
    calendarSyncComplete: "events were added to Google Calendar.",
    calendarSyncSkipped: "events already existed and were skipped.",
    calendarSyncFailed: "Unable to sync Google Calendar.",
    calendarDeleteComplete: "events were deleted from Google Calendar.",
    calendarDeleteSkipped: "events were already missing.",
    calendarDeleteFailed: "Unable to delete synced Google Calendar events.",
    calendarDeleteRefreshHint:
      "Google Calendar may take a moment to update the visible calendar.",
    calendarPersistenceWarning:
      "Calendar events were created, but Supabase could not save the sync record.",
    calendarDeletePersistenceWarning:
      "Calendar events were deleted, but Supabase could not remove the sync record.",
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
    templateBuilder: "템플릿 만들기",
    protocolQuickBuilder: "프로토콜 빠른 생성",
    protocolQuickBuilderDescription:
      "대략적인 프로토콜을 붙여넣으면 수정 가능한 일정 초안을 만듭니다. 아래 샘플은 THP-1 PDF 워크플로우 기준입니다.",
    protocolText: "프로토콜 텍스트",
    loadPdfSample: "THP-1 PDF 샘플 불러오기",
    generateDraftFromProtocol: "초안 생성",
    protocolDraftGenerated: "초안을 생성했습니다. 단계를 확인한 뒤 템플릿으로 저장하세요.",
    protocolDraftNeedsText: "먼저 프로토콜 텍스트를 붙여넣거나 샘플을 불러오세요.",
    templateName: "템플릿 이름",
    templateSummary: "템플릿 설명",
    addTemplateStep: "단계 추가",
    saveTemplate: "템플릿 저장",
    updateTemplate: "템플릿 수정 저장",
    savingTemplate: "저장 중...",
    editSelectedTemplate: "선택 템플릿 수정",
    deleteSelectedTemplate: "선택 템플릿 삭제",
    deletingTemplate: "삭제 중...",
    cancelTemplateEdit: "수정 취소",
    templateSyncFailed:
      "저장된 템플릿을 불러오지 못했습니다. 로컬 템플릿은 계속 사용할 수 있습니다.",
    templateSaved: "템플릿을 저장했습니다.",
    templateUpdated: "템플릿을 수정했습니다.",
    templateDeleted: "템플릿을 삭제했습니다.",
    templateSaveFailed: "템플릿 저장에 실패했습니다.",
    templateDeleteFailed: "템플릿 삭제에 실패했습니다.",
    templateNeedsName: "템플릿 이름과 단계 이름을 하나 이상 입력하세요.",
    removeStep: "삭제",
    stepName: "단계 이름",
    dayOffset: "Day offset",
    category: "카테고리",
    protocol: "프로토콜",
    startDate: "시작 날짜",
    preferredStartTime: "희망 시작 시간",
    preferredTimePlaceholder: "9:00",
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
    deleteCalendarSync: "동기화된 일정 삭제",
    syncingCalendar: "동기화 중...",
    deletingCalendar: "삭제 중...",
    calendarSyncComplete: "개의 이벤트를 Google Calendar에 추가했습니다.",
    calendarSyncSkipped: "개의 기존 이벤트는 건너뛰었습니다.",
    calendarSyncFailed: "Google Calendar 동기화에 실패했습니다.",
    calendarDeleteComplete: "개의 이벤트를 Google Calendar에서 삭제했습니다.",
    calendarDeleteSkipped: "개의 이벤트는 이미 삭제되어 있었습니다.",
    calendarDeleteFailed: "동기화된 Google Calendar 이벤트 삭제에 실패했습니다.",
    calendarDeleteRefreshHint:
      "Google Calendar 화면 반영에는 잠시 걸릴 수 있습니다.",
    calendarPersistenceWarning:
      "캘린더 이벤트는 생성됐지만 Supabase에 동기화 기록을 저장하지 못했습니다.",
    calendarDeletePersistenceWarning:
      "캘린더 이벤트는 삭제됐지만 Supabase 동기화 기록을 삭제하지 못했습니다.",
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

function readBrowserStorage(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeBrowserStorage(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Some browsers disable localStorage in private or embedded contexts.
  }
}

function createStableClientId(fallback: string) {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to a timestamp-based id for older or restricted browsers.
  }

  return `${fallback}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getClientTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function formatDate(date: Date, language: Language) {
  try {
    return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return formatDateInput(date);
  }
}

function formatTime(date: Date, language: Language) {
  try {
    return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return formatTimeInput(date);
  }
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

function formatPreferredTimeText(hour12: number, minute: number) {
  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function convertHour24ToPreferredTime(hour24: number, minute: number) {
  const period: DayPeriod = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return {
    period,
    text: formatPreferredTimeText(hour12, minute),
  };
}

function sanitizePreferredTimeInput(value: string) {
  return value.replace(/[^\d:]/g, "").slice(0, 5);
}

function buildPreferredTimeResult({
  currentPeriod,
  displayText,
  inferPeriodFromHour = false,
  hour24,
  minute,
}: {
  currentPeriod: DayPeriod;
  displayText: string;
  inferPeriodFromHour?: boolean;
  hour24: number;
  minute: number;
}) {
  const normalizedHour24 = hour24 === 24 && minute === 0 ? 0 : hour24;

  if (
    normalizedHour24 < 0 ||
    normalizedHour24 > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return {
      complete: false,
      period: currentPeriod,
      text: displayText,
      value: null,
    };
  }

  const converted =
    inferPeriodFromHour || normalizedHour24 > 12 || normalizedHour24 === 0
      ? convertHour24ToPreferredTime(normalizedHour24, minute)
      : {
          period: currentPeriod,
          text: formatPreferredTimeText(normalizedHour24, minute),
        };

  const valueHour =
    converted.period === "AM"
      ? normalizedHour24 === 12
        ? 0
        : normalizedHour24
      : normalizedHour24 > 12
        ? normalizedHour24
        : normalizedHour24 === 12
          ? 12
          : normalizedHour24 + 12;

  return {
    complete: true,
    period: converted.period,
    text: converted.text,
    value: `${String(valueHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function resolvePreferredTimeInput(value: string, currentPeriod: DayPeriod = "AM") {
  const text = sanitizePreferredTimeInput(value);
  const digits = text.replace(/\D/g, "").slice(0, 4);

  if (!digits) {
    return {
      complete: false,
      period: currentPeriod,
      text: "",
      value: null,
    };
  }

  if (text.includes(":")) {
    const [hourText, minuteText = ""] = text.split(":");

    if (!hourText || minuteText.length !== 2) {
      return {
        complete: false,
        period: currentPeriod,
        text,
        value: null,
      };
    }

    return buildPreferredTimeResult({
      currentPeriod,
      displayText: text,
      hour24: Number(hourText),
      minute: Number(minuteText),
    });
  }

  if (digits.length <= 2) {
    const hour = Number(digits);

    return buildPreferredTimeResult({
      currentPeriod,
      displayText: text,
      hour24: hour,
      minute: 0,
    });
  }

  const hourDigits = digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2);
  const minuteDigits = digits.length === 3 ? digits.slice(1) : digits.slice(2);
  const hour = Number(hourDigits);
  const minute = Number(minuteDigits);

  return buildPreferredTimeResult({
    currentPeriod,
    displayText: text,
    inferPeriodFromHour: true,
    hour24: hour,
    minute,
  });
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

function getScheduleTimeRange(template: ExperimentTemplate, startDate: string) {
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

  return readBrowserStorage(languageStorageKey) === "ko" ? "ko" : "en";
}

function createTemplateDraftStep(): TemplateDraftStep {
  return {
    id: createStableClientId("step"),
    name: "",
    dayOffset: 0,
    durationMinutes: 30,
    category: "Hands-on",
    protocol: "",
  };
}

function createInitialTemplateBuilder(): TemplateBuilderState {
  return {
    name: "",
    summary: "",
    steps: [createTemplateDraftStep()],
  };
}

function createDraftStep(step: Omit<Step, "protocol"> & { protocol?: string }) {
  return {
    ...step,
    id: createStableClientId(`${step.dayOffset}-${step.name}`),
    protocol: step.protocol ?? step.name,
  };
}

function createThp1M2ProtocolDraft(): TemplateBuilderState {
  return {
    name: "THP-1 M0 Differentiation + M2 Polarization",
    summary:
      "Generated from the THP-1 2D differentiation and polarization protocol. Default path uses M0 differentiation followed by M2 polarization.",
    steps: [
      createDraftStep({
        category: "Hands-on",
        dayOffset: 0,
        durationMinutes: 30,
        name: "Cell Density and Viability Check",
        protocol: "Measure THP-1 density and viability. Target viability > 90%.",
      }),
      createDraftStep({
        category: "Hands-on",
        dayOffset: 0,
        durationMinutes: 75,
        name: "PMA Differentiation Setup",
        protocol:
          "Spin cells, aspirate media, resuspend in RPMI, add 100 ng/mL PMA, and plate at 300k/mL.",
      }),
      createDraftStep({
        category: "Incubation",
        dayOffset: 2,
        durationMinutes: 15,
        name: "M0 Culture Checkpoint",
        protocol: "Culture for 2 days after PMA setup before media change.",
      }),
      createDraftStep({
        category: "Hands-on",
        dayOffset: 2,
        durationMinutes: 45,
        name: "PBS Wash and Fresh RPMI",
        protocol: "Aspirate media, wash with PBS, add fresh RPMI, and continue culture.",
      }),
      createDraftStep({
        category: "Incubation",
        dayOffset: 4,
        durationMinutes: 15,
        name: "M0 Ready Check",
        protocol: "After 2 more days of culture, cells are ready as M0 or for M1/M2 polarization.",
      }),
      createDraftStep({
        category: "Hands-on",
        dayOffset: 4,
        durationMinutes: 45,
        name: "M2 Polarization Setup",
        protocol: "Aspirate media and add RPMI with 20 ng/mL IL-4 and 20 ng/mL IL-13.",
      }),
      createDraftStep({
        category: "Assay",
        dayOffset: 7,
        durationMinutes: 30,
        name: "M2 Polarization Endpoint",
        protocol: "Culture for 3 days after IL-4/IL-13 treatment, then proceed with endpoint checks.",
      }),
    ],
  };
}

function parseProtocolTextToDraft(protocolText: string): TemplateBuilderState {
  const normalizedText = protocolText.toLowerCase();

  if (
    normalizedText.includes("thp-1") &&
    normalizedText.includes("pma") &&
    (normalizedText.includes("il-4") || normalizedText.includes("il4"))
  ) {
    return createThp1M2ProtocolDraft();
  }

  const parsedSteps = protocolText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const dayMatch = /\b(?:day|d)\s*(\d+)\b/i.exec(line);
      const hourMatch = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i.exec(line);
      const minuteMatch = /(\d+)\s*(?:m|min|mins|minute|minutes)\b/i.exec(line);
      const lowerLine = line.toLowerCase();

      return createDraftStep({
        category: lowerLine.includes("assay")
          ? "Assay"
          : lowerLine.includes("culture") || lowerLine.includes("incubat")
            ? "Incubation"
            : "Hands-on",
        dayOffset: dayMatch ? Number(dayMatch[1]) : index,
        durationMinutes: hourMatch
          ? Math.max(1, Math.round(Number(hourMatch[1]) * 60))
          : minuteMatch
            ? Math.max(1, Number(minuteMatch[1]))
            : lowerLine.includes("culture")
              ? 15
              : 30,
        name: line.replace(/^\d+\.\s*/, "").slice(0, 80),
        protocol: line,
      });
    });

  return {
    name: "Custom Protocol Draft",
    summary: "Generated from pasted protocol text. Review timing before saving.",
    steps: parsedSteps.length ? parsedSteps : [createTemplateDraftStep()],
  };
}

function isStepCategory(value: unknown): value is Step["category"] {
  return value === "Hands-on" || value === "Incubation" || value === "Assay";
}

function normalizeStoredTemplate(template: ExperimentTemplate): ExperimentTemplate {
  return {
    id: template.id,
    name: template.name,
    source: "local",
    steps: template.steps
      .filter((step) => typeof step?.name === "string")
      .map((step) => ({
        category: isStepCategory(step.category) ? step.category : "Hands-on",
        dayOffset: Math.max(0, Math.floor(Number(step.dayOffset) || 0)),
        durationMinutes: Math.max(1, Math.floor(Number(step.durationMinutes) || 1)),
        name: step.name.trim(),
        protocol:
          typeof step.protocol === "string" && step.protocol.trim()
            ? step.protocol.trim()
            : step.name.trim(),
      })),
    summary: template.summary,
  };
}

function readCustomTemplates(): ExperimentTemplate[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(readBrowserStorage(customTemplateStorageKey) ?? "[]");

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (template): template is ExperimentTemplate =>
        typeof template?.id === "string" &&
        typeof template.name === "string" &&
        typeof template.summary === "string" &&
        Array.isArray(template.steps),
    ).map(normalizeStoredTemplate);
  } catch {
    return [];
  }
}

function writeLocalTemplates(customTemplates: ExperimentTemplate[]) {
  const localTemplates = customTemplates
    .filter((template) => template.source !== "supabase")
    .map((template) => ({
      id: template.id,
      name: template.name,
      source: "local",
      steps: template.steps,
      summary: template.summary,
    }));

  writeBrowserStorage(customTemplateStorageKey, JSON.stringify(localTemplates));
}

async function loadSupabaseTemplates(): Promise<ExperimentTemplate[]> {
  const supabase = createSupabaseBrowserClient();
  const { data: templateRows, error: templateError } = await supabase
    .from("experiment_templates")
    .select("id, name, summary")
    .order("created_at", { ascending: true });

  if (templateError) {
    throw templateError;
  }

  const templatesById = new Map<string, ExperimentTemplate>(
    ((templateRows ?? []) as ExperimentTemplateRow[]).map((template) => [
      template.id,
      {
        id: template.id,
        name: template.name,
        source: "supabase",
        steps: [],
        summary: template.summary ?? "",
      },
    ]),
  );

  if (!templatesById.size) {
    return [];
  }

  const { data: stepRows, error: stepError } = await supabase
    .from("workflow_steps")
    .select(
      "template_id, name, day_offset, duration_minutes, category, protocol_label, sort_order",
    )
    .in("template_id", [...templatesById.keys()])
    .order("sort_order", { ascending: true });

  if (stepError) {
    throw stepError;
  }

  for (const step of (stepRows ?? []) as WorkflowStepRow[]) {
    const template = templatesById.get(step.template_id);

    if (!template) {
      continue;
    }

    template.steps.push({
      category: isStepCategory(step.category) ? step.category : "Hands-on",
      dayOffset: step.day_offset,
      durationMinutes: step.duration_minutes,
      name: step.name,
      protocol: step.protocol_label ?? step.name,
    });
  }

  return [...templatesById.values()].filter((template) => template.steps.length);
}

async function saveSupabaseTemplate(
  template: ExperimentTemplate,
  userId: string,
  templateId?: string,
): Promise<ExperimentTemplate> {
  const supabase = createSupabaseBrowserClient();
  let savedTemplateId = templateId;

  if (savedTemplateId) {
    const { error } = await supabase
      .from("experiment_templates")
      .update({
        name: template.name,
        summary: template.summary,
        updated_at: new Date().toISOString(),
      })
      .eq("id", savedTemplateId)
      .eq("user_id", userId);

    if (error) {
      throw error;
    }
  } else {
    const { data, error } = await supabase
      .from("experiment_templates")
      .insert({
        name: template.name,
        summary: template.summary,
        user_id: userId,
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    savedTemplateId = data.id as string;
  }

  if (!savedTemplateId) {
    throw new Error("Template save did not return an id.");
  }

  const { error: deleteStepsError } = await supabase
    .from("workflow_steps")
    .delete()
    .eq("template_id", savedTemplateId)
    .eq("user_id", userId);

  if (deleteStepsError) {
    throw deleteStepsError;
  }

  const { error: insertStepsError } = await supabase.from("workflow_steps").insert(
    template.steps.map((step, index) => ({
      category: step.category,
      day_offset: step.dayOffset,
      duration_minutes: step.durationMinutes,
      name: step.name,
      protocol_label: step.protocol,
      sort_order: index,
      template_id: savedTemplateId,
      user_id: userId,
    })),
  );

  if (insertStepsError) {
    throw insertStepsError;
  }

  return {
    ...template,
    id: savedTemplateId,
    source: "supabase",
  };
}

async function deleteSupabaseTemplate(templateId: string, userId: string) {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from("experiment_templates")
    .delete()
    .eq("id", templateId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

async function fetchCalendarConflicts(
  template: ExperimentTemplate,
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
  const [customTemplates, setCustomTemplates] = useState<ExperimentTemplate[]>([]);
  const [customTemplatesLoaded, setCustomTemplatesLoaded] = useState(false);
  const [templateBuilder, setTemplateBuilder] = useState<TemplateBuilderState>(
    createInitialTemplateBuilder,
  );
  const [templateBuilderStatus, setTemplateBuilderStatus] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false);
  const [protocolText, setProtocolText] = useState(thp1ProtocolSample);
  const [templateId, setTemplateId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [preferredPeriod, setPreferredPeriod] = useState<DayPeriod>("AM");
  const [preferredTimeText, setPreferredTimeText] = useState("");
  const [workStart, setWorkStart] = useState("");
  const [avoidWeekends, setAvoidWeekends] = useState(true);
  const [syncStatus, setSyncStatus] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeletingSync, setIsDeletingSync] = useState(false);
  const [authStatus, setAuthStatus] = useState("");
  const [calendarStatus, setCalendarStatus] = useState("");
  const [calendarConflicts, setCalendarConflicts] = useState<CalendarConflict[]>([]);
  const [calendarRefreshToken, setCalendarRefreshToken] = useState(0);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string, DraftEventEdit>>({});
  const [selectedEventId, setSelectedEventId] = useState("");
  const previousBusySignature = useRef("");
  const t = copy[language];

  const allTemplates = useMemo(
    () => [...templates, ...customTemplates],
    [customTemplates],
  );
  const template = allTemplates.find((item) => item.id === templateId);
  const isCustomTemplateSelected = Boolean(
    templateId && customTemplates.some((item) => item.id === templateId),
  );
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
    const timeoutId = window.setTimeout(() => {
      const localTemplates = readCustomTemplates();
      setCustomTemplates((current) => [
        ...current.filter((template) => template.source === "supabase"),
        ...localTemplates,
      ]);
      setCustomTemplatesLoaded(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      if (!canConnectGoogle) {
        return;
      }

      try {
        const profile = await getCurrentUserProfile();

        if (isMounted) {
          setUserEmail(profile?.email ?? null);
          setUserId(profile?.id ?? null);
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
    writeBrowserStorage(languageStorageKey, language);
  }, [language]);

  useEffect(() => {
    if (!customTemplatesLoaded) {
      return;
    }

    writeLocalTemplates(customTemplates);
  }, [customTemplates, customTemplatesLoaded]);

  useEffect(() => {
    let isMounted = true;

    async function loadSavedTemplates() {
      if (!userId) {
        setCustomTemplates((current) =>
          current.filter((template) => template.source !== "supabase"),
        );
        return;
      }

      try {
        const savedTemplates = await loadSupabaseTemplates();

        if (isMounted) {
          setCustomTemplates((current) => [
            ...current.filter((template) => template.source !== "supabase"),
            ...savedTemplates,
          ]);
        }
      } catch {
        if (isMounted) {
          setTemplateBuilderStatus(t.templateSyncFailed);
        }
      }
    }

    void loadSavedTemplates();

    return () => {
      isMounted = false;
    };
  }, [t.templateSyncFailed, userId]);

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
    setUserId(null);
    setAuthStatus(t.disconnected);
    setCalendarConflicts([]);
    setCalendarStatus("");
    previousBusySignature.current = "";
  }

  function handleLanguageSelection(nextLanguage: Language) {
    setLanguage(nextLanguage);
    writeBrowserStorage(languageStorageKey, nextLanguage);
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

  function handlePreferredTimeTextInput(value: string) {
    const nextText = sanitizePreferredTimeInput(value);

    setPreferredTimeText(nextText);
    handleWorkStartInput("");
  }

  function handlePreferredPeriodInput(period: DayPeriod) {
    setPreferredPeriod(period);
    const nextSelection = resolvePreferredTimeInput(preferredTimeText, period);
    handleWorkStartInput(nextSelection.value ?? "");
  }

  function commitPreferredTimeInput() {
    const nextSelection = resolvePreferredTimeInput(
      preferredTimeText,
      preferredPeriod,
    );

    if (!nextSelection.complete) {
      return;
    }

    setPreferredPeriod(nextSelection.period);
    setPreferredTimeText(nextSelection.text);
    handleWorkStartInput(nextSelection.value ?? "");
  }

  function handlePreferredTimeKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      commitPreferredTimeInput();
    }
  }

  function handleWeekendPreferenceInput(checked: boolean) {
    setAvoidWeekends(checked);
    setSyncStatus("");
    setDraftEdits({});
    setSelectedEventId("");
  }

  function updateTemplateBuilder(patch: Partial<TemplateBuilderState>) {
    setTemplateBuilder((current) => ({
      ...current,
      ...patch,
    }));
    setTemplateBuilderStatus("");
  }

  function updateTemplateBuilderStep(
    id: string,
    patch: Partial<Omit<TemplateDraftStep, "id">>,
  ) {
    setTemplateBuilder((current) => ({
      ...current,
      steps: current.steps.map((step) =>
        step.id === id
          ? {
              ...step,
              ...patch,
            }
          : step,
      ),
    }));
    setTemplateBuilderStatus("");
  }

  function addTemplateBuilderStep() {
    setTemplateBuilder((current) => ({
      ...current,
      steps: [...current.steps, createTemplateDraftStep()],
    }));
    setTemplateBuilderStatus("");
  }

  function removeTemplateBuilderStep(id: string) {
    setTemplateBuilder((current) => ({
      ...current,
      steps:
        current.steps.length > 1
          ? current.steps.filter((step) => step.id !== id)
          : current.steps,
    }));
    setTemplateBuilderStatus("");
  }

  function generateTemplateDraftFromProtocol() {
    const text = protocolText.trim();

    if (!text) {
      setTemplateBuilderStatus(t.protocolDraftNeedsText);
      return;
    }

    setEditingTemplateId(null);
    setTemplateBuilder(parseProtocolTextToDraft(text));
    setTemplateBuilderStatus(t.protocolDraftGenerated);
  }

  function editSelectedTemplate() {
    const selectedTemplate = customTemplates.find((item) => item.id === templateId);

    if (!selectedTemplate) {
      return;
    }

    setEditingTemplateId(selectedTemplate.id);
    setTemplateBuilder({
      name: selectedTemplate.name,
      summary: selectedTemplate.summary,
      steps: selectedTemplate.steps.map((step) => ({
        ...step,
        id: createStableClientId(
          `${selectedTemplate.id}-${step.dayOffset}-${step.name}`,
        ),
      })),
    });
    setTemplateBuilderStatus("");
  }

  function cancelTemplateEdit() {
    setEditingTemplateId(null);
    setTemplateBuilder(createInitialTemplateBuilder());
    setTemplateBuilderStatus("");
  }

  async function deleteSelectedTemplate() {
    if (isDeletingTemplate) {
      return;
    }

    const selectedTemplate = customTemplates.find((item) => item.id === templateId);

    if (!selectedTemplate) {
      return;
    }

    setIsDeletingTemplate(true);
    setTemplateBuilderStatus(t.deletingTemplate);

    try {
      if (selectedTemplate.source === "supabase" && userId) {
        await deleteSupabaseTemplate(selectedTemplate.id, userId);
      }
    } catch {
      setTemplateBuilderStatus(t.templateDeleteFailed);
      return;
    } finally {
      setIsDeletingTemplate(false);
    }

    setCustomTemplates((current) =>
      current.filter((item) => item.id !== selectedTemplate.id),
    );
    setTemplateId("");
    setEditingTemplateId((current) =>
      current === selectedTemplate.id ? null : current,
    );
    setTemplateBuilder(createInitialTemplateBuilder());
    setTemplateBuilderStatus(t.templateDeleted);
    setSyncStatus("");
    setDraftEdits({});
    setSelectedEventId("");
  }

  async function saveTemplateBuilder() {
    if (isSavingTemplate) {
      return;
    }

    const name = templateBuilder.name.trim();
    const steps = templateBuilder.steps
      .filter((step) => step.name.trim())
      .map((step) => ({
        name: step.name.trim(),
        dayOffset: Math.max(0, Math.floor(Number(step.dayOffset) || 0)),
        durationMinutes: Math.max(1, Math.floor(Number(step.durationMinutes) || 1)),
        category: step.category,
        protocol: step.protocol.trim() || step.name.trim(),
      }));

    if (!name || !steps.length) {
      setTemplateBuilderStatus(t.templateNeedsName);
      return;
    }

    const newTemplate: ExperimentTemplate = {
      id: editingTemplateId ?? `custom-${Date.now()}`,
      name,
      source: "local",
      summary: templateBuilder.summary.trim() || `${steps.length} custom steps.`,
      steps,
    };

    const editingTemplate = customTemplates.find(
      (item) => item.id === editingTemplateId,
    );

    let savedTemplate = newTemplate;

    setIsSavingTemplate(true);
    setTemplateBuilderStatus(t.savingTemplate);

    try {
      if (userId) {
        savedTemplate = await saveSupabaseTemplate(
          newTemplate,
          userId,
          editingTemplate?.source === "supabase" ? editingTemplate.id : undefined,
        );
      }
    } catch {
      setTemplateBuilderStatus(t.templateSaveFailed);
      return;
    } finally {
      setIsSavingTemplate(false);
    }

    setCustomTemplates((current) =>
      editingTemplateId
        ? current.map((item) => (item.id === editingTemplateId ? savedTemplate : item))
        : [...current, savedTemplate],
    );
    setTemplateId(savedTemplate.id);
    setTemplateBuilder(createInitialTemplateBuilder());
    setTemplateBuilderStatus(
      editingTemplateId ? t.templateUpdated : t.templateSaved,
    );
    setEditingTemplateId(null);
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

  function createCalendarPayload() {
    return {
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
      timeZone: getClientTimeZone(),
    };
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
        body: JSON.stringify(createCalendarPayload()),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.duplicate ? t.duplicateSync : data?.error ?? t.calendarSyncFailed,
        );
      }

      const createdCount =
        typeof data?.createdCount === "number"
          ? data.createdCount
          : data?.createdEvents?.length ?? draftEvents.length;
      const skippedCount =
        typeof data?.skippedCount === "number" ? data.skippedCount : 0;
      const successMessage =
        language === "ko"
          ? `${createdCount}${t.calendarSyncComplete}${
              skippedCount ? ` ${skippedCount}${t.calendarSyncSkipped}` : ""
            }`
          : `${createdCount} ${t.calendarSyncComplete}${
              skippedCount ? ` ${skippedCount} ${t.calendarSyncSkipped}` : ""
            }`;
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

  async function handleCalendarDelete() {
    if (!userEmail) {
      setSyncStatus(t.connectBeforeSync);
      return;
    }

    setIsDeletingSync(true);
    setSyncStatus(t.deletingCalendar);

    try {
      const response = await fetch("/api/calendar/events", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createCalendarPayload()),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? t.calendarDeleteFailed);
      }

      const deletedCount =
        typeof data?.deletedCount === "number" ? data.deletedCount : 0;
      const skippedCount =
        typeof data?.skippedCount === "number" ? data.skippedCount : 0;
      const successMessage =
        language === "ko"
          ? `${deletedCount}${t.calendarDeleteComplete}${
              skippedCount ? ` ${skippedCount}${t.calendarDeleteSkipped}` : ""
            }`
          : `${deletedCount} ${t.calendarDeleteComplete}${
              skippedCount ? ` ${skippedCount} ${t.calendarDeleteSkipped}` : ""
            }`;

      setSyncStatus(
        data?.persistenceWarning
          ? `${successMessage} ${t.calendarDeletePersistenceWarning} ${t.calendarDeleteRefreshHint}`
          : `${successMessage} ${t.calendarDeleteRefreshHint}`,
      );
    } catch (error) {
      setSyncStatus(
        error instanceof Error ? error.message : t.calendarDeleteFailed,
      );
    } finally {
      setIsDeletingSync(false);
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
                {allTemplates.map((item) => (
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
              {isCustomTemplateSelected ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    className="border border-[#bfd0c4] bg-white px-3 py-2 text-sm font-semibold text-[#405347] transition hover:bg-[#eef5ef]"
                    disabled={isSavingTemplate || isDeletingTemplate}
                    onClick={editSelectedTemplate}
                    type="button"
                  >
                    {t.editSelectedTemplate}
                  </button>
                  <button
                    className="border border-[#d8e2d4] bg-white px-3 py-2 text-sm font-semibold text-[#8a4b16] transition hover:bg-[#fff7ed] disabled:cursor-not-allowed disabled:bg-[#f1f4ef] disabled:text-[#8a968e]"
                    disabled={isSavingTemplate || isDeletingTemplate}
                    onClick={deleteSelectedTemplate}
                    type="button"
                  >
                    {isDeletingTemplate ? t.deletingTemplate : t.deleteSelectedTemplate}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="border border-[#d8e2d4] bg-[#f8faf7] p-4">
              <h2 className="text-sm font-semibold text-[#26382d]">
                {t.protocolQuickBuilder}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#66756b]">
                {t.protocolQuickBuilderDescription}
              </p>
              <label className="mt-3 block text-xs font-semibold text-[#405347]">
                {t.protocolText}
                <textarea
                  className="mt-1 min-h-44 w-full resize-y border border-[#bfd0c4] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#2f6f4e]"
                  value={protocolText}
                  onChange={(event) => setProtocolText(event.currentTarget.value)}
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  className="border border-[#bfd0c4] bg-white px-3 py-2 text-sm font-semibold text-[#405347] transition hover:bg-[#eef5ef]"
                  onClick={() => setProtocolText(thp1ProtocolSample)}
                  type="button"
                >
                  {t.loadPdfSample}
                </button>
                <button
                  className="border border-[#2f6f4e] bg-[#2f6f4e] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#25583f]"
                  onClick={generateTemplateDraftFromProtocol}
                  type="button"
                >
                  {t.generateDraftFromProtocol}
                </button>
              </div>
            </div>

            <div className="border border-[#d8e2d4] bg-[#f8faf7] p-4">
              <h2 className="text-sm font-semibold text-[#26382d]">
                {t.templateBuilder}
              </h2>
              <div className="mt-3 space-y-3">
                <label className="block text-xs font-semibold text-[#405347]">
                  {t.templateName}
                  <input
                    className="mt-1 w-full border border-[#bfd0c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f6f4e]"
                    value={templateBuilder.name}
                    onChange={(event) =>
                      updateTemplateBuilder({ name: event.currentTarget.value })
                    }
                  />
                </label>
                <label className="block text-xs font-semibold text-[#405347]">
                  {t.templateSummary}
                  <textarea
                    className="mt-1 min-h-20 w-full resize-y border border-[#bfd0c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f6f4e]"
                    value={templateBuilder.summary}
                    onChange={(event) =>
                      updateTemplateBuilder({ summary: event.currentTarget.value })
                    }
                  />
                </label>
                <div className="space-y-3">
                  {templateBuilder.steps.map((step, index) => (
                    <div key={step.id} className="border border-[#d8e2d4] bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#2f6f4e]">
                          {t.day} {index + 1}
                        </span>
                        <button
                          className="border border-[#d8e2d4] px-2 py-1 text-xs font-semibold text-[#66756b] transition hover:bg-[#eef5ef]"
                          onClick={() => removeTemplateBuilderStep(step.id)}
                          type="button"
                        >
                          {t.removeStep}
                        </button>
                      </div>
                      <label className="mt-3 block text-xs font-semibold text-[#405347]">
                        {t.stepName}
                        <input
                          className="mt-1 w-full border border-[#bfd0c4] px-2 py-1 text-sm outline-none focus:border-[#2f6f4e]"
                          value={step.name}
                          onChange={(event) =>
                            updateTemplateBuilderStep(step.id, {
                              name: event.currentTarget.value,
                            })
                          }
                        />
                      </label>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <label className="block text-xs font-semibold text-[#405347]">
                          {t.dayOffset}
                          <input
                            className="mt-1 w-full border border-[#bfd0c4] px-2 py-1 text-sm outline-none focus:border-[#2f6f4e]"
                            min="0"
                            type="number"
                            value={step.dayOffset}
                            onChange={(event) =>
                              updateTemplateBuilderStep(step.id, {
                                dayOffset: Math.max(
                                  0,
                                  Number(event.currentTarget.value),
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="block text-xs font-semibold text-[#405347]">
                          {t.eventDuration}
                          <input
                            className="mt-1 w-full border border-[#bfd0c4] px-2 py-1 text-sm outline-none focus:border-[#2f6f4e]"
                            min="1"
                            type="number"
                            value={step.durationMinutes}
                            onChange={(event) =>
                              updateTemplateBuilderStep(step.id, {
                                durationMinutes: Math.max(
                                  1,
                                  Number(event.currentTarget.value),
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2">
                        <label className="block text-xs font-semibold text-[#405347]">
                          {t.category}
                          <select
                            className="mt-1 w-full border border-[#bfd0c4] bg-white px-2 py-1 text-sm outline-none focus:border-[#2f6f4e]"
                            value={step.category}
                            onChange={(event) =>
                              updateTemplateBuilderStep(step.id, {
                                category: event.currentTarget.value as Step["category"],
                              })
                            }
                          >
                            <option value="Hands-on">{t.categories["Hands-on"]}</option>
                            <option value="Incubation">{t.categories.Incubation}</option>
                            <option value="Assay">{t.categories.Assay}</option>
                          </select>
                        </label>
                        <label className="block text-xs font-semibold text-[#405347]">
                          {t.protocol}
                          <input
                            className="mt-1 w-full border border-[#bfd0c4] px-2 py-1 text-sm outline-none focus:border-[#2f6f4e]"
                            value={step.protocol}
                            onChange={(event) =>
                              updateTemplateBuilderStep(step.id, {
                                protocol: event.currentTarget.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="border border-[#bfd0c4] bg-white px-3 py-2 text-sm font-semibold text-[#405347] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:bg-[#f1f4ef] disabled:text-[#8a968e]"
                    disabled={isSavingTemplate || isDeletingTemplate}
                    onClick={addTemplateBuilderStep}
                    type="button"
                  >
                    {t.addTemplateStep}
                  </button>
                  <button
                    className="border border-[#2f6f4e] bg-[#2f6f4e] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#25583f] disabled:cursor-not-allowed disabled:border-[#bfd0c4] disabled:bg-[#d8e2d4] disabled:text-[#66756b]"
                    disabled={isSavingTemplate || isDeletingTemplate}
                    onClick={saveTemplateBuilder}
                    type="button"
                  >
                    {isSavingTemplate
                      ? t.savingTemplate
                      : editingTemplateId
                        ? t.updateTemplate
                        : t.saveTemplate}
                  </button>
                </div>
                {editingTemplateId ? (
                  <button
                    className="w-full border border-[#d8e2d4] bg-white px-3 py-2 text-sm font-semibold text-[#66756b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:bg-[#f1f4ef] disabled:text-[#8a968e]"
                    disabled={isSavingTemplate || isDeletingTemplate}
                    onClick={cancelTemplateEdit}
                    type="button"
                  >
                    {t.cancelTemplateEdit}
                  </button>
                ) : null}
                {templateBuilderStatus ? (
                  <p className="text-sm font-medium text-[#2f6f4e]" role="status">
                    {templateBuilderStatus}
                  </p>
                ) : null}
              </div>
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
                <div className="mt-2 grid grid-cols-[auto_1fr] gap-2">
                  <div className="grid grid-cols-2 border border-[#bfd0c4] bg-white">
                    {(["AM", "PM"] as const).map((period) => (
                      <button
                        key={period}
                        className={`px-3 py-2 text-sm font-semibold transition ${
                          preferredPeriod === period
                            ? "bg-[#2f6f4e] text-white"
                            : "text-[#405347] hover:bg-[#eef5ef]"
                        }`}
                        onClick={() => handlePreferredPeriodInput(period)}
                        type="button"
                      >
                        {period}
                      </button>
                    ))}
                  </div>
                  <input
                    id="workStart"
                    inputMode="numeric"
                    placeholder={t.preferredTimePlaceholder}
                    value={preferredTimeText}
                    onChange={(event) => {
                      handlePreferredTimeTextInput(event.currentTarget.value);
                    }}
                    onBlur={commitPreferredTimeInput}
                    onKeyDown={handlePreferredTimeKeyDown}
                    className="w-full border border-[#bfd0c4] px-3 py-2 text-sm outline-none focus:border-[#2f6f4e]"
                  />
                </div>
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
            <div className="flex flex-col gap-3 border-b border-[#d8e2d4] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#17211b]">{t.generatedTimeline}</h2>
                <p className="text-sm text-[#66756b]">{t.previewBeforeCalendar}</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <button
                  onClick={handleCalendarDelete}
                  disabled={!canGenerateSchedule || isSyncing || isDeletingSync}
                  className="w-full border border-[#bfd0c4] bg-white px-4 py-2 text-sm font-semibold text-[#405347] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:border-[#d8e2d4] disabled:bg-[#f1f4ef] disabled:text-[#8a968e] sm:w-auto"
                >
                  {isDeletingSync ? t.deletingCalendar : t.deleteCalendarSync}
                </button>
                <button
                  onClick={handleCalendarSync}
                  disabled={!canGenerateSchedule || isSyncing || isDeletingSync}
                  className="w-full border border-[#2f6f4e] bg-[#2f6f4e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#25583f] disabled:cursor-not-allowed disabled:border-[#bfd0c4] disabled:bg-[#d8e2d4] disabled:text-[#66756b] sm:w-auto"
                >
                  {isSyncing ? t.syncingCalendar : t.prepareCalendarSync}
                </button>
              </div>
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
