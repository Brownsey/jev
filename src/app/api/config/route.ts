import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.OPENROUTER_API_KEY),
    accessRequired: Boolean(process.env.JEV_ACCESS_TOKEN),
  });
}
