import { createSupabaseBrowserClient } from "./client";

const googleCalendarScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.events.readonly",
].join(" ");

export async function signInWithGoogleCalendar() {
  const supabase = createSupabaseBrowserClient();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;

  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
      scopes: googleCalendarScopes,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });
}
