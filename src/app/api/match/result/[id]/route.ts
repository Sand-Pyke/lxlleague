import { getMatchResult } from "@/server/matches";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return getMatchResult((await params).id);
}
