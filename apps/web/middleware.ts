import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Routes reachable without an access token.
 *
 * PUBLIC_PATHS used to list `/settings`, `/calendar`, `/analysis` and `/goals`
 * — every dashboard route — so the token check below it was unreachable and an
 * unauthenticated visitor got a 200 on any page. The pages then rendered with
 * failed API calls, which the UI papered over with hard-coded defaults (a fake
 * readiness score, a fake athlete profile). Verified against production at the
 * time: `curl /settings` with no cookie returned 200 instead of a redirect.
 */
const PUBLIC_PATHS = ["/login", "/register", "/share", "/robots.txt"];

/**
 * Routes that require a session.
 *
 * Listed explicitly rather than inferred as "everything not public", because a
 * middleware runs before routing and cannot know whether a path exists. With
 * the inverse rule, an unauthenticated request to a typo (`/calender`) was
 * redirected to a login form — which tells the visitor the page exists and they
 * merely lack access. Unknown paths now fall through to the 404 page.
 *
 * Prefixes are matched on whole path segments, so `/goals` covers `/goals/123`
 * but not `/goalsomething`.
 */
const PROTECTED_PATHS = [
  "/activities",
  "/analysis",
  "/calendar",
  "/goals",
  "/settings",
  // Developer gallery of primitives. Nothing links to it, and it is part of
  // the platform rather than a public page.
  "/showcase",
];

/** Where an unauthenticated visitor is sent. */
const LOGIN_PATH = "/login";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get("access_token")?.value;

  // `/landing` was a marketing surface. The app opens straight into the
  // sign-in screen now, so the old URL points at `/` and the branch below
  // decides between the dashboard and the login form.
  if (pathname === "/landing") {
    return NextResponse.redirect(new URL("/", request.url), 308);
  }

  // `/` is the dashboard for a signed-in athlete and the sign-in screen
  // otherwise. The sign-in screen is a redirect rather than a rewrite so the
  // address bar and the cookie flow match what a native app does: you are at
  // the login page, and after signing in you land on the content.
  if (pathname === "/") {
    if (accessToken) return NextResponse.next();
    return redirectToLogin(request);
  }

  // Backward-compat: /settings?section=strength was re-homed to the calendar.
  // Handle in middleware (not next.config.js) so the source query is dropped
  // cleanly instead of being appended to the destination. It points straight at
  // the log view: `?view=strength` is itself a 308 to `?view=list`, and a
  // redirect to a redirect costs the browser a second round trip.
  if (pathname === "/settings" && request.nextUrl.searchParams.get("section") === "strength") {
    if (!accessToken) return redirectToLogin(request);
    return NextResponse.redirect(new URL("/calendar?view=list", request.url), 308);
  }

  // Signing in twice is a dead end: an athlete who already has a session and
  // lands on the sign-in screen goes straight to the dashboard, which is what
  // opening the app does.
  if ((pathname === "/login" || pathname === "/register") && accessToken) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isPublicPath(pathname)) return NextResponse.next();

  if (isProtectedPath(pathname) && !accessToken) {
    return redirectToLogin(request);
  }

  // Not public, not protected, and not a known route: let the router produce a
  // 404 rather than implying the page exists behind a login.
  return NextResponse.next();
}

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isPublicPath(pathname: string): boolean {
  return matchesPrefix(pathname, PUBLIC_PATHS);
}

function isProtectedPath(pathname: string): boolean {
  return matchesPrefix(pathname, PROTECTED_PATHS);
}

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL(LOGIN_PATH, request.url);
  // Preserve where the visitor was headed so login can return them there.
  const target = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (target && target !== "/") {
    loginUrl.searchParams.set("next", target);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|auth|webhooks).*)"],
};
