import { type NextRequest } from "next/server";
import { getMatchLineup } from "@/server/matches";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return getMatchLineup((await params).id, request.nextUrl.searchParams.get("round"));
}
