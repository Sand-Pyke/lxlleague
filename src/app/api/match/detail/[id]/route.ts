import { getMatchDetail } from "@/server/matches";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return getMatchDetail((await params).id);
}
