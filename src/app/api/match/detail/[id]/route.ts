import type { NextRequest } from "next/server";
import { getMatchDetail } from "@/server/matches";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return getMatchDetail(request, (await params).id);
}
