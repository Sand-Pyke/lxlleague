import { register } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function POST(request: import("next/server").NextRequest) {
  return register(request);
}
