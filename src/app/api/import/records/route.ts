import { importRecords } from "@/server/import";

export const dynamic = "force-dynamic";

export async function POST(request: import("next/server").NextRequest) {
  return importRecords(request);
}
