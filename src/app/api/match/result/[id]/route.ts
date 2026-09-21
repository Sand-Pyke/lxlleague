import { getMatchResult } from "@/server/matches";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const query = new URL(request.url).searchParams;
  const num = (value: string | null) => {
    const parsed = value === null ? null : Number(value);
    return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  };
  return getMatchResult((await params).id, {
    round: num(query.get("round")),
    teamOneId: num(query.get("t1")),
    teamTwoId: num(query.get("t2")),
  });
}
