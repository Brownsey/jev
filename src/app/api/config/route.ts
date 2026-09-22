import { NextResponse } from "next/server";
import { DEFAULT_MODEL } from "../../../lib/lab";
import { isJevModel } from "../../../lib/models";

export function GET() {
  const configuredModel = process.env.JEV_MODEL || DEFAULT_MODEL;
  return NextResponse.json({
    configured: Boolean(process.env.OPENROUTER_API_KEY),
    accessRequired: Boolean(process.env.JEV_ACCESS_TOKEN),
    model: isJevModel(configuredModel) ? configuredModel : DEFAULT_MODEL,
  });
}
