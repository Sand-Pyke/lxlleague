import { importContext } from "@/server/import";

export const dynamic = "force-dynamic";

export async function GET(request: import("next/server").NextRequest) {
  return importContext(request);
}
