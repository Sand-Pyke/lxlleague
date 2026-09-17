import { listMatches } from "@/server/matches";

export const dynamic = "force-dynamic";

export async function GET(request: import("next/server").NextRequest) {
  return listMatches(request);
}
