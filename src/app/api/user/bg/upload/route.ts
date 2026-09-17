import { uploadBackground } from "@/server/account";

export const dynamic = "force-dynamic";

export async function POST(request: import("next/server").NextRequest) {
  return uploadBackground(request);
}
