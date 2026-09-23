import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.OPENROUTER_API_KEY || process.env.JEV_ACCESS_TOKEN),
    accessRequired: Boolean(process.env.JEV_APP_PASSWORD),
  });
}
