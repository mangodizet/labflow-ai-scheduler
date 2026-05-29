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
const introBannerStorageKey = "labflow-intro-banner-dismissed";
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
  conflict?: string | null;
  name: string;
  date: string;
  time: string;
  durationMinutes: number;
  shifted?: boolean;
  warnings?: ScheduleWarningCode[];
};

type AddOnPlacementMode = "append" | "parallel";

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
    introTitle: "How to use LabFlow AI",
    introDescription:
      "Follow the short guide, then close it and try the same flow in the real scheduler.",
    introPages: [
      {
        title: "Choose the experiment",
        description:
          "Use Experiment template first. Open Planning options for add-on experiments, or Advanced template tools when you need a detailed custom workflow.",
        callouts: [
          "Click the template dropdown to choose the base experiment.",
          "Open Planning options only when combining multiple experiments.",
          "Use Advanced template tools to build a detailed schedule from protocol steps.",
        ],
      },
      {
        title: "Set timing rules",
        description:
          "Pick the start date and type the preferred start time. The scheduler uses these rules before it creates the draft calendar.",
        callouts: [
          "Set Start date with the date picker.",
          "Choose AM or PM, then type a time such as 0900 or 5:30.",
          "Keep Avoid weekend work on when Saturday or Sunday steps should move.",
        ],
      },
      {
        title: "Edit the generated draft",
        description:
          "Review the generated calendar before syncing. Drag a card to move that step and following steps, or use the edit panel for exact changes.",
        callouts: [
          "Click a schedule card to open the edit panel.",
          "Drag a card to another date column to move the schedule.",
          "Use the right panel to change name, date, time, or duration.",
        ],
      },
      {
        title: "Sync the final schedule",
        description:
          "After the draft looks right, sync the approved experiment set to Google Calendar. You can also delete a synced set later.",
        callouts: [
          "Refresh conflicts if Google Calendar changed.",
          "Click Sync experiment set only after checking the draft.",
          "Use Delete synced set if you need to remove the LabFlow events.",
        ],
      },
    ],
    previousTutorial: "Previous",
    nextTutorial: "Next",
    finishTutorial: "Finish",
    tutorialStepLabel: "Step",
    dismissIntro: "Dismiss",
    tutorialButton: "Tutorial",
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
    addOnExperiments: "Add-on experiments",
    addOnExperimentsDescription:
      "Combine additional templates into the same experiment set.",
    addOnPlacement: "Add-on timing",
    appendAddOns: "After primary",
    parallelAddOns: "Start together",
    combinedSet: "Combined set",
    planningOptions: "Planning options",
    planningOptionsDescription:
      "Optional controls for combining experiments and comparing start dates.",
    advancedTemplateTools: "Advanced template tools",
    advancedTemplateToolsDescription:
      "Create a reusable template only when the built-in templates are not enough.",
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
    startDayOptions: "Start date comparison",
    startDayOptionsDescription:
      "Compare nearby start dates without changing the current draft. Apply a date only when you are ready.",
    recommended: "Fewest adjustments",
    chooseStartDate: "Preview",
    applyStartDate: "Apply this start date",
    currentStartDate: "Current start",
    previewSelected: "Preview selected",
    startDateApplyHint: "The draft calendar stays unchanged until you apply a start date.",
    finishDate: "Finish",
    noIssues: "No schedule issues",
    calendarConflictCount: "Calendar conflicts",
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
    experimentSet: "Experiment set",
    experimentSetDescription:
      "This draft is one experiment set. Move, review, and sync the set together.",
    dragToMoveSet:
      "Drag a schedule card to another day to move that event and all following events.",
    moveSetEarlier: "Move set -1 day",
    moveSetLater: "Move set +1 day",
    setMoveNote:
      "Changes the experiment start date by one day and regenerates the draft with calendar rules.",
    draftCalendar: "Draft calendar",
    editEvent: "Edit event",
    eventName: "Event name",
    eventDate: "Date",
    eventTime: "Time",
    eventDuration: "Duration minutes",
    shiftFollowingEvents: "Move this and following events",
    moveFollowingEarlier: "Move earlier -1 day",
    moveFollowingLater: "Move later +1 day",
    selectEventToEdit: "Select a calendar event to edit its draft details.",
    prepareCalendarSync: "Sync experiment set",
    deleteCalendarSync: "Delete synced set",
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
    scheduleExplanation: "Schedule explanation",
    currentDraftTime: "Current draft time",
    originalCalculatedTime: "Original calculated time",
    noMovementNeeded: "No automatic movement was needed.",
    conflictAvoided: "Avoided calendar event",
    adjustedFrom: "Adjusted from",
    movedBecause: "Moved because",
    duration: "Duration",
    warningMessages: {
      "calendar-conflict": "Start date kept; this step moved to avoid a calendar conflict.",
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
    introTitle: "사용 방법",
    introDescription:
      "짧은 안내를 넘겨보신 뒤, 같은 순서로 실제 스케줄러에서 진행하시면 됩니다.",
    introPages: [
      {
        title: "실험 선택",
        description:
          "먼저 실험 템플릿을 선택합니다. 여러 실험을 조합하거나 더 자세한 워크플로우가 필요하면 일정 옵션과 고급 템플릿 도구를 사용합니다.",
        callouts: [
          "실험 템플릿 드롭다운을 눌러 기본 실험을 선택합니다.",
          "여러 실험을 합칠 때만 일정 옵션을 엽니다.",
          "프로토콜 단계로 디테일한 스케줄을 만들 때 고급 템플릿 도구를 사용합니다.",
        ],
      },
      {
        title: "시간 규칙 설정",
        description:
          "시작 날짜와 희망 시작 시간을 입력합니다. 이 규칙을 기준으로 초안 캘린더가 생성됩니다.",
        callouts: [
          "시작 날짜는 날짜 선택기로 고릅니다.",
          "오전/오후를 선택하고 0900 또는 5:30처럼 시간을 입력합니다.",
          "토요일/일요일 작업을 피하려면 주말 작업 피하기를 켜둡니다.",
        ],
      },
      {
        title: "생성된 일정 수정",
        description:
          "생성된 초안 캘린더를 먼저 확인합니다. 일정 카드를 드래그해서 이동하거나, 오른쪽 패널에서 정확한 정보를 수정할 수 있습니다.",
        callouts: [
          "일정 카드를 누르면 오른쪽 수정 패널이 열립니다.",
          "카드를 다른 날짜 칸으로 드래그하면 그 일정부터 뒤 일정이 함께 이동합니다.",
          "오른쪽 패널에서 이름, 날짜, 시간, 소요 시간을 직접 수정합니다.",
        ],
      },
      {
        title: "최종 일정 동기화",
        description:
          "수정이 끝난 뒤 최종 실험 세트를 Google Calendar에 동기화합니다. 필요하면 동기화된 세트를 다시 삭제할 수도 있습니다.",
        callouts: [
          "구글 캘린더가 바뀌었다면 충돌 정보를 새로고침합니다.",
          "초안이 맞는지 확인한 뒤 실험 세트 동기화를 누릅니다.",
          "LabFlow로 등록한 일정을 지우려면 동기화된 세트 삭제를 사용합니다.",
        ],
      },
    ],
    previousTutorial: "이전",
    nextTutorial: "다음",
    finishTutorial: "완료",
    tutorialStepLabel: "단계",
    dismissIntro: "닫기",
    tutorialButton: "튜토리얼",
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
    addOnExperiments: "추가 실험",
    addOnExperimentsDescription:
      "추가 템플릿을 같은 실험 세트에 조합합니다.",
    addOnPlacement: "추가 실험 배치",
    appendAddOns: "기본 실험 뒤에",
    parallelAddOns: "같이 시작",
    combinedSet: "조합된 세트",
    planningOptions: "일정 옵션",
    planningOptionsDescription:
      "실험 조합과 시작일 비교가 필요할 때만 열어서 사용하세요.",
    advancedTemplateTools: "고급 템플릿 도구",
    advancedTemplateToolsDescription:
      "기본 템플릿만으로 부족할 때 새 템플릿을 만들 수 있습니다.",
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
    startDayOptions: "시작일 비교",
    startDayOptionsDescription:
      "현재 초안 일정은 그대로 두고 가까운 시작일을 비교합니다. 적용 버튼을 눌러야 시작일이 바뀝니다.",
    recommended: "가장 적은 조정",
    chooseStartDate: "미리보기",
    applyStartDate: "이 시작일 적용",
    currentStartDate: "현재 시작일",
    previewSelected: "미리보기 선택됨",
    startDateApplyHint: "적용하기 전까지 초안 캘린더는 바뀌지 않습니다.",
    finishDate: "완료",
    noIssues: "문제 없음",
    calendarConflictCount: "캘린더 충돌",
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
    experimentSet: "실험 세트",
    experimentSetDescription:
      "이 초안은 하나의 실험 세트입니다. 세트 단위로 이동, 검토, 동기화합니다.",
    dragToMoveSet:
      "일정 카드를 다른 날짜 칸으로 드래그하면 그 일정부터 뒤 일정이 함께 이동합니다.",
    moveSetEarlier: "세트 하루 앞당기기",
    moveSetLater: "세트 하루 미루기",
    setMoveNote:
      "실험 시작일을 하루 단위로 바꾸고 캘린더 규칙에 맞춰 초안을 다시 생성합니다.",
    draftCalendar: "초안 캘린더",
    editEvent: "일정 수정",
    eventName: "일정 이름",
    eventDate: "날짜",
    eventTime: "시간",
    eventDuration: "소요 시간(분)",
    shiftFollowingEvents: "이 일정부터 뒤 일정 이동",
    moveFollowingEarlier: "하루 앞당기기",
    moveFollowingLater: "하루 미루기",
    selectEventToEdit: "수정할 캘린더 일정을 선택하세요.",
    prepareCalendarSync: "실험 세트 동기화",
    deleteCalendarSync: "동기화된 세트 삭제",
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
    scheduleExplanation: "일정 이동 설명",
    currentDraftTime: "현재 초안 일정",
    originalCalculatedTime: "원래 계산된 일정",
    noMovementNeeded: "자동 이동이 필요하지 않았습니다.",
    conflictAvoided: "피한 캘린더 일정",
    adjustedFrom: "원래 일정",
    movedBecause: "이동 사유",
    duration: "소요 시간",
    warningMessages: {
      "calendar-conflict": "시작일은 유지하고, 이 단계만 캘린더 충돌을 피하도록 이동했습니다.",
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

function getCategoryAccent(category: Step["category"]) {
  if (category === "Assay") {
    return {
      bar: "bg-lab-amber-600",
      chip: "border-lab-amber-100 bg-lab-amber-50 text-lab-amber-600",
    };
  }

  if (category === "Incubation") {
    return {
      bar: "bg-lab-indigo-600",
      chip: "border-lab-indigo-100 bg-lab-indigo-50 text-lab-indigo-600",
    };
  }

  return {
    bar: "bg-lab-teal-600",
    chip: "border-lab-teal-100 bg-lab-teal-50 text-lab-teal-700",
  };
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

function getDateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDayDifference(startDate: Date, endDate: Date) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return Math.round(
    (getDateOnly(endDate).getTime() - getDateOnly(startDate).getTime()) /
      millisecondsPerDay,
  );
}

function getOriginalScheduleDate(
  event: DraftEvent,
  startDate: string,
  workStart: string,
) {
  if (!startDate || !workStart) {
    return null;
  }

  const originalDate = combineDateAndTime(startDate, workStart);

  if (Number.isNaN(originalDate.getTime())) {
    return null;
  }

  return addDays(originalDate, event.dayOffset);
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

function getLastStepOffset(template: ExperimentTemplate) {
  return Math.max(...template.steps.map((step) => step.dayOffset), 0);
}

function combineExperimentTemplates(
  primaryTemplate: ExperimentTemplate,
  addOnTemplates: ExperimentTemplate[],
  placementMode: AddOnPlacementMode,
) {
  if (!addOnTemplates.length) {
    return primaryTemplate;
  }

  const steps = [...primaryTemplate.steps];
  let nextOffset = placementMode === "append" ? getLastStepOffset(primaryTemplate) + 1 : 0;

  for (const addOnTemplate of addOnTemplates) {
    steps.push(
      ...addOnTemplate.steps.map((step) => ({
        ...step,
        dayOffset: step.dayOffset + nextOffset,
        name: `${addOnTemplate.name}: ${step.name}`,
      })),
    );

    if (placementMode === "append") {
      nextOffset += getLastStepOffset(addOnTemplate) + 1;
    }
  }

  return {
    id: `combined-${primaryTemplate.id}-${addOnTemplates.map((item) => item.id).join("-")}`,
    name: `${primaryTemplate.name} + ${addOnTemplates.map((item) => item.name).join(" + ")}`,
    source: primaryTemplate.source,
    steps,
    summary: [
      primaryTemplate.summary,
      ...addOnTemplates.map((item) => item.summary),
    ].join(" "),
  } satisfies ExperimentTemplate;
}

function getInitialLanguage(): Language {
  if (typeof window === "undefined") {
    return "en";
  }

  return readBrowserStorage(languageStorageKey) === "ko" ? "ko" : "en";
}

function getInitialIntroBannerVisibility() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(introBannerStorageKey) !== "true";
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
  const [showIntroBanner, setShowIntroBanner] = useState(
    getInitialIntroBannerVisibility,
  );
  const [tutorialPage, setTutorialPage] = useState(0);
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
  const [addOnTemplateIds, setAddOnTemplateIds] = useState<string[]>([]);
  const [addOnPlacementMode, setAddOnPlacementMode] =
    useState<AddOnPlacementMode>("append");
  const [startDate, setStartDate] = useState("");
  const [previewStartDate, setPreviewStartDate] = useState("");
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
  const [draggedEventId, setDraggedEventId] = useState("");
  const [dragTargetDate, setDragTargetDate] = useState("");
  const previousBusySignature = useRef("");
  const t = copy[language];

  const allTemplates = useMemo(
    () => [...templates, ...customTemplates],
    [customTemplates],
  );
  const primaryTemplate = allTemplates.find((item) => item.id === templateId);
  const availableAddOnTemplates = allTemplates.filter((item) => item.id !== templateId);
  const addOnTemplates = useMemo(
    () =>
      addOnTemplateIds
        .map((id) => allTemplates.find((item) => item.id === id))
        .filter((item): item is ExperimentTemplate => Boolean(item)),
    [addOnTemplateIds, allTemplates],
  );
  const template = useMemo(
    () =>
      primaryTemplate
        ? combineExperimentTemplates(
            primaryTemplate,
            addOnTemplates,
            addOnPlacementMode,
          )
        : undefined,
    [addOnPlacementMode, addOnTemplates, primaryTemplate],
  );
  const isCustomTemplateSelected = Boolean(
    templateId && customTemplates.some((item) => item.id === templateId),
  );
  const canGenerateSchedule = Boolean(template && startDate && workStart);

  useEffect(() => {
    if (!showIntroBanner) {
      return;
    }

    function handleTutorialKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowIntroBanner(false);
        setTutorialPage(0);
        window.localStorage.setItem(introBannerStorageKey, "true");
      }
    }

    window.addEventListener("keydown", handleTutorialKeyDown);

    return () => {
      window.removeEventListener("keydown", handleTutorialKeyDown);
    };
  }, [showIntroBanner]);

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

  const startDateOptions = useMemo(() => {
    if (!template || !startDate || !workStart) {
      return [];
    }

    const baseDate = combineDateAndTime(startDate, "00:00");

    if (Number.isNaN(baseDate.getTime())) {
      return [];
    }

    const options = Array.from({ length: 5 }, (_, index) => {
      const optionDate = addDays(baseDate, index);
      const optionStartDate = formatDateInput(optionDate);
      const optionSchedule = generateSchedule({
        steps: template.steps,
        startDate: optionStartDate,
        workStart,
        avoidWeekends,
        conflicts: calendarConflicts,
      });
      const optionWarnings = optionSchedule.reduce(
        (total, step) => total + step.warnings.length,
        0,
      );
      const optionCalendarConflicts = optionSchedule.reduce(
        (total, step) =>
          total + (step.warnings.includes("calendar-conflict") ? 1 : 0),
        0,
      );
      const optionShifted = optionSchedule.filter((step) => step.shifted).length;
      const lastStep = optionSchedule.at(-1);

      return {
        calendarConflicts: optionCalendarConflicts,
        finishDate: lastStep?.date ?? optionDate,
        shifted: optionShifted,
        startDate: optionStartDate,
        warnings: optionWarnings,
      };
    });
    const bestIndex = options.reduce((best, option, index) => {
      const bestOption = options[best];
      const score =
        option.calendarConflicts * 3 + option.warnings * 2 + option.shifted;
      const bestScore =
        bestOption.calendarConflicts * 3 +
        bestOption.warnings * 2 +
        bestOption.shifted;

      return score < bestScore ? index : best;
    }, 0);

    return options.map((option, index) => ({
      ...option,
      recommended: index === bestIndex,
    }));
  }, [avoidWeekends, calendarConflicts, startDate, template, workStart]);
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
        conflict: edit.conflict ?? step.conflict,
        name: edit.name,
        date: combineDateAndTime(edit.date, edit.time),
        durationMinutes: edit.durationMinutes,
        shifted: edit.shifted ?? step.shifted,
        warnings: edit.warnings ?? step.warnings,
      };
    });
  }, [draftEdits, schedule]);
  const selectedEvent = draftEvents.find((event) => event.id === selectedEventId);
  const selectedMovementDetails = selectedEvent
    ? getMovementDetails(selectedEvent)
    : null;
  const shiftedCount = draftEvents.filter((step) => step.shifted).length;
  const handsOnMinutes = sumStepMinutes(draftEvents, "Hands-on");
  const warningCount = draftEvents.reduce(
    (total, step) => total + step.warnings.length,
    0,
  );
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

  function dismissIntroBanner() {
    setShowIntroBanner(false);
    setTutorialPage(0);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(introBannerStorageKey, "true");
    }
  }

  function openIntroBanner() {
    setTutorialPage(0);
    setShowIntroBanner(true);
  }

  function moveTutorialPage(direction: number) {
    setTutorialPage((current) =>
      Math.min(Math.max(current + direction, 0), t.introPages.length - 1),
    );
  }

  function handleTemplateSelection(value: string) {
    setTemplateId(value);
    setAddOnTemplateIds((current) => current.filter((id) => id !== value));
    setPreviewStartDate("");
    setSyncStatus("");
    setDraftEdits({});
    setSelectedEventId("");
  }

  function handleAddOnTemplateSelection(id: string, checked: boolean) {
    setAddOnTemplateIds((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id),
    );
    setPreviewStartDate("");
    setSyncStatus("");
    setDraftEdits({});
    setSelectedEventId("");
  }

  function handleAddOnPlacementModeSelection(mode: AddOnPlacementMode) {
    setAddOnPlacementMode(mode);
    setPreviewStartDate("");
    setSyncStatus("");
    setDraftEdits({});
    setSelectedEventId("");
  }

  function handleStartDateInput(value: string) {
    setStartDate(value);
    setPreviewStartDate("");
    setSyncStatus("");
    setDraftEdits({});
    setSelectedEventId("");
  }

  function handleWorkStartInput(value: string) {
    setWorkStart(value);
    setPreviewStartDate("");
    setSyncStatus("");
    setDraftEdits({});
    setSelectedEventId("");
  }

  function handleStartDatePreview(value: string) {
    setPreviewStartDate(value);
  }

  function applyPreviewStartDate() {
    if (!previewStartDate || previewStartDate === startDate) {
      setPreviewStartDate("");
      return;
    }

    handleStartDateInput(previewStartDate);
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
    setPreviewStartDate("");
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
    setAddOnTemplateIds((current) =>
      current.filter((item) => item !== selectedTemplate.id),
    );
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

    const changesPlacement =
      "date" in patch || "time" in patch || "durationMinutes" in patch;

    setDraftEdits((current) => {
      const baseEdit = {
        conflict: event.conflict,
        name: event.name,
        date: formatDateInput(event.date),
        time: formatTimeInput(event.date),
        durationMinutes: event.durationMinutes,
        shifted: event.shifted,
        warnings: event.warnings,
      };

      return {
        ...current,
        [id]: {
          ...baseEdit,
          ...current[id],
          ...patch,
          conflict: changesPlacement
            ? null
            : (patch.conflict ?? current[id]?.conflict ?? baseEdit.conflict),
          shifted: changesPlacement
            ? true
            : (patch.shifted ?? current[id]?.shifted ?? baseEdit.shifted),
          warnings: changesPlacement
            ? []
            : (patch.warnings ?? current[id]?.warnings ?? baseEdit.warnings),
        },
      };
    });
    setSyncStatus("");
  }

  function shiftDraftSet(days: number) {
    if (!startDate) {
      return;
    }

    const nextStartDate = addDays(combineDateAndTime(startDate, "00:00"), days);
    setStartDate(formatDateInput(nextStartDate));
    setPreviewStartDate("");
    setSyncStatus("");
    setDraftEdits({});
    setSelectedEventId("");
  }

  function shiftDraftEventsFrom(id: string, days: number) {
    const startIndex = draftEvents.findIndex((event) => event.id === id);

    if (startIndex < 0) {
      return;
    }

    const tailEvents = draftEvents.slice(startIndex);
    const tailStart = addDays(tailEvents[0].date, days);
    const rescheduledTail = generateSchedule({
      steps: tailEvents.map((event) => ({
        category: event.category,
        dayOffset: Math.max(0, getDayDifference(tailEvents[0].date, event.date)),
        durationMinutes: event.durationMinutes,
        name: event.name,
        protocol: event.protocol,
      })),
      startDate: formatDateInput(tailStart),
      workStart: formatTimeInput(tailStart),
      avoidWeekends,
      conflicts: calendarConflicts,
    });

    if (rescheduledTail.length !== tailEvents.length) {
      return;
    }

    setDraftEdits((current) => {
      const next = { ...current };

      for (const [index, event] of tailEvents.entries()) {
        const rescheduledEvent = rescheduledTail[index];
        const baseEdit = {
          name: event.name,
          date: formatDateInput(event.date),
          time: formatTimeInput(event.date),
          durationMinutes: event.durationMinutes,
        };

        next[event.id] = {
          ...baseEdit,
          ...current[event.id],
          conflict: rescheduledEvent.conflict,
          date: formatDateInput(rescheduledEvent.date),
          shifted: rescheduledEvent.shifted,
          time: formatTimeInput(rescheduledEvent.date),
          warnings: rescheduledEvent.warnings,
        };
      }

      return next;
    });
    setSyncStatus("");
  }

  function handleDraftEventDrop(eventId: string, dateKey: string) {
    const event = draftEvents.find((item) => item.id === eventId);

    if (!event) {
      return;
    }

    const targetDate = combineDateAndTime(dateKey, formatTimeInput(event.date));
    const days = getDayDifference(event.date, targetDate);

    if (days !== 0) {
      shiftDraftEventsFrom(eventId, days);
      setSelectedEventId(eventId);
    }

    setDraggedEventId("");
    setDragTargetDate("");
  }

  function getMovementDetails(event: DraftEvent) {
    const originalDate = getOriginalScheduleDate(event, startDate, workStart);
    const moved =
      event.shifted ||
      Boolean(event.conflict) ||
      event.warnings.length > 0 ||
      Boolean(originalDate && originalDate.getTime() !== event.date.getTime());

    return {
      moved,
      originalDate,
      reasons: event.warnings.map((warning) =>
        formatWarning(warning, t.warningMessages),
      ),
    };
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

  const currentTutorialPage = t.introPages[tutorialPage] ?? t.introPages[0];
  const isFirstTutorialPage = tutorialPage === 0;
  const isLastTutorialPage = tutorialPage === t.introPages.length - 1;

  return (
    <main className="min-h-screen bg-precision-grid bg-lab-steel-50 text-lab-steel-900 pb-12">
      {showIntroBanner ? (
        <div
          aria-labelledby="introTutorialTitle"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center bg-lab-steel-900/60 backdrop-blur-md px-4 py-4 sm:py-8"
          role="dialog"
        >
          <section className="max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto border border-lab-steel-200 bg-white p-6 shadow-2xl rounded-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-lab-teal-600 bg-lab-teal-50 px-2 py-0.5 rounded border border-lab-teal-100 w-fit">
                  LabFlow AI
                </p>
                <h2
                  className="mt-2 text-2xl font-bold text-lab-steel-900 tracking-tight"
                  id="introTutorialTitle"
                >
                  {t.introTitle}
                </h2>
              </div>
              <button
                className="border border-lab-steel-200 bg-white hover:bg-lab-steel-50 px-3.5 py-1.5 rounded-lg text-sm font-semibold text-lab-steel-600 transition"
                onClick={dismissIntroBanner}
                type="button"
              >
                {t.dismissIntro}
              </button>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-lab-steel-600">
              {t.introDescription}
            </p>
            <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="border border-lab-steel-200 bg-white p-5 rounded-xl shadow-sm">
                {tutorialPage === 0 ? (
                  <div className="grid gap-3 text-xs text-lab-steel-600">
                    <div className="border border-lab-teal-200 bg-lab-teal-50/20 p-3 rounded-lg">
                      <span className="font-semibold text-lab-teal-700 block">
                        {t.experimentTemplate}
                      </span>
                      <div className="mt-2 border border-lab-teal-100 bg-white px-3 py-2 rounded font-medium">
                        THP-1 M2 Polarization
                      </div>
                    </div>
                    <div className="border border-lab-steel-200 bg-lab-steel-50 p-3 rounded-lg">
                      <span className="font-semibold text-lab-steel-900">
                        {t.planningOptions}
                      </span>
                      <p className="mt-1 text-lab-steel-600">
                        {t.planningOptionsDescription}
                      </p>
                    </div>
                    <div className="border border-lab-steel-200 bg-lab-steel-50 p-3 rounded-lg">
                      <span className="font-semibold text-lab-steel-900">
                        {t.advancedTemplateTools}
                      </span>
                      <p className="mt-1 text-lab-steel-600">
                        {t.advancedTemplateToolsDescription}
                      </p>
                    </div>
                  </div>
                ) : null}
                {tutorialPage === 1 ? (
                  <div className="grid gap-3 text-xs text-lab-steel-600">
                    <div className="border border-lab-steel-200 bg-lab-steel-50 p-3 rounded-lg">
                      <span className="font-semibold text-lab-steel-900">
                        {t.startDate}
                      </span>
                      <div className="mt-2 border border-lab-teal-600/30 bg-white px-3 py-2 rounded text-lab-teal-700 font-mono font-semibold">
                        2026-05-14
                      </div>
                    </div>
                    <div className="border border-lab-steel-200 bg-lab-steel-50 p-3 rounded-lg">
                      <span className="font-semibold text-lab-steel-900">
                        {t.preferredStartTime}
                      </span>
                      <div className="mt-2 grid grid-cols-[auto_1fr] gap-2 font-mono">
                        <span className="border border-lab-teal-600 bg-lab-teal-600 px-3 py-2 text-white rounded font-bold">
                          AM
                        </span>
                        <span className="border border-lab-steel-200 bg-white px-3 py-2 rounded text-lab-steel-900 font-semibold">
                          09:00
                        </span>
                      </div>
                    </div>
                    <div className="border border-lab-steel-200 bg-lab-steel-50 p-3 rounded-lg flex items-center justify-between">
                      <span className="font-semibold text-lab-steel-900">
                        {t.avoidWeekendWork}
                      </span>
                      <span className="inline-block bg-lab-teal-50 text-lab-teal-700 border border-lab-teal-100 rounded px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider font-mono">
                        ON
                      </span>
                    </div>
                  </div>
                ) : null}
                {tutorialPage === 2 ? (
                  <div className="grid gap-3 text-xs text-lab-steel-600 md:grid-cols-[1fr_0.8fr]">
                    <div className="grid grid-cols-2 gap-2">
                      {["May 14", "May 15", "May 18", "May 20"].map((date, index) => (
                        <div
                          className="min-h-28 border border-lab-steel-200 bg-lab-steel-50 p-2 rounded-lg"
                          key={date}
                        >
                          <span className="font-mono font-bold text-lab-teal-700 text-[10px]">
                            {date}
                          </span>
                          {index < 3 ? (
                            <div
                              className={`relative mt-2 border rounded p-1.5 pl-2.5 bg-white text-[10px] ${
                                index === 1
                                  ? "border-lab-teal-600 bg-lab-teal-50/50"
                                  : "border-lab-steel-200"
                              }`}
                            >
                              <span className="absolute bottom-0 left-0 top-0 w-0.5 bg-lab-teal-600" />
                              <span className="block font-semibold text-lab-steel-900 truncate">
                                {index === 0
                                  ? "PMA Treatment"
                                  : index === 1
                                    ? "Wash + Resting"
                                    : "IL4 / IL13"}
                              </span>
                              <span className="mt-1 inline-block border border-lab-steel-200 px-1 py-0.2 rounded text-[9px]">
                                {t.categories["Hands-on"]}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="border border-lab-steel-200 bg-lab-steel-50 p-3 rounded-lg">
                      <span className="font-semibold text-lab-steel-900 block border-b border-lab-steel-200 pb-1.5">
                        {t.editEvent}
                      </span>
                      <div className="mt-3 space-y-2">
                        <div className="border border-lab-steel-200 bg-white rounded px-2.5 py-1.5 font-medium">
                          {t.eventName}
                        </div>
                        <div className="border border-lab-steel-200 bg-white rounded px-2.5 py-1.5 font-medium">
                          {t.eventDate}
                        </div>
                        <div className="border border-lab-steel-200 bg-white rounded px-2.5 py-1.5 font-medium">
                          {t.eventTime}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                {tutorialPage === 3 ? (
                  <div className="grid gap-3 text-xs text-lab-steel-600 md:grid-cols-[0.8fr_1fr]">
                    <div className="border border-lab-steel-200 bg-lab-steel-50 p-3 rounded-lg">
                      <span className="font-semibold text-lab-steel-900">
                        {t.googleCalendar}
                      </span>
                      <div className="mt-3 border border-lab-steel-200 bg-white px-3 py-2 text-lab-teal-700 font-semibold rounded text-center">
                        {userEmail ? `${t.connectedAs} ${userEmail}` : t.connectGoogle}
                      </div>
                      <div className="mt-2 border border-lab-steel-200 bg-white px-3 py-2 rounded text-center cursor-pointer hover:bg-lab-steel-50">
                        {t.refreshCalendarConflicts}
                      </div>
                    </div>
                    <div className="border border-lab-steel-200 bg-lab-steel-50 p-3 rounded-lg">
                      <span className="font-semibold text-lab-steel-900 block border-b border-lab-steel-200 pb-1.5">
                        {t.generatedTimeline}
                      </span>
                      <div className="mt-3 bg-lab-teal-600 px-3 py-2 text-center font-bold text-white rounded shadow-sm hover:bg-lab-teal-700 transition cursor-pointer">
                        {t.prepareCalendarSync}
                      </div>
                      <div className="mt-2 border border-lab-steel-200 bg-white px-3 py-2 rounded text-center hover:bg-lab-steel-50 transition cursor-pointer">
                        {t.deleteCalendarSync}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col border border-lab-steel-200 bg-white p-5 rounded-xl shadow-sm justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-lab-teal-600">
                    {t.tutorialStepLabel} {tutorialPage + 1} / {t.introPages.length}
                  </p>
                  <div className="mt-3 flex gap-2">
                    {t.introPages.map((page, index) => (
                      <button
                        aria-label={`${t.tutorialStepLabel} ${index + 1}`}
                        className={`h-1.5 flex-1 rounded-full transition ${
                          tutorialPage === index
                            ? "bg-lab-teal-600"
                            : "bg-lab-steel-100 hover:bg-lab-steel-200"
                        }`}
                        key={page.title}
                        onClick={() => setTutorialPage(index)}
                        type="button"
                      />
                    ))}
                  </div>
                  <h3 className="mt-4 text-xl font-bold tracking-tight text-lab-steel-900">
                    {currentTutorialPage.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-lab-steel-600">
                    {currentTutorialPage.description}
                  </p>
                  <ul className="mt-4 space-y-2 text-sm leading-6 text-lab-steel-700">
                    {currentTutorialPage.callouts.map((callout) => (
                      <li className="border-l-2 border-lab-teal-600 pl-3.5" key={callout}>
                        {callout}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-6 flex items-center justify-between gap-3 border-t border-lab-steel-200 pt-4">
                  <button
                    className="border border-lab-steel-200 bg-white px-4 py-2 rounded-lg text-sm font-semibold text-lab-steel-700 transition hover:bg-lab-steel-50 disabled:cursor-not-allowed disabled:text-lab-steel-400 disabled:bg-lab-steel-50"
                    disabled={isFirstTutorialPage}
                    onClick={() => moveTutorialPage(-1)}
                    type="button"
                  >
                    {t.previousTutorial}
                  </button>
                  {isLastTutorialPage ? (
                    <button
                      className="bg-lab-teal-600 px-4 py-2 rounded-lg text-sm font-semibold text-white transition hover:bg-lab-teal-700 shadow-sm"
                      onClick={dismissIntroBanner}
                      type="button"
                    >
                      {t.finishTutorial}
                    </button>
                  ) : (
                    <button
                      className="bg-lab-teal-600 px-4 py-2 rounded-lg text-sm font-semibold text-white transition hover:bg-lab-teal-700 shadow-sm"
                      onClick={() => moveTutorialPage(1)}
                      type="button"
                    >
                      {t.nextTutorial}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-5 border-b border-lab-steel-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold tracking-[0.15em] text-lab-teal-600 bg-lab-teal-50 px-2.5 py-0.5 rounded border border-lab-teal-100 uppercase">
                LabFlow AI
              </span>
              <span className="text-[10px] font-mono font-semibold tracking-wider text-lab-steel-600 bg-lab-steel-100 px-2 py-0.5 rounded border border-lab-steel-200">
                v1.2.0 [STABLE]
              </span>
              <div className="flex items-center gap-1.5 border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-emerald-600 tracking-wide uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-led" />
                SYSTEM ACTIVE
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-lab-steel-900 via-lab-steel-800 to-lab-teal-700 bg-clip-text text-transparent sm:text-4xl">
                {t.appTitle}
              </h1>
              <button
                className="w-fit inline-flex items-center gap-1.5 border border-lab-teal-600/30 bg-white px-3.5 py-1.5 rounded-lg text-xs font-semibold text-lab-teal-700 transition hover:bg-lab-teal-50 hover:border-lab-teal-600 hover:shadow-sm"
                onClick={openIntroBanner}
                type="button"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                {t.tutorialButton}
              </button>
            </div>
            <p className="mt-2.5 max-w-2xl text-sm leading-6 text-lab-steel-600">
              {t.appDescription}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-5 lg:grid-cols-5 w-full lg:w-auto">
            <div className="border border-lab-steel-200 bg-white rounded-xl p-3 shadow-sm flex flex-col justify-between min-h-[76px]">
              <span className="block font-semibold text-lab-steel-600">{t.languageLabel}</span>
              <div className="mt-1.5 inline-flex rounded-lg border border-lab-steel-100 bg-lab-steel-50 p-0.5 w-full">
                <button
                  className={`flex-1 rounded-md py-1 text-[10px] font-bold transition-all cursor-pointer ${
                    language === "en"
                      ? "bg-white text-lab-teal-700 shadow-sm border border-lab-steel-100"
                      : "text-lab-steel-600 hover:text-lab-steel-900"
                  }`}
                  onClick={() => handleLanguageSelection("en")}
                >
                  EN
                </button>
                <button
                  className={`flex-1 rounded-md py-1 text-[10px] font-bold transition-all cursor-pointer ${
                    language === "ko"
                      ? "bg-white text-lab-teal-700 shadow-sm border border-lab-steel-100"
                      : "text-lab-steel-600 hover:text-lab-steel-900"
                  }`}
                  onClick={() => handleLanguageSelection("ko")}
                >
                  KO
                </button>
              </div>
            </div>
            <div className="border border-lab-steel-200 bg-white rounded-xl p-3 shadow-sm flex items-center justify-between gap-2 group hover:border-lab-teal-600/30 transition-all min-h-[76px]">
              <div className="flex flex-col">
                <span className="block font-semibold text-lab-steel-600">{t.steps}</span>
                <strong className="mt-0.5 block text-2xl font-bold tracking-tight text-lab-steel-900">{schedule.length}</strong>
              </div>
              <div className="p-2 bg-lab-teal-50 text-lab-teal-600 rounded-lg group-hover:bg-lab-teal-100 transition-colors">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
            </div>
            <div className="border border-lab-steel-200 bg-white rounded-xl p-3 shadow-sm flex items-center justify-between gap-2 group hover:border-lab-indigo-600/30 transition-all min-h-[76px]">
              <div className="flex flex-col max-w-[calc(100%-2.5rem)]">
                <span className="block font-semibold text-lab-steel-600 truncate">{t.handsOn}</span>
                <strong className="mt-0.5 block text-lg font-bold tracking-tight text-lab-steel-900 truncate">
                  {formatDuration(handsOnMinutes, language)}
                </strong>
              </div>
              <div className="p-2 bg-lab-indigo-50 text-lab-indigo-600 rounded-lg group-hover:bg-lab-indigo-100 transition-colors flex-shrink-0">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className={`border rounded-xl p-3 shadow-sm flex items-center justify-between gap-2 group transition-all min-h-[76px] ${
              warningCount > 0
                ? "border-lab-amber-200 bg-lab-amber-50/30 hover:border-lab-amber-500/50"
                : "border-lab-steel-200 bg-white hover:border-lab-steel-300"
            }`}>
              <div className="flex flex-col">
                <span className="block font-semibold text-lab-steel-600">{t.warnings}</span>
                <strong className={`mt-0.5 block text-2xl font-bold tracking-tight ${warningCount > 0 ? "text-lab-amber-600" : "text-lab-steel-900"}`}>{warningCount}</strong>
              </div>
              <div className={`p-2 rounded-lg transition-colors ${warningCount > 0 ? "bg-lab-amber-100/70 text-lab-amber-600" : "bg-lab-steel-100 text-lab-steel-500 group-hover:bg-lab-steel-200"}`}>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <div className="border border-lab-steel-200 bg-white rounded-xl p-3 shadow-sm flex items-center justify-between gap-2 group hover:border-lab-teal-600/30 transition-all min-h-[76px]">
              <div className="flex flex-col">
                <span className="block font-semibold text-lab-steel-600">{t.adjusted}</span>
                <strong className="mt-0.5 block text-2xl font-bold tracking-tight text-lab-steel-900">{shiftedCount}</strong>
              </div>
              <div className="p-2 bg-lab-teal-50 text-lab-teal-600 rounded-lg group-hover:bg-lab-teal-100 transition-colors">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
            </div>
          </div>
        </header>
        <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="flex flex-col gap-5 border border-lab-steel-200 bg-white p-5 rounded-2xl shadow-sm h-fit">
            <div className="border border-lab-steel-200 bg-lab-steel-50/30 p-4 rounded-xl">
              <h2 className="text-xs font-bold text-lab-steel-900 uppercase tracking-wider flex items-center gap-1.5">
                <svg className="h-4 w-4 text-lab-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 00-2 2z" />
                </svg>
                {t.googleCalendar}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-lab-steel-500">
                {t.googleCalendarDescription}
              </p>
              {userEmail ? (
                <div className="mt-4 space-y-2.5">
                  <div className="border border-lab-teal-100 bg-lab-teal-50/30 px-3 py-2 text-xs font-semibold text-lab-teal-700 rounded-lg flex items-center justify-between">
                    <span className="truncate max-w-[180px]">{t.connectedAs} {userEmail}</span>
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="w-full border border-lab-steel-200 bg-white px-3 py-2 rounded-lg text-xs font-bold text-lab-steel-600 hover:bg-lab-steel-50 hover:text-lab-steel-900 transition cursor-pointer"
                  >
                    {t.disconnect}
                  </button>
                  {canGenerateSchedule ? (
                    <button
                      onClick={() =>
                        setCalendarRefreshToken((current) => current + 1)
                      }
                      className="w-full border border-lab-steel-200 bg-white px-3 py-2 rounded-lg text-xs font-bold text-lab-steel-600 hover:bg-lab-steel-50 hover:text-lab-steel-900 transition cursor-pointer"
                    >
                      {t.refreshCalendarConflicts}
                    </button>
                  ) : null}
                </div>
              ) : (
                <button
                  onClick={handleGoogleConnect}
                  className="mt-4 w-full border border-lab-teal-600 bg-white px-3 py-2 rounded-lg text-xs font-bold text-lab-teal-700 hover:bg-lab-teal-50/50 hover:border-lab-teal-700 transition shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.529-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.986 0-.746-.08-1.32-.176-1.886H12.24z"/>
                  </svg>
                  {t.connectGoogle}
                </button>
              )}
              {authStatus ? (
                <p className="mt-3 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-100 rounded px-2.5 py-1" role="status">
                  {authStatus}
                </p>
              ) : null}
              {calendarStatus ? (
                <p className="mt-3 text-xs font-semibold text-lab-teal-700 bg-lab-teal-50 border border-lab-teal-100 rounded px-2.5 py-1" role="status">
                  {calendarStatus}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-lab-steel-900 uppercase tracking-wider" htmlFor="template">
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
                className="mt-1 w-full border border-lab-steel-200 bg-white px-3 py-2 rounded-lg text-xs outline-none focus:border-lab-teal-600 focus:ring-4 focus:ring-lab-teal-600/10 transition-all font-medium text-lab-steel-800"
              >
                <option value="">{t.selectExperiment}</option>
                {allTemplates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-relaxed text-lab-steel-500">
                {primaryTemplate
                  ? getTemplateSummary(
                      primaryTemplate.id,
                      language,
                      primaryTemplate.summary,
                    )
                  : t.chooseTemplate}
              </p>
              {primaryTemplate && availableAddOnTemplates.length ? (
                <details className="mt-3 border border-lab-steel-200 bg-lab-steel-50/20 rounded-xl overflow-hidden">
                  <summary className="cursor-pointer text-2xs font-bold text-lab-steel-900 p-3 hover:bg-lab-steel-50 flex items-center justify-between uppercase tracking-wider">
                    {t.planningOptions}
                  </summary>
                  <div className="p-3 border-t border-lab-steel-200 bg-white space-y-3.5">
                    <p className="text-xs leading-relaxed text-lab-steel-500">
                      {t.planningOptionsDescription}
                    </p>
                    <div className="border-t border-lab-steel-100 pt-3">
                      <h3 className="text-xs font-bold text-lab-steel-800">
                        {t.addOnExperiments}
                      </h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-lab-steel-500">
                        {t.addOnExperimentsDescription}
                      </p>
                    </div>
                    <div className="bg-lab-steel-50/50 p-2.5 rounded-lg border border-lab-steel-100">
                      <p className="text-[11px] font-bold text-lab-steel-700">
                        {t.addOnPlacement}
                      </p>
                      <div className="mt-1.5 grid grid-cols-2 border border-lab-steel-200 bg-white rounded-lg p-0.5">
                        {([
                          ["append", t.appendAddOns],
                          ["parallel", t.parallelAddOns],
                        ] as const).map(([mode, label]) => (
                          <button
                            key={mode}
                            className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                              addOnPlacementMode === mode
                                ? "bg-lab-teal-600 text-white shadow-sm"
                                : "text-lab-steel-600 hover:bg-lab-steel-50"
                            }`}
                            onClick={() => handleAddOnPlacementModeSelection(mode)}
                            type="button"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                      {availableAddOnTemplates.map((item) => (
                        <label
                          key={item.id}
                          className="flex items-start gap-2.5 border border-lab-steel-200 bg-white p-2.5 rounded-lg text-xs text-lab-steel-700 cursor-pointer hover:border-lab-steel-300 transition-colors"
                        >
                          <input
                            checked={addOnTemplateIds.includes(item.id)}
                            className="mt-0.5 h-3.5 w-3.5 rounded accent-lab-teal-600 border-lab-steel-300"
                            onChange={(event) =>
                              handleAddOnTemplateSelection(
                                item.id,
                                event.currentTarget.checked,
                              )
                            }
                            type="checkbox"
                          />
                          <span className="flex-1 min-w-0">
                            <span className="block font-semibold text-lab-steel-900 truncate">
                              {item.name}
                            </span>
                            <span className="mt-0.5 block text-[10px] leading-normal text-lab-steel-500">
                              {getTemplateSummary(item.id, language, item.summary)}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {addOnTemplates.length ? (
                      <div className="mt-3 border-t border-lab-steel-100 pt-2.5 text-2xs font-bold text-lab-teal-700 bg-lab-teal-50/20 px-2 py-1.5 rounded border border-lab-teal-100/50 truncate">
                        {t.combinedSet}: {template?.name}
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}
              {isCustomTemplateSelected ? (
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <button
                    className="border border-lab-steel-200 bg-white py-2 rounded-lg text-xs font-bold text-lab-steel-600 hover:bg-lab-steel-50 hover:text-lab-steel-900 transition cursor-pointer"
                    disabled={isSavingTemplate || isDeletingTemplate}
                    onClick={editSelectedTemplate}
                    type="button"
                  >
                    {t.editSelectedTemplate}
                  </button>
                  <button
                    className="border border-red-200 bg-white py-2 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 transition cursor-pointer"
                    disabled={isSavingTemplate || isDeletingTemplate}
                    onClick={deleteSelectedTemplate}
                    type="button"
                  >
                    {isDeletingTemplate ? t.deletingTemplate : t.deleteSelectedTemplate}
                  </button>
                </div>
              ) : null}
            </div>

            <details className="border border-lab-steel-200 bg-lab-steel-50/20 rounded-xl overflow-hidden">
              <summary className="cursor-pointer text-2xs font-bold text-lab-steel-900 p-3 hover:bg-lab-steel-50 flex items-center justify-between uppercase tracking-wider">
                {t.advancedTemplateTools}
              </summary>
              <div className="p-3 border-t border-lab-steel-200 bg-white space-y-4">
                <p className="text-xs leading-relaxed text-lab-steel-500">
                  {t.advancedTemplateToolsDescription}
                </p>
                <div className="border border-lab-steel-200 bg-lab-steel-50/30 p-3 rounded-xl space-y-3">
                  <h2 className="text-xs font-bold text-lab-steel-900 uppercase">
                    {t.protocolQuickBuilder}
                  </h2>
                  <p className="text-[11px] leading-relaxed text-lab-steel-500">
                    {t.protocolQuickBuilderDescription}
                  </p>
                  <label className="block text-[10px] font-bold text-lab-steel-700 uppercase">
                    {t.protocolText}
                    <textarea
                      className="mt-1 min-h-36 w-full resize-y border border-lab-steel-200 bg-white px-2.5 py-1.5 rounded-lg text-xs leading-relaxed outline-none focus:border-lab-teal-600 focus:ring-4 focus:ring-lab-teal-600/10 transition-all font-mono"
                      value={protocolText}
                      onChange={(event) => setProtocolText(event.currentTarget.value)}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className="border border-lab-steel-200 bg-white py-1.5 rounded-lg text-2xs font-bold text-lab-steel-600 hover:bg-lab-steel-50 hover:text-lab-steel-900 transition cursor-pointer"
                      onClick={() => setProtocolText(thp1ProtocolSample)}
                      type="button"
                    >
                      {t.loadPdfSample}
                    </button>
                    <button
                      className="bg-lab-teal-600 hover:bg-lab-teal-700 py-1.5 rounded-lg text-2xs font-bold text-white transition shadow-2xs cursor-pointer"
                      onClick={generateTemplateDraftFromProtocol}
                      type="button"
                    >
                      {t.generateDraftFromProtocol}
                    </button>
                  </div>
                </div>

                <div className="border border-lab-steel-200 bg-lab-steel-50/30 p-3 rounded-xl space-y-3">
                  <h2 className="text-xs font-bold text-lab-steel-900 uppercase">
                    {t.templateBuilder}
                  </h2>
                  <div className="space-y-2.5">
                    <label className="block text-[10px] font-bold text-lab-steel-700 uppercase">
                      {t.templateName}
                      <input
                        className="mt-1 w-full border border-lab-steel-200 bg-white px-2.5 py-1.5 rounded-lg text-xs outline-none focus:border-lab-teal-600 focus:ring-4 focus:ring-lab-teal-600/10 transition-all"
                        value={templateBuilder.name}
                        onChange={(event) =>
                          updateTemplateBuilder({ name: event.currentTarget.value })
                        }
                      />
                    </label>
                    <label className="block text-[10px] font-bold text-lab-steel-700 uppercase">
                      {t.templateSummary}
                      <textarea
                        className="mt-1 min-h-16 w-full resize-y border border-lab-steel-200 bg-white px-2.5 py-1.5 rounded-lg text-xs outline-none focus:border-lab-teal-600 focus:ring-4 focus:ring-lab-teal-600/10 transition-all leading-normal"
                        value={templateBuilder.summary}
                        onChange={(event) =>
                          updateTemplateBuilder({ summary: event.currentTarget.value })
                        }
                      />
                    </label>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {templateBuilder.steps.map((step, index) => (
                        <div key={step.id} className="border border-lab-steel-200 bg-white p-3.5 rounded-lg space-y-2.5">
                          <div className="flex items-center justify-between gap-2 border-b border-lab-steel-100 pb-1.5">
                            <span className="text-xs font-bold text-lab-teal-700 bg-lab-teal-50 px-2 py-0.5 rounded border border-lab-teal-100 font-sans">
                              {t.day} {index + 1}
                            </span>
                            <button
                              className="text-xs font-bold text-red-500 hover:text-red-700 cursor-pointer font-sans"
                              onClick={() => removeTemplateBuilderStep(step.id)}
                              type="button"
                            >
                              {t.removeStep}
                            </button>
                          </div>
                          <label className="block text-xs font-bold text-lab-steel-600 uppercase font-sans">
                            {t.stepName}
                            <input
                              className="mt-1 w-full border border-lab-steel-200 px-2.5 py-1.5 rounded text-xs outline-none focus:border-lab-teal-600 font-sans"
                              value={step.name}
                              onChange={(event) =>
                                updateTemplateBuilderStep(step.id, {
                                  name: event.currentTarget.value,
                                })
                              }
                            />
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block text-xs font-bold text-lab-steel-600 uppercase font-sans">
                              {t.dayOffset}
                              <input
                                className="mt-1 w-full border border-lab-steel-200 px-2.5 py-1.5 rounded text-xs outline-none focus:border-lab-teal-600 font-mono"
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
                            <label className="block text-xs font-bold text-lab-steel-600 uppercase font-sans">
                              {t.eventDuration} (Min)
                              <input
                                className="mt-1 w-full border border-lab-steel-200 px-2.5 py-1.5 rounded text-xs outline-none focus:border-lab-teal-600 font-mono"
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
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block text-xs font-bold text-lab-steel-600 uppercase font-sans">
                              {t.category}
                              <select
                                className="mt-1 w-full border border-lab-steel-200 bg-white px-2 py-1.5 rounded text-xs outline-none focus:border-lab-teal-600 font-semibold font-sans"
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
                            <label className="block text-xs font-bold text-lab-steel-600 uppercase font-sans">
                              {t.protocol}
                              <input
                                className="mt-1 w-full border border-lab-steel-200 px-2.5 py-1.5 rounded text-xs outline-none focus:border-lab-teal-600 truncate font-sans"
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
                  </div>
                  <div className="grid grid-cols-2 gap-2 border-t border-lab-steel-100 pt-3">
                    <button
                      className="border border-lab-steel-200 bg-white py-2 rounded-lg text-xs font-bold text-lab-steel-600 hover:bg-lab-steel-50 transition cursor-pointer font-sans"
                      disabled={isSavingTemplate || isDeletingTemplate}
                      onClick={addTemplateBuilderStep}
                      type="button"
                    >
                      {t.addTemplateStep}
                    </button>
                    <button
                      className="bg-lab-teal-600 hover:bg-lab-teal-700 py-2 rounded-lg text-xs font-bold text-white transition shadow-2xs cursor-pointer disabled:bg-lab-steel-200 font-sans"
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
                      className="w-full mt-2 border border-lab-steel-200 bg-white py-2 rounded-lg text-xs font-bold text-lab-steel-500 hover:bg-lab-steel-50 transition cursor-pointer font-sans"
                      disabled={isSavingTemplate || isDeletingTemplate}
                      onClick={cancelTemplateEdit}
                      type="button"
                    >
                      {t.cancelTemplateEdit}
                    </button>
                  ) : null}
                  {templateBuilderStatus ? (
                    <p className="text-xs font-semibold text-lab-teal-700 bg-lab-teal-50 border border-lab-teal-100 rounded px-2.5 py-1" role="status">
                      {templateBuilderStatus}
                    </p>
                  ) : null}
                </div>
              </div>
            </details>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-lab-steel-900 uppercase tracking-wider" htmlFor="startDate">
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
                  className="mt-1 w-full border border-lab-steel-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-lab-teal-600 focus:ring-4 focus:ring-lab-teal-600/10 transition-all font-mono font-medium text-lab-steel-800"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-lab-steel-900 uppercase tracking-wider" htmlFor="workStart">
                  {t.preferredStartTime}
                </label>
                <div className="mt-1 grid grid-cols-[100px_1fr] gap-2">
                  <div className="grid grid-cols-2 border border-lab-steel-200 bg-white rounded-lg p-0.5 font-mono text-[10px] font-bold">
                    {(["AM", "PM"] as const).map((period) => (
                      <button
                        key={period}
                        className={`py-1.5 rounded-md transition-all cursor-pointer ${
                          preferredPeriod === period
                            ? "bg-lab-teal-600 text-white shadow-sm"
                            : "text-lab-steel-600 hover:bg-lab-steel-50"
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
                    className="w-full border border-lab-steel-200 rounded-lg px-3 py-2 text-xs focus:border-lab-teal-600 focus:ring-4 focus:ring-lab-teal-600/10 outline-none font-mono font-semibold text-lab-steel-800"
                  />
                </div>
              </div>
            </div>

            <label className="flex items-center justify-between gap-4 border border-lab-steel-200 bg-white px-4 py-3 rounded-xl text-xs font-bold text-lab-steel-900 shadow-2xs hover:border-lab-steel-300 transition-colors cursor-pointer">
              <span className="uppercase tracking-wider">{t.avoidWeekendWork}</span>
              <input
                type="checkbox"
                checked={avoidWeekends}
                onChange={(event) => {
                  handleWeekendPreferenceInput(event.currentTarget.checked);
                }}
                onInput={(event) => {
                  handleWeekendPreferenceInput(event.currentTarget.checked);
                }}
                className="h-4.5 w-4.5 rounded accent-lab-teal-600 border-lab-steel-300"
              />
            </label>

            {startDateOptions.length ? (
              <div className="border border-lab-steel-200 bg-lab-steel-50/20 p-4 rounded-xl space-y-3">
                <h2 className="text-xs font-bold text-lab-steel-900 uppercase tracking-wider">
                  {t.startDayOptions}
                </h2>
                <p className="text-xs font-medium font-sans leading-relaxed text-lab-steel-500">
                  {t.startDayOptionsDescription}
                </p>
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {startDateOptions.map((option) => {
                    const isCurrent = option.startDate === startDate;
                    const isPreviewed = option.startDate === previewStartDate;

                    return (
                      <button
                        key={option.startDate}
                        className={`w-full border p-3 text-left rounded-lg transition-all cursor-pointer ${
                          isPreviewed
                            ? "border-lab-teal-600 bg-lab-teal-50/50 shadow-sm"
                            : isCurrent
                              ? "border-lab-teal-600 bg-white shadow-2xs"
                              : "border-lab-steel-200 bg-white hover:border-lab-steel-300 hover:shadow-2xs"
                        }`}
                        onClick={() => handleStartDatePreview(option.startDate)}
                        type="button"
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block text-xs font-bold text-lab-steel-900 truncate font-sans">
                              {formatDate(
                                combineDateAndTime(option.startDate, "00:00"),
                                language,
                              )}
                            </span>
                            <span className="mt-1 block text-xs text-lab-steel-500 font-sans leading-normal">
                              {t.finishDate}:{" "}
                              <span className="font-mono">{formatDate(option.finishDate, language)}</span>
                            </span>
                          </span>
                          <span className="flex flex-col items-end gap-1 flex-shrink-0">
                            {isCurrent ? (
                              <span className="border border-lab-teal-100 bg-lab-teal-50 px-1.5 py-0.5 rounded text-[10px] font-bold text-lab-teal-700 font-sans uppercase tracking-wide">
                                {t.currentStartDate}
                              </span>
                            ) : null}
                            {option.recommended ? (
                              <span className="border border-lab-amber-100 bg-lab-amber-50 px-1.5 py-0.5 rounded text-[10px] font-bold text-lab-amber-600 font-sans uppercase tracking-wide">
                                {t.recommended}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span className="mt-2 block text-xs text-lab-steel-500 font-sans font-medium leading-relaxed">
                          {option.warnings || option.shifted || option.calendarConflicts
                            ? `${t.warnings}: ${option.warnings} · ${t.adjusted}: ${option.shifted} · ${t.calendarConflictCount}: ${option.calendarConflicts}`
                            : t.noIssues}
                        </span>
                        <span className="mt-1.5 block text-[10px] font-bold text-lab-teal-700 font-sans uppercase tracking-wide">
                          {isPreviewed ? t.previewSelected : t.chooseStartDate}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {previewStartDate && previewStartDate !== startDate ? (
                  <button
                    className="w-full bg-lab-teal-600 hover:bg-lab-teal-700 py-2.5 rounded-lg text-xs font-bold text-white transition shadow-sm cursor-pointer font-sans"
                    onClick={applyPreviewStartDate}
                    type="button"
                  >
                    {t.applyStartDate}
                  </button>
                ) : null}
                <p className="text-xs leading-relaxed text-lab-steel-400 font-sans">
                  {t.startDateApplyHint}
                </p>
              </div>
            ) : null}

            <div className="border border-lab-steel-200 bg-lab-steel-50/20 p-4 rounded-xl">
              <h2 className="text-xs font-bold text-lab-steel-900 uppercase tracking-wider">{t.mvpBuildOrder}</h2>
              <ol className="mt-2.5 space-y-2 text-xs leading-normal text-lab-steel-500 font-medium">
                {t.buildOrder.map((item, index) => (
                  <li key={item} className="flex gap-2">
                    <span className="font-mono text-lab-teal-700">{index + 1}.</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          </aside>

          <section className="border border-[#d8e2d4] bg-white shadow-[0_10px_30px_rgba(31,54,39,0.05)]">
            <div className="flex flex-col gap-3 border-b border-[#d8e2d4] bg-[#fbfdf9] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
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
                  className="w-full border border-[#245e43] bg-[#245e43] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(36,94,67,0.22)] transition hover:bg-[#1d4d37] disabled:cursor-not-allowed disabled:border-[#bfd0c4] disabled:bg-[#d8e2d4] disabled:text-[#66756b] disabled:shadow-none sm:w-auto"
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
              <div className="space-y-6 p-6">
                <div className="border border-lab-steel-200 bg-lab-steel-50/30 p-5 rounded-2xl shadow-xs">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-lab-steel-900 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-lab-indigo-600"></span>
                        {t.experimentSet}
                      </h3>
                      <p className="mt-1.5 max-w-2xl text-xs text-lab-steel-500 font-medium leading-relaxed">
                        {t.experimentSetDescription}
                      </p>
                      <div className="mt-3 flex flex-col gap-1.5 text-xs text-lab-steel-600 font-sans leading-relaxed">
                        <span className="flex items-start gap-1.5">
                          <span className="inline-block w-1.5 h-1.5 border border-lab-steel-300 bg-lab-steel-100 rounded-sm mt-1.5 flex-shrink-0"></span>
                          <span>{t.setMoveNote}</span>
                        </span>
                        <span className="flex items-start gap-1.5 text-lab-teal-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-lab-teal-600 animate-pulse mt-1.5 flex-shrink-0"></span>
                          <span>{t.dragToMoveSet}</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2.5 flex-shrink-0">
                      <button
                        onClick={() => shiftDraftSet(-1)}
                        className="whitespace-nowrap px-4 py-2.5 border border-lab-steel-200 bg-white hover:bg-lab-steel-50 rounded-lg text-xs font-bold text-lab-steel-700 transition cursor-pointer shadow-xs font-sans"
                      >
                        {t.moveSetEarlier}
                      </button>
                      <button
                        onClick={() => shiftDraftSet(1)}
                        className="whitespace-nowrap px-4 py-2.5 border border-lab-steel-200 bg-white hover:bg-lab-steel-50 rounded-lg text-xs font-bold text-lab-steel-700 transition cursor-pointer shadow-xs font-sans"
                      >
                        {t.moveSetLater}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
                  <div>
                    <h3 className="text-sm font-bold text-lab-steel-900 uppercase tracking-wider pb-2 border-b border-lab-steel-100 mb-4 flex items-center justify-between">
                      <span>{t.draftCalendar}</span>
                      <span className="text-[10px] text-lab-steel-400 font-mono font-bold">GRID-MODE: 7-DAY CALENDAR</span>
                    </h3>
                    
                    {/* Weekday Header Bar for Desktops */}
                    <div className="grid grid-cols-7 gap-3 mb-2 text-center text-[10px] font-bold text-lab-steel-500 font-sans tracking-wider uppercase border-b border-lab-steel-100 pb-2 hidden md:grid">
                      {(language === "ko" 
                        ? ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"] 
                        : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
                      ).map((dayName, idx) => (
                        <div key={dayName} className={idx === 0 || idx === 6 ? "text-lab-amber-600" : "text-lab-steel-500"}>
                          {dayName}
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-3 grid-cols-1 md:grid-cols-7">
                      {/* Align first day to the correct weekday column */}
                      {(() => {
                        const firstDateKey = draftDates[0];
                        const startDayOfWeek = firstDateKey ? new Date(`${firstDateKey}T00:00:00`).getDay() : 0;
                        return Array.from({ length: startDayOfWeek }).map((_, idx) => (
                          <div 
                            key={`empty-${idx}`} 
                            className="hidden md:flex border border-dashed border-lab-steel-100/50 rounded-2xl bg-lab-steel-50/5 min-h-48 items-center justify-center text-[10px] font-bold text-lab-steel-300 font-mono uppercase"
                          >
                            OUT OF RANGE
                          </div>
                        ));
                      })()}

                      {draftDates.map((dateKey) => {
                        const dateObj = new Date(`${dateKey}T00:00:00`);
                        const dayOfWeek = dateObj.getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                        return (
                          <section
                            key={dateKey}
                            onDragLeave={() => setDragTargetDate("")}
                            onDragOver={(event) => {
                              event.preventDefault();
                              setDragTargetDate(dateKey);
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              const eventId =
                                event.dataTransfer.getData("text/plain") ||
                                draggedEventId;
                              handleDraftEventDrop(eventId, dateKey);
                            }}
                            className={`min-h-48 border rounded-2xl bg-precision-grid transition duration-200 flex flex-col overflow-hidden ${
                              dragTargetDate === dateKey
                                ? "border-lab-teal-500 ring-4 ring-lab-teal-500/10 bg-lab-teal-50/10"
                                : isWeekend
                                  ? "border-lab-steel-200 bg-lab-steel-50/30 shadow-2xs"
                                  : "border-lab-steel-200 bg-white shadow-2xs"
                            }`}
                          >
                            <div className={`border-b border-lab-steel-100 px-3.5 py-2.5 flex items-center justify-between ${
                              isWeekend ? "bg-lab-steel-100/30" : "bg-lab-steel-50/50"
                            }`}>
                              <p className={`text-xs font-bold font-mono tracking-tight flex items-center gap-1.5 ${
                                isWeekend ? "text-lab-amber-600" : "text-lab-steel-800"
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  isWeekend ? "bg-lab-amber-500 animate-pulse" : "bg-lab-teal-500 animate-pulse"
                                }`}></span>
                                {formatDate(dateObj, language)}
                              </p>
                            </div>
                            <div className="space-y-3 p-3 flex-1">
                              {groupedDraftEvents[dateKey].map((event) => {
                                const movementDetails = getMovementDetails(event);
                                const categoryAccent = getCategoryAccent(event.category);

                                return (
                                  <button
                                    draggable
                                    key={event.id}
                                    onClick={() => setSelectedEventId(event.id)}
                                    onDragEnd={() => {
                                      setDraggedEventId("");
                                      setDragTargetDate("");
                                    }}
                                    onDragStart={(dragEvent) => {
                                      setDraggedEventId(event.id);
                                      setSelectedEventId(event.id);
                                      dragEvent.dataTransfer.setData(
                                        "text/plain",
                                        event.id,
                                      );
                                      dragEvent.dataTransfer.effectAllowed = "move";
                                    }}
                                    className={`relative w-full border rounded-xl py-3 pl-4 pr-3.5 text-left transition duration-200 cursor-grab active:cursor-grabbing ${
                                      selectedEventId === event.id
                                        ? "border-lab-teal-600 bg-lab-teal-50/40 ring-1 ring-lab-teal-600/20 shadow-xs"
                                        : "border-lab-steel-200 bg-white hover:border-lab-steel-400 hover:shadow-xs"
                                    }`}
                                  >
                                    <span
                                      className={`absolute bottom-0 left-0 top-0 w-1 rounded-l-xl ${categoryAccent.bar}`}
                                    />
                                    <span className="block text-xs font-bold text-lab-steel-500 font-mono tracking-tight uppercase">
                                      {formatTime(event.date, language)} ·{" "}
                                      {formatDuration(event.durationMinutes, language)}
                                    </span>
                                    <span className="mt-1 block text-sm font-bold text-lab-steel-900 leading-snug">
                                      {event.name}
                                    </span>
                                    <span
                                      className={`mt-2 inline-block border rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono ${categoryAccent.chip}`}
                                    >
                                      {t.categories[event.category]}
                                    </span>
                                    {movementDetails.moved && movementDetails.originalDate ? (
                                      <span className="mt-3 block text-xs font-medium text-lab-amber-700 bg-lab-amber-50/60 border border-lab-amber-100 rounded-lg px-2.5 py-1.5 font-sans leading-normal">
                                        {t.adjustedFrom}:{" "}
                                        <span className="font-mono font-bold">
                                          {formatDate(movementDetails.originalDate, language)}{" "}
                                          {formatTime(movementDetails.originalDate, language)}
                                        </span>
                                      </span>
                                    ) : null}
                                    {movementDetails.reasons.length ? (
                                      <span className="mt-2.5 block text-xs font-medium text-lab-amber-600 pl-2 border-l-2 border-lab-amber-300 font-sans leading-normal">
                                        {movementDetails.reasons[0]}
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  </div>

                <aside className="border border-lab-steel-200 bg-lab-steel-50/20 p-5 rounded-2xl shadow-xs self-start">
                  <h3 className="text-xs font-bold text-lab-steel-900 uppercase tracking-wider flex items-center gap-2 border-b border-lab-steel-100 pb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-lab-teal-600 animate-pulse"></span>
                    {t.editEvent}
                  </h3>
                  {selectedEvent ? (
                    <div className="mt-4 space-y-4">
                      <label className="block text-[10px] font-bold text-lab-steel-500 uppercase tracking-wider">
                        {t.eventName}
                        <input
                          className="mt-1.5 w-full border border-lab-steel-200 bg-white px-3 py-2 text-xs font-medium text-lab-steel-800 rounded-lg outline-none focus:border-lab-teal-600 focus:ring-2 focus:ring-lab-teal-500/10 transition"
                          value={selectedEvent.name}
                          onChange={(event) =>
                            updateDraftEvent(selectedEvent.id, {
                              name: event.currentTarget.value,
                            })
                          }
                        />
                      </label>

                      <label className="block text-[10px] font-bold text-lab-steel-500 uppercase tracking-wider">
                        {t.eventDate}
                        <input
                          className="mt-1.5 w-full border border-lab-steel-200 bg-white px-3 py-2 text-xs font-bold text-lab-steel-800 font-mono rounded-lg outline-none focus:border-lab-teal-600 focus:ring-2 focus:ring-lab-teal-500/10 transition"
                          type="date"
                          value={formatDateInput(selectedEvent.date)}
                          onChange={(event) =>
                            updateDraftEvent(selectedEvent.id, {
                              date: event.currentTarget.value,
                            })
                          }
                        />
                      </label>

                      <label className="block text-[10px] font-bold text-lab-steel-500 uppercase tracking-wider">
                        {t.eventTime}
                        <input
                          className="mt-1.5 w-full border border-lab-steel-200 bg-white px-3 py-2 text-xs font-bold text-lab-steel-800 font-mono rounded-lg outline-none focus:border-lab-teal-600 focus:ring-2 focus:ring-lab-teal-500/10 transition"
                          type="time"
                          value={formatTimeInput(selectedEvent.date)}
                          onChange={(event) =>
                            updateDraftEvent(selectedEvent.id, {
                              time: event.currentTarget.value,
                            })
                          }
                        />
                      </label>

                      <label className="block text-[10px] font-bold text-lab-steel-500 uppercase tracking-wider">
                        {t.eventDuration} (Min)
                        <input
                          className="mt-1.5 w-full border border-lab-steel-200 bg-white px-3 py-2 text-xs font-bold text-lab-steel-800 font-mono rounded-lg outline-none focus:border-lab-teal-600 focus:ring-2 focus:ring-lab-teal-500/10 transition"
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

                      <div className="border border-lab-steel-200 bg-white p-4 rounded-xl shadow-xs">
                        <p className="text-[10px] font-bold text-lab-steel-600 uppercase tracking-wider">
                          {t.shiftFollowingEvents}
                        </p>
                        <div className="mt-2.5 grid grid-cols-2 gap-2">
                          <button
                            className="whitespace-nowrap px-3 py-2.5 border border-lab-steel-200 bg-white hover:bg-lab-steel-50 rounded-lg text-xs font-bold text-lab-steel-700 transition cursor-pointer shadow-2xs font-sans"
                            onClick={() => shiftDraftEventsFrom(selectedEvent.id, -1)}
                            type="button"
                          >
                            {t.moveFollowingEarlier}
                          </button>
                          <button
                            className="whitespace-nowrap px-3 py-2.5 border border-lab-steel-200 bg-white hover:bg-lab-steel-50 rounded-lg text-xs font-bold text-lab-steel-700 transition cursor-pointer shadow-2xs font-sans"
                            onClick={() => shiftDraftEventsFrom(selectedEvent.id, 1)}
                            type="button"
                          >
                            {t.moveFollowingLater}
                          </button>
                        </div>
                      </div>

                      <div className="border border-lab-steel-200 bg-white p-4 rounded-xl text-xs text-lab-steel-500 leading-relaxed shadow-xs space-y-3.5">
                        <h4 className="text-xs font-bold text-lab-steel-900 uppercase tracking-wider border-b border-lab-steel-100 pb-2 font-sans">
                          {t.scheduleExplanation}
                        </h4>
                        <div className="space-y-3.5 font-medium">
                          <p>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-lab-steel-400 font-sans">
                              {t.currentDraftTime}
                            </span>
                            <span className="text-xs font-bold text-lab-steel-800 font-sans leading-normal">
                              {formatDate(selectedEvent.date, language)}{" "}
                              <span className="font-mono">{formatTime(selectedEvent.date, language)}</span>
                            </span>
                          </p>
                          <p>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-lab-steel-400 font-sans">
                              {t.originalCalculatedTime}
                            </span>
                            <span
                              className={`text-xs font-bold font-sans leading-normal ${
                                selectedMovementDetails?.moved
                                  ? "text-lab-amber-600 bg-lab-amber-50 px-2 py-0.5 rounded-md"
                                  : "text-lab-steel-800"
                              }`}
                            >
                              {selectedMovementDetails?.originalDate
                                ? `${formatDate(
                                    selectedMovementDetails.originalDate,
                                    language,
                                  )} ${formatTime(
                                    selectedMovementDetails.originalDate,
                                    language,
                                  )}`
                                : t.noMovementNeeded}
                            </span>
                          </p>
                          {selectedEvent.conflict ? (
                            <p>
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-lab-steel-400 font-sans">
                                {t.conflictAvoided}
                              </span>
                              <span className="text-xs font-bold text-lab-amber-600 bg-lab-amber-50 px-2 py-0.5 rounded-md font-sans leading-normal">
                                {selectedEvent.conflict}
                              </span>
                            </p>
                          ) : null}
                        </div>
                        <div className="mt-3 border-t border-lab-steel-100 pt-2.5 text-xs font-sans font-bold text-lab-steel-400 space-y-1.5">
                          <p className="flex justify-between">
                            <span>SEQUENCE ID:</span>
                            <span className="text-lab-steel-700 font-mono">DAY {selectedEvent.dayOffset}</span>
                          </p>
                          <p className="flex justify-between">
                            <span>{t.protocolPlaceholder.toUpperCase()}:</span>
                            <span className="text-lab-steel-700 font-sans">{selectedEvent.protocol}</span>
                          </p>
                        </div>
                        {selectedMovementDetails?.reasons.length ? (
                          <div className="mt-3 border-t border-lab-steel-100 pt-2.5">
                            <p className="text-xs font-bold text-lab-amber-700 uppercase tracking-wider font-sans">
                              {t.movedBecause}
                            </p>
                            <ul className="mt-1 space-y-1.5 text-xs font-medium text-lab-amber-600 pl-3.5 list-disc font-sans leading-normal">
                              {selectedMovementDetails.reasons.map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                            </ul>
                          </div>
                        ) : selectedMovementDetails?.moved ? null : (
                          <p className="mt-3 border-t border-lab-steel-100 pt-2.5 text-xs font-bold text-lab-teal-600 font-sans flex items-center gap-1.5 leading-normal">
                            <span className="w-1.5 h-1.5 bg-lab-teal-500 rounded-full animate-pulse"></span>
                            {t.noMovementNeeded.toUpperCase()}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs leading-normal text-lab-steel-400 font-semibold text-center py-8">
                      {t.selectEventToEdit}
                    </p>
                  )}
                </aside>
                </div>
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
