import { connection } from "next/server";
import { getViewer, deny } from "@/lib/viewer";
import { chatChannel } from "@/lib/session";
import { thorBroadcast } from "@/lib/thorData";
import { CHAT_EVENT, CHAT_MAX_TEXT, type ChatMsg } from "@/lib/chat";

const UID_RE = /^[\w.@-]{1,80}$/;
const recent = new Map<string, number[]>();

/** Gửi 1 tin: không có `to` → chat thế giới; có `to` → chat riêng (chỉ người nhận, người gửi và Admin nhận được). */
export async function POST(req: Request) {
  await connection();
  const v = await getViewer();
  if (!v) return deny(401, "Cần đăng nhập");
  let body: { text?: unknown; to?: unknown; toName?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_TEXT) : "";
  if (!text) return Response.json({ error: "Tin trống" }, { status: 400 });

  // chống spam: tối đa 12 tin / 10 giây / người
  const now = Date.now();
  const hist = (recent.get(v.uid) ?? []).filter((t) => now - t < 10_000);
  if (hist.length >= 12) return Response.json({ error: "Gửi nhanh quá, chờ chút nhé" }, { status: 429 });
  hist.push(now);
  recent.set(v.uid, hist);

  const to = typeof body.to === "string" && body.to ? body.to : null;
  if (to && !UID_RE.test(to)) return Response.json({ error: "Người nhận không hợp lệ" }, { status: 400 });
  const toName = typeof body.toName === "string" ? body.toName.slice(0, 40) : "";
  const msg: ChatMsg = {
    id: `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    t: now,
    world: !to,
    from: { uid: v.uid, name: v.name },
    ...(to ? { to: { uid: to, name: toName || "?" } } : {}),
    text,
  };

  const topics = to
    ? [...new Set([await chatChannel(`inbox:${to}`), await chatChannel(`inbox:${v.uid}`), await chatChannel("admin")])]
    : [await chatChannel("world")];
  const ok = await thorBroadcast(topics.map((topic) => ({ topic, event: CHAT_EVENT, payload: msg })));
  if (!ok) return Response.json({ error: "Chưa gửi được (máy chủ chưa nối kênh thời gian thực)" }, { status: 503 });
  return Response.json({ ok: true, id: msg.id });
}
