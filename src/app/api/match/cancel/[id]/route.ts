import { updateSignup } from "@/server/matches";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return updateSignup((await params).id, "cancel");
}
