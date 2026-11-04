import { connection } from "next/server";
import { getTvData } from "@/lib/tv";
import { thorConnected } from "@/lib/thorData";

export async function GET() {
  await connection();
  if (!thorConnected()) return Response.json({ error: "Chưa nối được dữ liệu Thor" }, { status: 503 });
  return Response.json(await getTvData());
}
