import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE_KEYS } from "@/lib/session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const uid = request.cookies.get(SESSION_COOKIE_KEYS.uid)?.value;
  const accountType = request.cookies.get(SESSION_COOKIE_KEYS.accountType)?.value;
  const status = request.cookies.get(SESSION_COOKIE_KEYS.status)?.value;
  const role = request.cookies.get(SESSION_COOKIE_KEYS.role)?.value;

  if (pathname.startsWith("/admin")) {
    if (!uid) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    if (accountType !== "admin") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  } else if (pathname.startsWith("/dashboard")) {
    if (!uid) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (accountType !== "front") {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  if (status === "pending") {
    return NextResponse.redirect(new URL("/pending", request.url));
  }

  if (status === "rejected") {
    return NextResponse.redirect(
      new URL(accountType === "admin" ? "/admin/login" : "/login", request.url),
    );
  }

  if (pathname === "/admin" && role !== "super_admin" && role !== "team_admin") {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
