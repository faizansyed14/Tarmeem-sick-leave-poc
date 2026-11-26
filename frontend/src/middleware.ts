import { NextResponse, type NextRequest } from "next/server";
import { HOME_PATH, isHidden } from "@/lib/features";

const PUBLIC = ["/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has("tlm_session");
  if (!hasSession && !PUBLIC.some((p) => pathname.startsWith(p))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" && pathname !== HOME_PATH && !isHidden(pathname) ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }
  if (pathname === "/" || isHidden(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = HOME_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
