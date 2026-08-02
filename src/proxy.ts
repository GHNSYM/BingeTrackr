import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the auth session on every request. Do NOT remove this line.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A signed-in visitor has no use for the marketing page — send them to the
  // app. This lives here rather than in `(marketing)/page.tsx` on purpose: the
  // page is otherwise fully static, and reading cookies inside it would make
  // `/` dynamic and cost an extra auth round-trip per visit. The proxy already
  // has the user in hand.
  //
  // Onboarding state is deliberately NOT checked here — that would mean a
  // `profiles` read on every request through the proxy. `/home` sits under
  // `(app)`, whose layout already runs `requireOnboardedUser()` and bounces
  // placeholder handles to `/onboarding`, so the guard stays in one place.
  if (user && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    const redirect = NextResponse.redirect(url);
    // Carry over any cookies the refresh above rotated, or the redirect lands
    // on /home with a stale session and bounces straight back to /login.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
