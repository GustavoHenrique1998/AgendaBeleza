import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const { pathname } = req.nextUrl;

    const isAdminRoute = pathname.startsWith("/admin");
    const isBookingRoute = pathname === "/agendar" || pathname.startsWith("/agendar/");
    const isUserRoute = pathname === "/meus-agendamentos" || pathname.startsWith("/meus-agendamentos/");

    if (isAdminRoute) {
      if (token?.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/login?error=unauthorized", req.url));
      }
      return NextResponse.next();
    }

    if ((isBookingRoute || isUserRoute) && !token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ["/admin/:path*", "/agendar", "/agendar/:path*", "/meus-agendamentos", "/meus-agendamentos/:path*"],
};
