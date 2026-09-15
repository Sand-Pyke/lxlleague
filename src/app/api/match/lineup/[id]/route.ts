import { getMatchLineup } from "@/server/matches";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return getMatchLineup((await params).id);
}
