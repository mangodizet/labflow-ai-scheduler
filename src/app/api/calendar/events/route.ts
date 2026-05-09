import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CalendarDraftEvent = {
  id: string;
  name: string;
  date: string;
  durationMinutes: number;
  category: string;
  protocol: string;
};

type GoogleCalendarEvent = {
  id: string;
  htmlLink: string;
  summary: string;
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

async function getGoogleAccessToken() {
  const { error, supabase } = await createSupabaseRouteClient();

  if (error || !supabase) {
    return {
      error: error ?? "Unable to create Supabase client.",
      token: null,
    };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    return {
      error: sessionError.message,
      token: null,
    };
  }

  if (!session?.provider_token) {
    return {
      error: "Google Calendar is not connected. Please connect Google again.",
      token: null,
    };
  }

  return {
    error: null,
    token: session.provider_token,
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const timeMin =
    searchParams.get("timeMin") ?? new Date().toISOString();
  const timeMax =
    searchParams.get("timeMax") ??
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error, token } = await getGoogleAccessToken();

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
  const { error, token } = await getGoogleAccessToken();

  if (error || !token) {
    return createCalendarError(error ?? "Missing Google access token.", 401);
  }

  const body = await request.json().catch(() => null);
  const events = body?.events as CalendarDraftEvent[] | undefined;
  const timeZone =
    typeof body?.timeZone === "string" && body.timeZone
      ? body.timeZone
      : "UTC";

  if (!events?.length) {
    return createCalendarError("No calendar events were provided.");
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

  return NextResponse.json({
    createdEvents,
  });
}
