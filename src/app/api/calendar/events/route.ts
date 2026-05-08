import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      events: [],
      message:
        "Google Calendar event reads will be connected after Supabase Google OAuth is configured.",
    },
    { status: 501 },
  );
}

export async function POST() {
  return NextResponse.json(
    {
      createdEvents: [],
      message:
        "Google Calendar event creation will be connected after Supabase Google OAuth is configured.",
    },
    { status: 501 },
  );
}
