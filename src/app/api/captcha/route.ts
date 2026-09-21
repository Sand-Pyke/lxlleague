import { createCaptcha } from "@/server/auth";

export const dynamic = "force-dynamic";

export function GET(request: import("next/server").NextRequest) {
  return createCaptcha(request);
}
