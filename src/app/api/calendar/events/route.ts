import { createServerClient } from "@supabase/ssr";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CalendarDraftEvent = {
  id: string;
  name: string;
  date: string;
  durationMinutes: number;
  category: string;
  conflict: string | null;
  dayOffset: number;
  protocol: string;
};

type GoogleCalendarEvent = {
  id: string;
  htmlLink: string;
  summary: string;
};

type CalendarSyncRun = {
  avoidWeekends: boolean;
  preferredStartTime: string;
  startDate: string;
  templateName: string;
};

async function createSupabaseRouteClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      error: "Missing Supabase environment variables.",
      supabase: null,
    };
  }

  const cookieStore = await cookies();

  return {
    error: null,
    supabase: createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }),
  };
}

async function getGoogleSession() {
  const { error, supabase } = await createSupabaseRouteClient();

  if (error || !supabase) {
    return {
      error: error ?? "Unable to create Supabase client.",
      supabase: null,
      token: null,
      userId: null,
    };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    return {
      error: sessionError.message,
      supabase,
      token: null,
      userId: null,
    };
  }

  if (!session?.provider_token) {
    return {
      error: "Google Calendar is not connected. Please connect Google again.",
      supabase,
      token: null,
      userId: session?.user.id ?? null,
    };
  }

  return {
    error: null,
    supabase,
    token: session.provider_token,
    userId: session.user.id,
  };
}

function createCalendarError(message: string, status = 400) {
  return NextResponse.json(
    {
      error: message,
    },
    { status },
  );
}

function toGoogleDateTime(dateValue: string, durationMinutes: number) {
  const start = new Date(dateValue);

  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const end = new Date(start);
  end.setMinutes(end.getMinutes() + Math.max(1, durationMinutes));

  return {
    end,
    start,
  };
}

function createSyncSignature(run: CalendarSyncRun, events: CalendarDraftEvent[]) {
  const normalizedEvents = events.map((event) => ({
    category: event.category,
    date: event.date,
    dayOffset: event.dayOffset,
    durationMinutes: event.durationMinutes,
    name: event.name,
    protocol: event.protocol,
  }));

  return createHash("sha256")
    .update(
      JSON.stringify({
        events: normalizedEvents,
        run,
      }),
    )
    .digest("hex");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const timeMin =
    searchParams.get("timeMin") ?? new Date().toISOString();
  const timeMax =
    searchParams.get("timeMax") ??
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error, token } = await getGoogleSession();

  if (error || !token) {
    return createCalendarError(error ?? "Missing Google access token.", 401);
  }

  const googleResponse = await fetch(
    "https://www.googleapis.com/calendar/v3/freeBusy",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [{ id: "primary" }],
        timeMax,
        timeMin,
      }),
    },
  );

  if (!googleResponse.ok) {
    return createCalendarError(
      `Unable to read Google Calendar busy blocks. (${googleResponse.status})`,
      googleResponse.status,
    );
  }

  const data = await googleResponse.json();

  return NextResponse.json({
    busy: data.calendars?.primary?.busy ?? [],
  });
}

export async function POST(request: Request) {
  const { error, supabase, token, userId } = await getGoogleSession();

  if (error || !token) {
    return createCalendarError(error ?? "Missing Google access token.", 401);
  }

  const body = await request.json().catch(() => null);
  const events = body?.events as CalendarDraftEvent[] | undefined;
  const run = body?.run as CalendarSyncRun | undefined;
  const timeZone =
    typeof body?.timeZone === "string" && body.timeZone
      ? body.timeZone
      : "UTC";

  if (!events?.length) {
    return createCalendarError("No calendar events were provided.");
  }

  if (!run?.startDate || !run.preferredStartTime || !run.templateName) {
    return createCalendarError("Missing experiment run details.");
  }

  const syncSignature = createSyncSignature(run, events);
  let persistenceWarning: string | null = null;

  if (supabase && userId) {
    const { data: existingRun, error: existingRunError } = await supabase
      .from("experiment_runs")
      .select("id")
      .eq("user_id", userId)
      .eq("sync_signature", syncSignature)
      .maybeSingle();

    if (existingRun) {
      return NextResponse.json(
        {
          duplicate: true,
          error:
            "This schedule has already been synced. Edit the draft schedule before syncing again.",
        },
        { status: 409 },
      );
    }

    if (existingRunError) {
      persistenceWarning = existingRunError.message;
    }
  }

  const createdEvents: GoogleCalendarEvent[] = [];

  for (const event of events) {
    const dateTime = toGoogleDateTime(event.date, event.durationMinutes);

    if (!dateTime) {
      return createCalendarError(`Invalid date for event: ${event.name}`);
    }

    const googleResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: [
            `Category: ${event.category}`,
            `Protocol: ${event.protocol}`,
            "Created by LabFlow AI Scheduler.",
          ].join("\n"),
          end: {
            dateTime: dateTime.end.toISOString(),
            timeZone,
          },
          start: {
            dateTime: dateTime.start.toISOString(),
            timeZone,
          },
          summary: event.name,
        }),
      },
    );

    if (!googleResponse.ok) {
      return createCalendarError(
        `Unable to create Google Calendar event "${event.name}". (${googleResponse.status})`,
        googleResponse.status,
      );
    }

    const created = await googleResponse.json();
    createdEvents.push({
      id: created.id,
      htmlLink: created.htmlLink,
      summary: created.summary,
    });
  }

  if (supabase && userId) {
    const { data: experimentRun, error: runError } = await supabase
      .from("experiment_runs")
      .insert({
        avoid_weekends: run.avoidWeekends,
        name: run.templateName,
        preferred_start_time: run.preferredStartTime,
        start_date: run.startDate,
        status: "scheduled",
        sync_signature: syncSignature,
        user_id: userId,
      })
      .select("id")
      .single();

    if (runError || !experimentRun) {
      persistenceWarning =
        runError?.message ?? "Unable to save the experiment run in Supabase.";
    } else {
      const { error: eventsError } = await supabase.from("scheduled_events").insert(
        events.map((event, index) => ({
          category: event.category,
          conflict_label: event.conflict,
          day_offset: event.dayOffset,
          duration_minutes: event.durationMinutes,
          google_event_id: createdEvents[index]?.id ?? null,
          run_id: experimentRun.id,
          starts_at: new Date(event.date).toISOString(),
          step_name: event.name,
          user_id: userId,
        })),
      );

      if (eventsError) {
        persistenceWarning = eventsError.message;
      }
    }
  }

  return NextResponse.json({
    createdEvents,
    persistenceWarning,
  });
}
