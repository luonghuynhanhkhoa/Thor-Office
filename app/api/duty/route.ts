import { connection } from "next/server";
import { getDuty, getDutyDemo } from "@/lib/duty";
import { thorConnected } from "@/lib/thorData";
import { deny, getViewer } from "@/lib/viewer";

/**
 * Ai đang trực. Admin: đủ giờ ca. Người thường: chỉ đủ để VẼ nhân vật trong văn phòng (tên, vai trò, trạng thái) —
 * KHÔNG có giờ ca, giờ nghỉ, và không có người đã hết ca.
 */
export async function GET(req: Request) {
  await connection();
  const v = await getViewer();
  if (!v) return deny(401, "Cần đăng nhập");
  if (!thorConnected()) return Response.json([], { status: 200 });
  try {
    const demo = new URL(req.url).searchParams.get("demo") === "1" && v.admin;
    const list = demo ? await getDutyDemo() : await getDuty();
    if (v.admin) return Response.json(list);
    return Response.json(list.filter((s) => s.state !== "done").map(({ id, name, role, idx, state }) => ({ id, name, role, idx, state })));
  } catch {
    return Response.json([]);
  }
}
