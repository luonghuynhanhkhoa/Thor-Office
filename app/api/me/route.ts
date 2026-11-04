import { connection } from "next/server";
import { authMode } from "@/lib/session";
import { getViewer } from "@/lib/viewer";
import { channelNamespace, chatChannelsFor } from "@/lib/session";
import { thorPublic } from "@/lib/thorData";

/** Ai đang dùng + quyền (để giao diện ẩn/khoá đúng chỗ — quyền THẬT vẫn do từng API kiểm). Kèm thông số kênh thời gian thực nếu có. */
export async function GET() {
  await connection();
  const v = await getViewer();
  if (!v) return Response.json({ mode: authMode(), user: null }, { status: 401 });
  const pub = thorPublic();
  return Response.json({
    mode: authMode(),
    user: { uid: v.uid, name: v.name, admin: v.admin, role: v.role, staffIds: v.staffIds, email: v.email },
    realtime: pub ? { url: pub.url, key: pub.key, ns: await channelNamespace() } : null,
    chat: await chatChannelsFor(v.uid, v.admin),
  });
}
