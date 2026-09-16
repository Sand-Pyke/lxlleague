import { updateSignup } from "@/server/matches";

export const dynamic = "force-dynamic";

export async function POST(
  request: import("next/server").NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return updateSignup(request, (await params).id, "cancel");
}
