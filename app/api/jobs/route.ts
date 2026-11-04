import { connection } from "next/server";
import { listJobs, startJob } from "@/lib/orchestrator";

export async function GET() {
  await connection();
  return Response.json({ jobs: listJobs() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { request?: string } | null;
  const text = body?.request?.trim();
  if (!text) return Response.json({ error: "Thiếu nội dung yêu cầu" }, { status: 400 });
  const job = startJob(text.slice(0, 500));
  return Response.json({ id: job.id });
}
