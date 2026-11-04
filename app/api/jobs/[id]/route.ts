import { connection } from "next/server";
import { getJob } from "@/lib/orchestrator";
import { adminOnly } from "@/lib/viewer";

export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  await connection();
  const [, blocked] = await adminOnly();
  if (blocked) return blocked;
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return Response.json({ error: "Không có công việc này" }, { status: 404 });
  return Response.json(job);
}
