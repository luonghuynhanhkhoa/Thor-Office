"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AGENTS, AGENT_BY_ID, type AgentId, type AgentState, type Job } from "@/lib/agentsMeta";

const Office3D = dynamic(() => import("@/components/Office3D"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center text-slate-400">Đang dựng văn phòng 3D…</div>
  ),
});

type Status = { runner: "api" | "cli" | "sim"; thorConnected: boolean };

const RUNNER_LABEL: Record<Status["runner"], { text: string; cls: string }> = {
  api: { text: "AI thật · Claude API", cls: "border-emerald-400/60 text-emerald-300" },
  cli: { text: "AI thật · Claude Code", cls: "border-emerald-400/60 text-emerald-300" },
  sim: { text: "Chế độ tự tính (chưa nối AI)", cls: "border-amber-400/60 text-amber-300" },
};

const SUGGESTIONS = [
  "Tổng quan tình hình hôm nay",
  "Kiểm tra đơn bị thiếu hoặc lỗi",
  "Ai đang trực hôm nay?",
  "Điểm QC của các Reader tháng này",
  "Khiếu nại nào đang mở?",
];

const PHASE_TEXT: Record<Job["phase"], string> = {
  planning: "Chỉ huy đang phân việc…",
  working: "Các AI đang làm việc…",
  composing: "Báo cáo đang gộp kết quả…",
  done: "Hoàn tất",
  error: "Có lỗi",
};

function blankStates(): Record<AgentId, AgentState> {
  return Object.fromEntries(AGENTS.map((a) => [a.id, { status: "idle" } as AgentState])) as Record<
    AgentId,
    AgentState
  >;
}

/** Hiển thị văn bản đơn giản: **đậm**, gạch đầu dòng, ### tiêu đề. */
function Md({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-[13px] leading-relaxed text-slate-200">
      {text.split("\n").map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (line.trim() === "---") return <hr key={i} className="my-2 border-white/10" />;
        const heading = /^#{1,4}\s+/.test(line);
        const content = line.replace(/^#{1,4}\s+/, "");
        const parts = content.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <strong key={j} className="font-semibold text-white">
              {p.slice(2, -2)}
            </strong>
          ) : (
            <span key={j}>{p}</span>
          )
        );
        return heading ? (
          <div key={i} className="pt-1.5 text-sm font-bold text-amber-300">
            {parts}
          </div>
        ) : (
          <div key={i} className={line.trim().startsWith("-") ? "pl-3" : ""}>
            {parts}
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [status, setStatus] = useState<Status | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [selected, setSelected] = useState<AgentId | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const jobId = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  // Hỏi trạng thái công việc đang chạy mỗi 0,8 giây cho tới khi xong.
  useEffect(() => {
    if (!job || job.phase === "done" || job.phase === "error") return;
    const timer = setInterval(async () => {
      if (!jobId.current) return;
      try {
        const res = await fetch(`/api/jobs/${jobId.current}`, { cache: "no-store" });
        if (res.ok) setJob((await res.json()) as Job);
      } catch {
        /* thử lại ở nhịp sau */
      }
    }, 800);
    return () => clearInterval(timer);
  }, [job]);

  const send = useCallback(
    async (text: string) => {
      const request = text.trim();
      if (!request || sending) return;
      setSending(true);
      setError(null);
      try {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ request }),
        });
        const data = (await res.json()) as { id?: string; error?: string };
        if (!res.ok || !data.id) throw new Error(data.error ?? "Không giao được việc");
        jobId.current = data.id;
        const first = await fetch(`/api/jobs/${data.id}`, { cache: "no-store" });
        setJob((await first.json()) as Job);
        setInput("");
        setSelected(null);
        setPanelOpen(true);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSending(false);
      }
    },
    [sending]
  );

  const states = useMemo(() => job?.agents ?? blankStates(), [job]);
  const busy = job ? job.phase !== "done" && job.phase !== "error" : false;
  const sel = selected ? states[selected] : null;
  const selMeta = selected ? AGENT_BY_ID[selected] : null;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0b1024] text-slate-100">
      <div className="absolute inset-0">
        <Office3D states={states} selected={selected} onSelect={setSelected} />
      </div>

      {/* Tiêu đề + chế độ chạy */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 space-y-2">
        <div className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 backdrop-blur">
          <div className="text-base font-extrabold tracking-wide text-amber-300">🏢 Văn phòng AI · Thor</div>
          <div className="text-[11px] text-slate-400">Mỗi AI lo đúng một nhánh việc · bấm vào AI để xem việc của nó</div>
        </div>
        {status && (
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border bg-slate-950/70 px-3 py-1 text-[11px] font-semibold ${RUNNER_LABEL[status.runner].cls}`}>
              {RUNNER_LABEL[status.runner].text}
            </span>
            <span
              className={`rounded-full border bg-slate-950/70 px-3 py-1 text-[11px] font-semibold ${
                status.thorConnected ? "border-emerald-400/60 text-emerald-300" : "border-red-400/60 text-red-300"
              }`}
            >
              {status.thorConnected ? "Đã nối dữ liệu Thor (chỉ đọc)" : "Chưa nối được dữ liệu Thor"}
            </span>
          </div>
        )}
      </div>

      {/* Bảng kết quả bên phải */}
      <div className="absolute bottom-24 right-4 top-4 z-10 flex w-[min(380px,calc(100vw-2rem))] flex-col">
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="mb-2 self-end rounded-lg border border-white/15 bg-slate-950/80 px-3 py-1 text-xs text-slate-300 backdrop-blur hover:bg-slate-900"
        >
          {panelOpen ? "Ẩn bảng ▸" : "◂ Hiện bảng"}
        </button>
        {panelOpen && (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/80 p-4 backdrop-blur">
            {selected && sel && selMeta ? (
              <div>
                <div className="mb-1 flex items-center gap-2 text-sm font-bold text-white">
                  <span className="h-3 w-3 rounded-full" style={{ background: selMeta.color }} />
                  {selMeta.name}
                </div>
                <div className="mb-3 text-xs text-slate-400">Nhánh việc: {selMeta.branch}</div>
                {sel.task && <div className="mb-2 text-xs text-slate-300">📌 {sel.task}</div>}
                {sel.status === "idle" && <div className="text-sm text-slate-400">Đang rảnh — chưa có việc.</div>}
                {(sel.status === "working" || sel.status === "thinking") && (
                  <div className="text-sm text-emerald-300">Đang làm việc…</div>
                )}
                {sel.error && <div className="text-sm text-red-300">⚠️ {sel.error}</div>}
                {sel.result && <Md text={sel.result} />}
                <button onClick={() => setSelected(null)} className="mt-4 text-xs text-sky-300 underline">
                  ← Quay lại báo cáo chung
                </button>
              </div>
            ) : job ? (
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Yêu cầu</div>
                <div className="mb-3 text-sm font-semibold text-white">{job.request}</div>
                <div className="mb-3 flex items-center gap-2 text-xs">
                  {busy && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />}
                  <span className={job.phase === "error" ? "text-red-300" : "text-emerald-300"}>{PHASE_TEXT[job.phase]}</span>
                </div>
                {job.final ? (
                  <Md text={job.final} />
                ) : (
                  <div className="space-y-1.5">
                    {job.plan.length > 0 && (
                      <div className="text-xs text-slate-400">
                        Đã giao việc cho: {job.plan.map((p) => AGENT_BY_ID[p.agent].name).join(", ")}
                      </div>
                    )}
                    {job.log.slice(-6).map((l, i) => (
                      <div key={i} className="text-[12px] text-slate-300">
                        <span className="text-slate-500">{l.agent ? `${AGENT_BY_ID[l.agent].name}: ` : ""}</span>
                        {l.msg}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm leading-relaxed text-slate-300">
                <div className="mb-2 font-bold text-white">Chào anh Thỏ 🐰</div>
                Gõ yêu cầu ở thanh dưới, ví dụ <em>“Tổng quan tình hình hôm nay”</em>. <b>Chỉ huy</b> sẽ chia việc, mỗi AI
                làm một nhánh riêng rồi <b>Báo cáo</b> gộp lại.
                <div className="mt-3 text-xs text-slate-400">
                  Kéo chuột để xoay · lăn chuột để phóng to · bấm vào từng AI để xem việc của nó.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Thanh giao việc */}
      <div className="absolute inset-x-0 bottom-4 z-10 mx-auto w-[min(720px,calc(100vw-2rem))]">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              disabled={sending || busy}
              onClick={() => send(s)}
              className="rounded-full border border-white/15 bg-slate-950/75 px-3 py-1 text-[11px] text-slate-300 backdrop-blur hover:border-amber-300/60 hover:text-amber-200 disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-center gap-2 rounded-2xl border border-white/15 bg-slate-950/85 p-2 pl-4 shadow-2xl backdrop-blur"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Hỏi tiến độ hoặc giao việc cho đội ngũ…"
            maxLength={500}
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || busy || !input.trim()}
            className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy ? "Đang làm…" : "Giao việc"}
          </button>
        </form>
        {error && <div className="mt-1 text-center text-xs text-red-300">{error}</div>}
      </div>
    </main>
  );
}
