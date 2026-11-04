import { connection } from "next/server";
import { readMaintenance, setMaintenance } from "@/lib/maintenance";
import { adminOnly, deny, getViewer } from "@/lib/viewer";

export async function GET() {
  await connection();
  if (!(await getViewer())) return deny(401, "Cần đăng nhập");
  return Response.json(readMaintenance());
}

/** Bật/tắt "đang chỉnh sửa" của phòng — CHỈ admin. */
export async function POST(req: Request) {
  await connection();
  const [, blocked] = await adminOnly();
  if (blocked) return blocked;
  try {
    const body = (await req.json()) as { dept?: string; on?: boolean };
    return Response.json(setMaintenance(String(body.dept ?? ""), body.on === true));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
