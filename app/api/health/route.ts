import { connection } from "next/server";
import { diagnose } from "@/lib/thorData";

/** Kiểm tra kết nối dữ liệu Thor (cần đăng nhập). Không trả về khoá. */
export async function GET() {
  await connection();
  return Response.json(await diagnose());
}
