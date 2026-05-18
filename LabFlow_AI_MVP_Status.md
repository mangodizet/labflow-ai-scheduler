# LabFlow AI Scheduler - MVP Scenario and Progress

## Project

- Project name: LabFlow AI Scheduler
- Folder: `E:\AI\labflow-ai-scheduler`
- App URL: `http://localhost:3000`
- Deployed URL: `https://labflow-ai-scheduler.vercel.app/`
- GitHub repository: `https://github.com/mangodizet/labflow-ai-scheduler`
- Stack: Next.js, TypeScript, Tailwind CSS
- Current phase: Custom workflow template persistence and scheduler stabilization

## Original MVP Scenario

LabFlow AI is a research workflow scheduling platform for biological experiments such as THP-1 macrophage differentiation, M1/M2 polarization, cell culture workflows, encapsulation workflows, Live/Dead assays, and imaging schedules.

The goal is to let researchers select or create experiment workflows, choose a start date, automatically generate optimized schedules, avoid weekends and calendar conflicts, then sync the final schedule to Google Calendar.

## Core User Problem

Researchers often manage complex biological timelines manually using calendars, notebooks, and memory. Workflows can include incubation timing, waiting periods, media changes, assay schedules, weekend conflicts, and existing meeting conflicts.

Example workflow:

1. Prepare THP-1 cells
2. PMA treatment for 24 hours
3. Rest for 2 days
4. Treat with IL4 / IL13 for 3 days
5. Encapsulation
6. Live/Dead assay on Day 1
7. Additional assay on Day 3

## MVP Target Users

- Postdoctoral researchers
- Graduate students
- Cell biology researchers
- Immunology researchers
- Bioengineering labs

Initial workflow focus:

- THP-1 differentiation
- M1 / M2 polarization
- Cell culture scheduling

## MVP Feature Scope

### 1. Experiment Templates

Users can select or save recurring workflows.

Initial examples:

- THP-1 M2 Polarization
- Cell Culture Maintenance

### 2. Start Date and Work Preferences

Users can set:

- Experiment start date
- Preferred start time
- Weekend avoidance preference

### 3. Automatic Timeline Generation

The app calculates scheduled experiment steps from template offsets and durations.

Current prototype includes:

- Step names
- Day offsets
- Duration
- Category labels
- Protocol placeholders
- Adjusted schedule preview

### 4. Weekend Avoidance

The prototype can move Saturday/Sunday tasks to the next valid weekday.

Known improvement needed:

- Conflict adjustments should also re-run weekend validation after moving a task.

### 5. Calendar Conflict Handling

Current state:

- Mock conflicts are hardcoded for prototype review.
- Real Google Calendar read/write integration is not implemented yet.

### 6. Protocol and Research Note Links

Current state:

- Protocol link placeholders are displayed per workflow step.
- Real URL storage and note linking are not implemented yet.

## Current Implementation Status

Completed:

- Created Next.js project in `E:\AI\labflow-ai-scheduler`
- Added TypeScript and ESLint setup through `create-next-app`
- Replaced default Next.js page with LabFlow AI Scheduler MVP screen
- Added two in-memory experiment templates
- Added start date input
- Added preferred start time input
- Added weekend avoidance toggle
- Added generated timeline preview
- Added mock conflict display
- Added summary metrics for steps, scheduled workload, and adjusted events
- Updated page metadata to `LabFlow AI Scheduler`
- Verified local app at `http://localhost:3000`
- Refactored rule-based scheduling into `src/lib/scheduler.ts`
- Fixed weekend revalidation after mock conflict shifts
- Fixed the `Hands-on` summary to count only hands-on workflow steps
- Added visible feedback for the calendar sync preparation button
- Added Vitest unit tests for scheduler weekend handling, conflict shifts, and category totals
- Added Supabase client setup for Google OAuth
- Added Google Calendar connection UI with environment setup feedback
- Added Google Calendar setup guide
- Added current user detection and disconnect UI for authenticated sessions
- Added OAuth callback route at `/auth/callback`
- Added placeholder Calendar API route at `/api/calendar/events`
- Changed the scheduler flow so users select an experiment and set date/time before a timeline is generated
- Added initial Supabase schema migration for experiment templates, workflow steps, runs, scheduled events, protocol links, and research notes
- Pushed the project to GitHub at `https://github.com/mangodizet/labflow-ai-scheduler`
- Deployed the app to Vercel at `https://labflow-ai-scheduler.vercel.app/`
- Added an English/Korean language toggle for the main scheduling UI
- Replaced the generated schedule list with an editable draft calendar view
- Added event editing for draft event name, date, time, and duration before Google Calendar sync
- Added scheduler stabilization for invalid date/time input handling
- Added same-day sequential placement so overlapping workflow steps are pushed later in the day
- Added working-hours overflow handling that moves tasks to the next valid workday
- Added scheduler warning codes and localized UI warning messages
- Added unit tests for sequential placement, working-hours overflow, invalid inputs, and invalid durations
- Replaced the Calendar API placeholder with Google Calendar free/busy reads and primary-calendar event creation
- Connected the draft calendar sync button to the Calendar API route
- Added localized Google Calendar sync success, progress, and failure messages
- Removed hardcoded mock calendar conflicts from the UI scheduling flow
- Added Google Calendar busy-block loading for connected users
- Added date-based conflict detection so real busy blocks can shift generated schedule steps
- Added Supabase persistence after Google Calendar sync
- Calendar sync now creates an `experiment_runs` record and stores synced `scheduled_events.google_event_id`
- Added UI warning text for cases where Google events are created but Supabase sync records fail to save
- Added duplicate Google Calendar sync prevention using an experiment run sync signature
- Added Supabase migration `0002_add_calendar_sync_signature.sql`
- Added deterministic Google Calendar event IDs so duplicate event creation is also blocked even if Supabase persistence is not ready
- Changed Google OAuth busy-read scope to `calendar.events.freebusy` to match Google Cloud data access setup
- Added detailed Google Calendar API error messages for busy-block reads and event creation failures
- Fixed scheduler conflict avoidance so it keeps moving through consecutive busy calendar dates
- Added manual, focus-based, and periodic Google Calendar conflict refresh
- Persisted the selected EN/KO language in local storage so OAuth redirects keep the user's language
- Changed Google Calendar conflict loading from free/busy-only reads to event-list reads so LabFlow-created events are excluded from future conflict checks
- Added a pre-sync calendar refresh guard that updates the draft and stops sync when external calendar conflicts changed
- Added Supabase-backed custom template persistence for connected users
- Custom templates now load from Supabase after sign-in, while browser local storage remains as a fallback before sign-in
- Saving, updating, and deleting custom templates now writes to the user's Supabase `experiment_templates` and `workflow_steps` rows when authenticated
- Added a protocol quick builder that can turn pasted protocol text into an editable template draft
- Added a THP-1 2D differentiation and M2 polarization sample based on the provided PDF protocol
- Replaced the preferred start time browser time picker with an AM/PM selector and typed time field for easier input
- Preferred start time now accepts compact numeric input such as `0900` or `930` and normalizes it to `09:00` or `09:30`

Validated:

- `npm run lint` passed
- `npm run build` passed
- `npm test` passed
- Browser page loaded successfully
- Browser console showed no errors or warnings during review
- Vercel deployment returned `200 OK`
- Vercel deployment title verified as `LabFlow AI Scheduler`
- English/Korean language toggle verified in the local browser
- Draft calendar view and event edit panel verified in the local browser
- Calendar API route builds successfully, but live Google sync still requires Supabase and Google OAuth environment configuration
- Real busy-block conflict detection is wired in code and will activate after Google OAuth is configured and connected
- Supabase sync persistence is wired in code and will activate after the migration is applied
- Duplicate sync prevention requires the `0002_add_calendar_sync_signature.sql` migration
- Browser check confirmed the local scheduler form generates a draft calendar without console errors
- Added test coverage for consecutive Google Calendar busy days
- Google Calendar sync no longer treats events created by LabFlow AI Scheduler as external conflicts

Known dependency note:

- `npm audit` reports a moderate PostCSS advisory through `next@16.2.6`.
- The suggested automatic fix would downgrade Next.js to 9.x, which is a breaking change and was not applied.

## Current Files of Interest

- `src/app/page.tsx`: Main interactive MVP prototype
- `src/lib/scheduler.ts`: Rule-based scheduling utilities and shared scheduler types
- `src/lib/scheduler.test.ts`: Scheduler unit tests
- `src/lib/supabase/client.ts`: Supabase browser client setup
- `src/lib/supabase/auth.ts`: Google OAuth sign-in, current user, and sign-out helpers
- `src/app/auth/callback/route.ts`: Supabase OAuth callback handler
- `src/app/api/calendar/events/route.ts`: Google Calendar conflict read, event sync, and synced event deletion API
- `GOOGLE_CALENDAR_SETUP.md`: Supabase and Google Cloud setup guide
- `supabase/migrations/0001_initial_labflow_schema.sql`: Initial database schema and RLS policies
- `src/app/layout.tsx`: App metadata and root layout
- `src/app/globals.css`: Global styles
- `package.json`: Project scripts and dependencies

## Known Issues and Follow-Up Items

### Resolved: Conflict move can land on a weekend

Conflict handling now re-runs weekend validation after moving a conflicted task.

### Resolved: Hands-on total includes assay time

The `Hands-on` summary now filters to steps with `category === "Hands-on"`.

### Resolved: Same-day steps can overlap

Steps assigned to the same day are now placed sequentially using the previous event end time.

### Resolved: Tasks can exceed working hours without notice

The scheduler now moves tasks that do not fit within the configured working day to the next valid workday and displays a warning.

### Resolved: Invalid scheduler inputs are not guarded

Invalid date/time inputs now return an empty generated schedule, and invalid step durations are clamped with a warning.

### Resolved: Calendar resync feedback is ambiguous

Google Calendar sync now reports newly created events separately from events that already existed and were skipped.

### Added: Delete synced calendar events

Users can delete the synced Google Calendar events for the current draft schedule in one action. The delete flow also removes the matching Supabase sync record when available, so the same draft can be synced again cleanly.

### Stabilization: Calendar sync and delete responsiveness

Google Calendar event creation and deletion now run in parallel for the current draft schedule instead of waiting for each event one by one. The delete flow avoids an immediate conflict refresh and tells users that Google Calendar's visible UI may take a moment to reflect deletion.

### Added: Manual experiment template builder

Users can create a custom experiment template in the app by entering a template name, summary, and editable steps with day offset, duration, category, and protocol notes. Custom templates are stored in browser local storage and can be selected immediately in the scheduler.

### Added: Custom template edit and delete controls

Saved custom templates can be selected, loaded back into the builder, updated, or deleted from browser local storage.

### Added: Supabase-backed custom template storage

Connected users can save, update, delete, and reload custom experiment templates through Supabase. Local storage remains as a fallback for templates created before sign-in or when Supabase is not configured.

### Added: Protocol quick builder

Users can paste rough protocol text and generate an editable schedule draft. The first sample is based on the provided THP-1 2D differentiation and polarization PDF, using the M0 differentiation plus M2 polarization path.

### UX Improvement: Preferred start time input

The preferred start time now uses an AM/PM selector plus a typed time field, avoiding browser-specific time picker drag controls while preserving the internal 24-hour scheduler value.

The typed field accepts compact values such as `0900`, `900`, `0930`, or `9:30` and normalizes valid inputs automatically.

### Stabilization: Calendar conflict refresh cadence

Calendar conflicts are checked when schedule inputs are ready, when the user clicks refresh, and immediately before syncing. The previous interval/focus refresh behavior was removed to reduce Google Calendar API traffic and make refresh timing easier to understand.

### Stabilization: Calendar sync API input guardrails

The calendar sync route now requires an authenticated user ID, limits each sync to 50 events, rejects missing event names or IDs, and bounds event duration to 1-1440 minutes before calling Google Calendar.

### Security Review Notes

- No local secret environment file is tracked in Git.
- `.env.local.example` contains placeholders only.
- Supabase uses the public publishable key in the browser and server route; no service-role key is used in application code.
- Google provider tokens are read only inside the server API route from the Supabase session and are not returned to the browser.
- Supabase tables have RLS enabled with `auth.uid() = user_id` policies.
- `0003_grant_authenticated_table_access.sql` grants table access to authenticated users while relying on RLS policies for row isolation.
- `npm audit --audit-level=moderate` currently reports a moderate PostCSS advisory through Next.js. Next.js `16.2.6` is the latest stable version available, and the suggested `npm audit fix --force` downgrade path is not safe to apply.

## Future Expansion After Scheduler MVP

These ideas are intentionally deferred until the core scheduler and Google Calendar integration are working reliably.

### Research Note and Result Entry

Add an experiment run detail page where researchers can record:

- Experiment objective
- Experimental conditions
- Observations
- Result notes
- Image or Google Drive links
- Assay values such as viability, fluorescence intensity, or pass/fail status
- Issues encountered during the experiment
- Ideas for the next run

### AI Experiment Summary

After notes and results are entered, AI can help generate:

- A concise experiment summary
- Key observations
- Possible failure points
- A short report for a supervisor or collaborator

The AI should avoid making unsupported scientific conclusions and should frame interpretation as hypotheses or items to verify.

### AI Result Interpretation

Potential future support:

- Suggest possible reasons for low viability
- Highlight timing or workflow issues
- Compare planned steps with observed outcomes
- Identify missing controls or follow-up measurements

This feature should be treated as decision support, not as an authoritative biological conclusion.

### Next Experiment Planning

AI may later suggest a next experiment plan based on notes and results, for example:

- Add or modify control groups
- Adjust timepoints
- Compare alternative treatment conditions
- Recommend repeat runs
- Generate a draft schedule from the suggested follow-up experiment

## Next Development Steps

1. Confirm the latest Vercel deployment after each push
2. Add drag/drop or direct calendar resizing for draft schedule editing
3. Add a visible conflict-review panel showing which Google busy blocks affected the schedule
4. Add an in-app sync history view backed by Supabase
5. Replace MVP example schedules with validated lab protocols provided by the user or collaborator
6. Improve the guided workflow import flow with smarter parsing and optional AI review
7. Add a template import/export or sharing flow after the private template storage is stable

## Git and Deployment

Local Git repository includes:

- Project source files
- `package.json`
- `package-lock.json`
- This scenario/progress document
- Supabase migration files
- Google Calendar setup guide

Files that should remain ignored:

- `node_modules/`
- `.next/`
- local environment files such as `.env.local`

Remote:

```bash
origin https://github.com/mangodizet/labflow-ai-scheduler.git
```

Deployment:

```text
https://labflow-ai-scheduler.vercel.app/
```

## Status Date

- Last updated: 2026-05-18
