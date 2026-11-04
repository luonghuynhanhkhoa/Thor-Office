import { connection } from "next/server";
import { readMaintenance, setMaintenance } from "@/lib/maintenance";

export async function GET() {
  await connection();
  return Response.json(readMaintenance());
}

export async function POST(req: Request) {
  await connection();
  try {
    const body = (await req.json()) as { dept?: string; on?: boolean };
    return Response.json(setMaintenance(String(body.dept ?? ""), body.on === true));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
