import { connection } from "next/server";
import { runnerMode } from "@/lib/runner";
import { thorConnected } from "@/lib/thorData";

export async function GET() {
  await connection(); // luôn chạy lúc có yêu cầu (không dựng sẵn khi build)
  return Response.json({ runner: runnerMode(), thorConnected: thorConnected() });
}
