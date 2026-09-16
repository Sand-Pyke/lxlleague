import { createCaptcha } from "@/server/auth";

export const dynamic = "force-dynamic";

export function GET() {
  return createCaptcha();
}
