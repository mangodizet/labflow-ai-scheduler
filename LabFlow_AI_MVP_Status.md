# LabFlow AI Scheduler - MVP Scenario and Progress

## Project

- Project name: LabFlow AI Scheduler
- Folder: `E:\work\AI\labflow-ai-scheduler`
- App URL: `http://localhost:3000`
- Stack: Next.js, TypeScript, Tailwind CSS
- Current phase: Frontend MVP prototype

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

- Created Next.js project in `E:\work\AI\labflow-ai-scheduler`
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
- Added OAuth callback route at `/auth/callback`
- Added placeholder Calendar API route at `/api/calendar/events`

Validated:

- `npm run lint` passed
- `npm run build` passed
- `npm test` passed
- Browser page loaded successfully
- Browser console showed no errors or warnings during review

Known dependency note:

- `npm audit` reports a moderate PostCSS advisory through `next@16.2.6`.
- The suggested automatic fix would downgrade Next.js to 9.x, which is a breaking change and was not applied.

## Current Files of Interest

- `src/app/page.tsx`: Main interactive MVP prototype
- `src/lib/scheduler.ts`: Rule-based scheduling utilities and shared scheduler types
- `src/lib/scheduler.test.ts`: Scheduler unit tests
- `src/lib/supabase/client.ts`: Supabase browser client setup
- `src/lib/supabase/auth.ts`: Google OAuth sign-in helper with Calendar scopes
- `src/app/auth/callback/route.ts`: Supabase OAuth callback handler
- `src/app/api/calendar/events/route.ts`: Calendar integration API placeholder
- `src/app/layout.tsx`: App metadata and root layout
- `src/app/globals.css`: Global styles
- `package.json`: Project scripts and dependencies

## Known Issues and Follow-Up Items

### Resolved: Conflict move can land on a weekend

Conflict handling now re-runs weekend validation after moving a conflicted task.

### Resolved: Hands-on total includes assay time

The `Hands-on` summary now filters to steps with `category === "Hands-on"`.

## Next Development Steps

1. Configure Supabase project values in `.env.local`
2. Configure Google OAuth consent screen, OAuth client, and Calendar API
3. Add database tables for templates, steps, runs, protocol links, and note links
4. Implement real Google Calendar event reads in `/api/calendar/events`
5. Replace mock conflicts with real calendar busy blocks
6. Add calendar event creation flow
7. Add deployment configuration for Vercel

## Git and Push Preparation

Local Git repository should include:

- Project source files
- `package.json`
- `package-lock.json`
- This scenario/progress document

Files that should remain ignored:

- `node_modules/`
- `.next/`
- local environment files such as `.env.local`

Push requires a remote repository URL, for example:

```bash
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

## Status Date

- Last updated: 2026-05-08
