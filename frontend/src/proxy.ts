import { NextResponse, type NextRequest } from "next/server";

// UX only: sends visitors without a session cookie to the login page before a
// private page renders. The real check is requireUser() in src/server/auth.ts.
const PRIVATE = ["/u/me", "/host", "/settings", "/notifications"];
const COOKIE = process.env.SESSION_COOKIE || "nn_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!PRIVATE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (request.cookies.get(COOKIE)?.value) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/u/me", "/host/:path*", "/settings", "/notifications"],
};
