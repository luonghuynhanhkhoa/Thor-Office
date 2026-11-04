import { connection } from "next/server";
import { getCasesDemo, getCasesToday } from "@/lib/cases";
import { thorConnected } from "@/lib/thorData";
import { adminOnly } from "@/lib/viewer";

/** Ca/đơn hôm nay của mọi Reader — CHỈ admin. */
export async function GET(req: Request) {
  await connection();
  const [, blocked] = await adminOnly();
  if (blocked) return blocked;
  if (!thorConnected()) return Response.json({ error: "Chưa nối được dữ liệu Thor" }, { status: 503 });
  try {
    const demo = new URL(req.url).searchParams.get("demo") === "1";
    return Response.json(demo ? await getCasesDemo() : await getCasesToday());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
