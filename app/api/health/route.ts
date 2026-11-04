import { connection } from "next/server";
import { diagnose } from "@/lib/thorData";
import { adminOnly } from "@/lib/viewer";

/** Kiểm tra kết nối dữ liệu Thor — CHỈ admin. Không trả về khoá. */
export async function GET() {
  await connection();
  const [, blocked] = await adminOnly();
  if (blocked) return blocked;
  return Response.json(await diagnose());
}
