"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMsg } from "@/lib/chat";

type Person = { uid: string; name: string };

// Nhận giọng nói có sẵn của trình duyệt (Chrome/Edge); kiểu dữ liệu tối thiểu vì thư viện TypeScript chưa có.
type SpeechResultEvent = { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
const makeRecognizer = (): Recognizer | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
};

const nowMs = () => Date.now();
const hhmm = (t: number) => new Date(t).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

/**
 * Chat: tab "Thế giới" (mọi người thấy) + mỗi người một tab riêng (chỉ 2 người trong cuộc thấy). Admin có thêm tab "Giám sát" xem được cả chat riêng của người khác.
 * Tin không được lưu: chỉ người đang mở văn phòng lúc gửi mới nhận được.
 */
export default function ChatPanel({
  me,
  admin,
  online,
  msgs,
  onSend,
  onClose,
}: {
  me: Person;
  admin: boolean;
  /** Những người đang trực tuyến (trừ mình) để bắt đầu chat riêng. */
  online: Person[];
  msgs: ChatMsg[];
  onSend: (to: Person | null, text: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<string>("world");
  const [extra, setExtra] = useState<Person[]>([]);
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognizer | null>(null);

  useEffect(() => () => rec.current?.stop(), []);

  /** Bấm 🎤 → nói tiếng Việt, chữ hiện dần vào ô nhập; ngừng nói là tự dừng. Bấm lần nữa để dừng sớm. */
  const toggleVoice = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = makeRecognizer();
    if (!r) {
      setErr("Trình duyệt này chưa hỗ trợ nhận giọng nói — dùng Chrome hoặc Edge nhé.");
      return;
    }
    setErr(null);
    const base = text.trim();
    r.lang = "vi-VN";
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      let said = "";
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
      setText(`${base} ${said}`.trim().slice(0, 400));
    };
    r.onerror = (e) =>
      setErr(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Chưa được cấp quyền micro — bấm biểu tượng khoá cạnh địa chỉ để cho phép."
          : e.error === "no-speech"
            ? "Không nghe thấy tiếng nói, thử lại nhé."
            : e.error === "aborted"
              ? null
              : "Không nhận giọng nói được, thử lại nhé."
      );
    r.onend = () => setListening(false);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setErr("Không bật được micro, thử lại nhé.");
    }
  };

  const mine = (m: ChatMsg) => m.from.uid === me.uid || m.to?.uid === me.uid;
  const tabOf = (m: ChatMsg) => (m.world ? "world" : mine(m) ? `dm:${m.from.uid === me.uid ? m.to?.uid : m.from.uid}` : "spy");

  // các cuộc chat riêng: từ tin đã có + người vừa chọn để bắt đầu
  const partners = useMemo(() => {
    const map = new Map<string, Person>(extra.map((p) => [p.uid, p]));
    for (const m of msgs) {
      if (m.world || !mine(m)) continue;
      const other = m.from.uid === me.uid ? m.to : m.from;
      if (other) map.set(other.uid, other);
    }
    return [...map.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs, extra, me.uid]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shown = useMemo(() => msgs.filter((m) => tabOf(m) === tab), [msgs, tab]);
  const unread = (key: string) => (key === tab ? 0 : msgs.filter((m) => tabOf(m) === key && m.from.uid !== me.uid && m.t > (seen[key] ?? 0)).length);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length, tab]);

  const pick = (next: string) => {
    const now = nowMs();
    setSeen((s) => ({ ...s, [tab]: now, [next]: now }));
    setTab(next);
    setErr(null);
  };

  const dmTarget = tab.startsWith("dm:") ? partners.find((p) => `dm:${p.uid}` === tab) ?? null : null;

  const send = async () => {
    const t = text.trim();
    if (!t || busy || tab === "spy") return;
    rec.current?.stop();
    setBusy(true);
    const e = await onSend(dmTarget, t);
    setBusy(false);
    setErr(e);
    if (!e) setText("");
  };

  const tabBtn = (key: string, label: string, n: number) => (
    <button
      key={key}
      onClick={() => pick(key)}
      className={`relative shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${tab === key ? "border-sky-500 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
    >
      {label}
      {n > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] font-extrabold text-white">{n}</span>}
    </button>
  );

  const startable = online.filter((o) => !partners.some((p) => p.uid === o.uid));

  return (
    <div className="absolute bottom-20 right-4 z-30 flex h-[min(430px,calc(100dvh-8rem))] w-[min(350px,calc(100vw-2rem))] flex-col rounded-2xl border border-sky-300 bg-white/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <div className="text-sm font-extrabold text-sky-800">💬 Chat</div>
        <button onClick={onClose} className="rounded px-2 text-lg leading-none text-slate-500 hover:bg-slate-100" aria-label="Đóng">
          ×
        </button>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 px-2 py-1.5">
        {tabBtn("world", "🌍 Thế giới", unread("world"))}
        {partners.map((p) => tabBtn(`dm:${p.uid}`, `🔒 ${p.name}`, unread(`dm:${p.uid}`)))}
        {admin && tabBtn("spy", "🕵 Giám sát", unread("spy"))}
        {startable.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const p = startable.find((x) => x.uid === e.target.value);
              if (!p) return;
              setExtra((x) => [...x, p]);
              pick(`dm:${p.uid}`);
            }}
            className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600"
            aria-label="Chat riêng với…"
          >
            <option value="">＋ Chat riêng…</option>
            {startable.map((o) => (
              <option key={o.uid} value={o.uid}>
                {o.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="px-3 pt-1.5 text-[10.5px] leading-snug text-slate-500">
        {tab === "world" && "Chat thế giới: mọi người trong văn phòng đều thấy."}
        {dmTarget && `Chat riêng với ${dmTarget.name}: chỉ hai người${admin ? "" : " (và Admin)"} thấy.`}
        {tab === "spy" && "Giám sát (Admin): chat riêng giữa những người khác."}
      </div>

      <div ref={listRef} className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
        {shown.length === 0 && <div className="pt-6 text-center text-[12px] text-slate-400">Chưa có tin nhắn. Tin chỉ hiện với người đang mở văn phòng.</div>}
        {shown.map((m) => {
          const own = m.from.uid === me.uid;
          return (
            <div key={m.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-[12.5px] leading-snug shadow-sm ${own ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-800"}`}>
                {!own && (
                  <div className="text-[10.5px] font-bold opacity-80">
                    {m.from.name}
                    {tab === "spy" && m.to ? ` → ${m.to.name}` : ""}
                  </div>
                )}
                <div className="break-words">{m.text}</div>
                <div className={`mt-0.5 text-right text-[9.5px] ${own ? "text-sky-100" : "text-slate-400"}`}>{hhmm(m.t)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {err && <div className="px-3 pb-1 text-[11px] font-semibold text-red-600">{err}</div>}
      {tab !== "spy" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex gap-1.5 border-t border-slate-200 p-2"
        >
          <button
            type="button"
            onClick={toggleVoice}
            title={listening ? "Đang nghe… bấm để dừng" : "Nói để nhập chữ (tiếng Việt)"}
            aria-label="Nhập bằng giọng nói"
            className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-[14px] ${listening ? "animate-pulse border-red-400 bg-red-50 text-red-600" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            🎤
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={400}
            placeholder={tab === "world" ? "Nhắn cho mọi người…" : `Nhắn riêng cho ${dmTarget?.name ?? ""}…`}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-1.5 text-[13px] outline-none focus:border-sky-500"
          />
          <button disabled={busy || !text.trim()} className="rounded-xl bg-sky-500 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">
            Gửi
          </button>
        </form>
      )}
    </div>
  );
}
