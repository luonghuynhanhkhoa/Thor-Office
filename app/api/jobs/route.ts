import { connection } from "next/server";
import { listJobs, startJob } from "@/lib/orchestrator";
import { adminOnly, deny, getViewer } from "@/lib/viewer";

export async function GET() {
  await connection();
  const [, blocked] = await adminOnly();
  if (blocked) return blocked;
  return Response.json({ jobs: listJobs() });
}

/**
 * Giao việc: chạy công việc và PHÁT TRỰC TIẾP trạng thái (mỗi dòng 1 JSON) cho tới khi xong.
 * Cách này chạy được cả trên máy chủ không giữ trạng thái (Vercel): việc chạy và phát nằm trong CÙNG một lượt gọi.
 */
export async function POST(request: Request) {
  await connection();
  const viewer = await getViewer();
  if (!viewer) return deny(401, "Cần đăng nhập");
  const body = (await request.json().catch(() => null)) as { request?: string } | null;
  const text = body?.request?.trim();
  if (!text) return Response.json({ error: "Thiếu nội dung yêu cầu" }, { status: 400 });
  const job = startJob(text.slice(0, 500), viewer);

  const enc = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = () => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(job)}\n`));
        } catch {
          closed = true;
        }
      };
      send();
      while (!closed && job.phase !== "done" && job.phase !== "error") {
        await new Promise((r) => setTimeout(r, 500));
        send();
      }
      send();
      if (!closed) controller.close();
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
