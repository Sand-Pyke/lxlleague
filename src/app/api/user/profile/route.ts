import { getProfile } from "@/server/profile";

export const dynamic = "force-dynamic";

export async function GET(request: import("next/server").NextRequest) {
  return getProfile(request);
}
