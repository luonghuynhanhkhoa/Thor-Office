import { connection } from "next/server";
import { Ctx } from "@/lib/thorData";
import { allStaff } from "@/lib/queries";
import { personCard } from "@/lib/lookup";

/** Thẻ thông tin gọn của một nhân viên (chạm vào nhân vật trong văn phòng). */
export async function GET(req: Request) {
  await connection();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  try {
    const ctx = new Ctx();
    const p = (await allStaff(ctx)).find((s) => s.id === id);
    if (!p) return Response.json({ error: "Không thấy nhân viên này" }, { status: 404 });
    return Response.json(await personCard(ctx, p));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
