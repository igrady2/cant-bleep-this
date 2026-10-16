import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminHeaders } from "@/lib/admin/access";

/**
 * First line of the Worker's own Access check for admin paths (#23). The admin
 * page and every admin route handler verify again, so a matcher gap cannot
 * open them.
 */
export async function proxy(request: NextRequest) {
  const result = await verifyAdminHeaders(request.headers);
  if (result.ok) return NextResponse.next();
  const headers = { "Cache-Control": "no-store" };
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Admin access denied." }, { status: result.status, headers });
  }
  return new NextResponse("Admin access denied.", { status: result.status, headers });
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
