import { connection } from "next/server";
import { getTvData } from "@/lib/tv";
import { thorConnected } from "@/lib/thorData";
import { adminOnly } from "@/lib/viewer";

/** Số liệu Tivi các phòng — CHỈ admin. Người khác bấm Tivi sẽ thấy "Yêu Cầu Quyền Truy Cập". */
export async function GET() {
  await connection();
  const [, blocked] = await adminOnly();
  if (blocked) return blocked;
  if (!thorConnected()) return Response.json({ error: "Chưa nối được dữ liệu Thor" }, { status: 503 });
  return Response.json(await getTvData());
}
