import { NextResponse } from "next/server";

const version = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
const startedAt = new Date().toISOString();

export function GET() {
  return NextResponse.json({
    status: "ok",
    version,
    startedAt,
    timestamp: new Date().toISOString(),
  });
}
