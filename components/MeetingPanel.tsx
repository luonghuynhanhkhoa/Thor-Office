"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MeetingCall, type MeetPeer, type RtConfig } from "@/lib/realtimeClient";

function Video({ stream, muted, label, state }: { stream: MediaStream | null; muted?: boolean; label: string; state?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-800">
      <video ref={ref} autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
      {!stream && <div className="absolute inset-0 grid place-items-center text-2xl">👤</div>}
      <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {label}
        {state && state !== "connected" ? ` · ${state === "connecting" || state === "new" ? "đang nối…" : state}` : ""}
      </div>
    </div>
  );
}

/** Phòng họp: gọi audio/video với những người đang vào phòng họp (WebRTC nhiều người). */
export default function MeetingPanel({ cfg, me, onClose }: { cfg: RtConfig; me: { id: string; name: string }; onClose: () => void }) {
  // Tạo MỘT lần cho tới khi đóng bảng (không tạo lại khi trang cha vẽ lại — nếu không cuộc gọi sẽ bị ngắt).
  const [call] = useState(() => new MeetingCall(cfg, me));
  const s = useSyncExternalStore(call.subscribe, call.getSnapshot, call.getSnapshot);
  const [, setTick] = useState(0);

  useEffect(() => {
    return () => call.leave();
  }, [call]);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 4000); // làm mới nhãn trạng thái kết nối
    return () => clearInterval(t);
  }, []);

  return (
    <div className="absolute bottom-28 left-4 z-30 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-amber-300 bg-white/95 p-3 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-extrabold text-amber-900">📞 Phòng họp {s.joined ? `· ${s.members.length} người` : ""}</div>
        <button onClick={onClose} className="rounded px-2 text-lg leading-none text-slate-500 hover:bg-slate-100" aria-label="Đóng">
          ×
        </button>
      </div>
      {!s.joined ? (
        <div className="space-y-2">
          <p className="text-[12px] leading-snug text-slate-600">Vào phòng họp để gọi audio/video với những người cũng đang ở trong phòng. Trình duyệt sẽ xin quyền micro/camera.</p>
          {s.error && <div className="text-xs text-red-600">{s.error}</div>}
          <button
            onClick={() => void call.join()}
            disabled={s.joining}
            className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {s.joining ? "Đang vào…" : "Vào phòng họp"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {s.note && <div className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">{s.note}</div>}
          <div className="grid grid-cols-2 gap-2">
            <Video stream={s.local} muted label={`${me.name} (bạn)`} />
            {s.peers.map((p: MeetPeer) => (
              <Video key={p.id} stream={p.stream} label={p.name} state={p.state} />
            ))}
          </div>
          {s.peers.length === 0 && <div className="text-center text-[11px] text-slate-500">Chưa có ai khác trong phòng họp — chờ người cùng vào.</div>}
          <div className="flex gap-2">
            <button onClick={() => call.toggleMic()} className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${s.mic ? "bg-slate-100 text-slate-700" : "bg-red-100 text-red-700"}`}>
              {s.mic ? "🎤 Mic bật" : "🔇 Mic tắt"}
            </button>
            <button onClick={() => call.toggleCam()} className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${s.cam ? "bg-slate-100 text-slate-700" : "bg-red-100 text-red-700"}`}>
              {s.cam ? "📷 Cam bật" : "🚫 Cam tắt"}
            </button>
            <button onClick={() => call.leave()} className="flex-1 rounded-lg bg-red-500 py-1.5 text-xs font-bold text-white">
              Rời phòng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
