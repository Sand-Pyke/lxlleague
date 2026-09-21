import { getMatchRounds } from "@/server/matches";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return getMatchRounds((await params).id);
}
