import { connection } from "next/server";
import { getJob } from "@/lib/orchestrator";

export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return Response.json({ error: "Không có công việc này" }, { status: 404 });
  return Response.json(job);
}
