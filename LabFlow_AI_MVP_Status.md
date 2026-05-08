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

Validated:

- `npm run lint` passed
- `npm run build` passed
- Browser page loaded successfully
- Browser console showed no errors or warnings during review

## Current Files of Interest

- `src/app/page.tsx`: Main interactive MVP prototype
- `src/app/layout.tsx`: App metadata and root layout
- `src/app/globals.css`: Global styles
- `package.json`: Project scripts and dependencies

## Known Issues and Follow-Up Items

### P2: Conflict move can land on a weekend

Current conflict handling moves a conflicted task by one day after weekend avoidance has already run. If that move lands on Saturday or Sunday, the task can still end up on a weekend even when weekend avoidance is enabled.

Recommended fix:

- Move scheduling logic into `src/lib/scheduler.ts`
- Add a single `findNextValidSlot` function
- Re-run weekend and work-hour checks after each conflict adjustment

### P3: Hands-on total includes assay time

The summary card labeled `Hands-on` currently sums all scheduled steps, including `Assay` tasks.

Recommended fix:

- Either filter the total to `category === "Hands-on"`
- Or rename the metric to `Total scheduled work`

## Next Development Steps

1. Refactor scheduler logic into `src/lib/scheduler.ts`
2. Fix weekend handling after conflict shifts
3. Correct or rename the hands-on summary metric
4. Add basic unit tests for scheduling rules
5. Add Supabase Auth with Google OAuth
6. Add database tables for templates, steps, runs, protocol links, and note links
7. Add Google Calendar API integration
8. Replace mock conflicts with real calendar reads
9. Add calendar event creation flow
10. Add deployment configuration for Vercel

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
