import { NextResponse } from "next/server";
import { DEFAULT_MODEL } from "../../../lib/lab";

export function GET() {
  return NextResponse.json({ configured: Boolean(process.env.OPENROUTER_API_KEY), accessRequired: Boolean(process.env.JEV_ACCESS_TOKEN), model: process.env.JEV_MODEL || DEFAULT_MODEL });
}
