import { connection } from "next/server";
import { getDuty, getDutyDemo } from "@/lib/duty";
import { thorConnected } from "@/lib/thorData";

export async function GET(req: Request) {
  await connection();
  if (!thorConnected()) return Response.json([], { status: 200 });
  try {
    const demo = new URL(req.url).searchParams.get("demo") === "1";
    return Response.json(demo ? await getDutyDemo() : await getDuty());
  } catch {
    return Response.json([]);
  }
}
