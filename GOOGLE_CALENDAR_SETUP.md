# Google Calendar Integration Setup

This project is ready for Supabase Google OAuth wiring, but real Google Calendar reads and writes require external console setup first.

## 1. Create a Supabase Project

1. Create a Supabase project.
2. Open Project Settings > API.
3. Copy the project URL and anon public key.
4. Create `.env.local` from `.env.local.example`.

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Do not commit `.env.local`.

## 2. Configure Google Cloud

1. Create or select a Google Cloud project.
2. Enable the Google Calendar API.
3. Configure the OAuth consent screen.
4. Create an OAuth 2.0 Client ID for a web application.
5. Add the Supabase callback URL as an authorized redirect URI.

The Supabase callback URL has this form:

```text
https://<your-supabase-project-ref>.supabase.co/auth/v1/callback
```

## 3. Configure Supabase Google Provider

1. Open Supabase Authentication > Providers.
2. Enable Google.
3. Paste the Google OAuth Client ID.
4. Paste the Google OAuth Client Secret.
5. Save the provider settings.

## 4. Apply the Database Schema

The initial schema is stored in:

```text
supabase/migrations/0001_initial_labflow_schema.sql
```

Apply it through the Supabase SQL editor or the Supabase CLI after linking a project.

The schema creates:

- `experiment_templates`
- `workflow_steps`
- `experiment_runs`
- `scheduled_events`
- `protocol_links`
- `research_note_links`

Each table uses row level security so authenticated users can only manage rows they own.

## 5. Calendar Scopes Used by the App

The app currently requests:

```text
openid
email
profile
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar.events.readonly
```

These scopes allow the app to identify the user, read calendar events for conflict detection, and create experiment events after user approval.

## 6. Local Verification

1. Restart the dev server after creating `.env.local`.
2. Open `http://localhost:3000`.
3. Click `Connect Google Calendar`.
4. Complete Google consent.
5. Confirm the app redirects back to `/`.

## 7. Next Code Step

After OAuth works, replace the placeholder implementation in:

- `src/app/api/calendar/events/route.ts`

with real Google Calendar event reads and writes using the provider access token from the Supabase session.
