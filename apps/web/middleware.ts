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
const PUBLIC_PATHS = ["/landing", "/login", "/register", "/share", "/robots.txt"];

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
];

/** Where an unauthenticated visitor is sent. */
const LOGIN_PATH = "/login";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get("access_token")?.value;

  // `/` is the dashboard for a signed-in athlete and the landing page
  // otherwise. Both are legitimate, so this branch reads the cookie rather
  // than short-circuiting like the old `if (pathname === "/")` did.
  if (pathname === "/") {
    if (accessToken) return NextResponse.next();
    return NextResponse.rewrite(new URL("/landing", request.url));
  }

  // Backward-compat: /settings?section=strength was re-homed to
  // /calendar?view=strength in W6.5. Handle in middleware (not
  // next.config.js) so the source query is dropped cleanly instead
  // of being appended to the destination.
  if (pathname === "/settings" && request.nextUrl.searchParams.get("section") === "strength") {
    if (!accessToken) return redirectToLogin(request);
    return NextResponse.redirect(new URL("/calendar?view=strength", request.url), 308);
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
