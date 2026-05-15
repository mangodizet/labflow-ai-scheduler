import { createSupabaseBrowserClient } from "./client";

const googleCalendarScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.events.freebusy",
].join(" ");

export async function signInWithGoogleCalendar() {
  const supabase = createSupabaseBrowserClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || window.location.origin;

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

export async function getCurrentUserProfile() {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  return user
    ? {
        email: user.email ?? null,
        id: user.id,
      }
    : null;
}

export async function getCurrentUserEmail() {
  const profile = await getCurrentUserProfile();

  return profile?.email ?? null;
}

export async function signOut() {
  const supabase = createSupabaseBrowserClient();
  return supabase.auth.signOut();
}
