import { connection } from "next/server";
import { Ctx } from "@/lib/thorData";
import { allStaff } from "@/lib/queries";
import { personCard } from "@/lib/lookup";
import { deny, getViewer } from "@/lib/viewer";

/** Thẻ thông tin gọn của một nhân viên. Admin xem được mọi người; người thường CHỈ xem được chính mình. */
export async function GET(req: Request) {
  await connection();
  const v = await getViewer();
  if (!v) return deny(401, "Cần đăng nhập");
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!v.admin && !v.staffIds.includes(id)) return deny();
  try {
    const ctx = new Ctx();
    const p = (await allStaff(ctx)).find((s) => s.id === id);
    if (!p) return Response.json({ error: "Không thấy nhân viên này" }, { status: 404 });
    return Response.json(await personCard(ctx, p));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
