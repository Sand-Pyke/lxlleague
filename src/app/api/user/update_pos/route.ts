import { updatePosition } from "@/server/account";

export const dynamic = "force-dynamic";

export async function POST(request: import("next/server").NextRequest) {
  return updatePosition(request);
}
