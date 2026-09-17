import { getCurrentUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function GET(request: import("next/server").NextRequest) {
  return getCurrentUser(request);
}
