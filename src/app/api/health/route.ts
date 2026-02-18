import { NextResponse } from "next/server";
import { getRecentErrors } from "@/lib/error-monitoring";

const version = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
const startedAt = new Date().toISOString();

export function GET() {
  const recentErrors = getRecentErrors();
  return NextResponse.json({
    status: "ok",
    version,
    startedAt,
    timestamp: new Date().toISOString(),
    errors: {
      recent: recentErrors.length,
      last: recentErrors.length > 0
        ? {
            message: recentErrors[recentErrors.length - 1].message,
            timestamp: recentErrors[recentErrors.length - 1].timestamp,
            component: recentErrors[recentErrors.length - 1].context.component,
          }
        : null,
    },
  });
}
