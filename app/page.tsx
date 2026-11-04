"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AGENTS, AGENT_BY_ID, DEPTS, DEPT_BY_ID, type AgentId, type AgentState, type DeptId, type Job } from "@/lib/agentsMeta";
import { LOUNGES } from "@/lib/layout";
import { FX_INFO, openFxChannel, type FxEvent, type FxKind, type RtConfig } from "@/lib/realtimeClient";
import type { TvData } from "@/lib/tv";
import type { PersonCard } from "@/lib/lookup";
import { formatDong, staffLook, type BoardKind, type CasesToday, type DutyStaff, type SalesToday } from "@/lib/dutyTypes";

const Office3D = dynamic(() => import("@/components/Office3D"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center text-slate-500">Đang dựng văn phòng 3D…</div>
  ),
});

const MeetingPanel = dynamic(() => import("@/components/MeetingPanel"), { ssr: false });

type Me = { name: string; admin: boolean; role: string; staffIds: string[]; uid: string };

/** Hàng nút chọc / đấm / icon gửi tới một nhân vật. */
function FxBar({ target, onSend }: { target: { id: string; name: string }; onSend: (kind: FxKind, toId: string, toName: string) => void }) {
  return (
    <div className="mt-3 border-t border-white/10 pt-2">
      <div className="mb-1 text-[11px] text-slate-400">Tương tác với {target.name}</div>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(FX_INFO) as FxKind[]).map((k) => (
          <button key={k} onClick={() => onSend(k, target.id, target.name)} className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/25">
            {FX_INFO[k].emoji} {FX_INFO[k].label}
          </button>
        ))}
      </div>
    </div>
  );
}

type Status = { runner: "api" | "cli" | "sim"; thorConnected: boolean };

const RUNNER_LABEL: Record<Status["runner"], { text: string; cls: string }> = {
  api: { text: "AI thật · Claude API", cls: "border-emerald-400 text-emerald-700" },
  cli: { text: "AI thật · Claude Code", cls: "border-emerald-400 text-emerald-700" },
  sim: { text: "Chế độ tự tính (chưa nối AI)", cls: "border-amber-400 text-amber-700" },
};

const MY_SUGGESTIONS = ["Ca hôm nay của tôi", "Lương của tôi", "Tôi còn mấy ca chưa xử lý", "Đơn hôm nay của tôi", "Giờ trực của tôi"];

const SUGGESTIONS = [
  "Tổng quan toàn công ty",
  "Kế toán: kiểm tra công thức lương",
  "Nhân sự: ai chưa đăng nhập?",
  "Trung tâm kiểm soát: rà soát App",
  "Kiểm tra đơn bị thiếu hoặc lỗi",
  "Ai đang trực hôm nay?",
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
    <div className="space-y-1 text-[13px] leading-relaxed text-slate-700">
      {text.split("\n").map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (line.trim() === "---") return <hr key={i} className="my-2 border-slate-200" />;
        const heading = /^#{1,4}\s+/.test(line);
        const content = line.replace(/^#{1,4}\s+/, "");
        const parts = content.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <strong key={j} className="font-semibold text-slate-900">
              {p.slice(2, -2)}
            </strong>
          ) : (
            <span key={j}>{p}</span>
          )
        );
        return heading ? (
          <div key={i} className="pt-1.5 text-sm font-bold text-violet-700">
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
  const [legendOpen, setLegendOpen] = useState(true);
  const [tv, setTv] = useState<TvData | null>(null);
  const [tvOpen, setTvOpen] = useState<DeptId | null>(null);
  const [maint, setMaint] = useState<Partial<Record<DeptId, boolean>>>({});
  const [dutyAll, setDutyAll] = useState<DutyStaff[]>([]);
  const [boardOpen, setBoardOpen] = useState<BoardKind | null>(null);
  const [person, setPerson] = useState<{ loading: boolean; card?: PersonCard; error?: string } | null>(null);
  const [bossInfo, setBossInfo] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [rt, setRt] = useState<RtConfig | null>(null);
  const [denied, setDenied] = useState<{ id?: string; name?: string; what: string } | null>(null);
  const [fxEvents, setFxEvents] = useState<FxEvent[]>([]);
  const [meetOpen, setMeetOpen] = useState(false);
  const fxSend = useRef<((kind: FxKind, fromName: string, toId: string, toName: string) => void) | null>(null);
  const admin = !!me?.admin;
  const router = useRouter();
  const [tabId, setTabId] = useState(""); // mã riêng mỗi tab (cùng người mở 2 tab vẫn là 2 người trong cuộc gọi)

  const closeCards = useCallback(() => {
    setTvOpen(null);
    setBoardOpen(null);
    setPerson(null);
    setBossInfo(null);
    setDenied(null);
  }, []);

  // Ai đang dùng + quyền (quyền THẬT do máy chủ kiểm tra ở từng API; đây chỉ để giao diện khoá/ẩn cho khớp).
  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: Me; realtime?: RtConfig | null } | null) => {
        if (d?.user) setMe(d.user);
        if (d?.realtime) setRt(d.realtime);
      })
      .catch(() => undefined);
  }, []);

  // Kênh chọc / đấm / icon (thời gian thực).
  useEffect(() => {
    if (!rt) return;
    const ch = openFxChannel(rt, (e) => setFxEvents((prev) => [...prev.slice(-11), e]));
    fxSend.current = ch.send;
    return () => {
      fxSend.current = null;
      ch.close();
    };
  }, [rt]);

  const sendFx = useCallback(
    (kind: FxKind, toId: string, toName: string) => {
      if (!fxSend.current) {
        setError("Chưa bật được kênh tương tác (thiếu khoá thời gian thực).");
        return;
      }
      fxSend.current(kind, me?.name ?? "Ai đó", toId, toName);
    },
    [me]
  );

  // Chạm vào một nhân viên: tải thẻ thông tin gọn (giờ trực · ca hôm nay · lương · ca chưa xử lý).
  const openPerson = useCallback(
    (id: string) => {
      closeCards();
      if (!admin && !(me?.staffIds ?? []).includes(id)) {
        setDenied({ id, name: dutyAll.find((s) => s.id === id)?.name, what: "người khác" });
        return;
      }
      setPerson({ loading: true });
      fetch(`/api/person?id=${encodeURIComponent(id)}`, { cache: "no-store" })
        .then(async (r) => {
          const d = (await r.json()) as PersonCard & { error?: string };
          if (!r.ok) throw new Error(d.error ?? "Không lấy được thông tin");
          setPerson({ loading: false, card: d });
        })
        .catch((e: Error) => setPerson({ loading: false, error: e.message }));
    },
    [closeCards, admin, me, dutyAll]
  );
  const [sales, setSales] = useState<SalesToday | null>(null);
  const [cases, setCases] = useState<CasesToday | null>(null);
  // Nhân vật chỉ hiện cho người chưa hết ca; người đã hết ca chỉ có trên bảng ca.
  const duty = useMemo(() => dutyAll.filter((s) => s.state !== "done"), [dutyAll]);

  // Nhân viên Reader/Saler đang trong giờ trực (làm mới mỗi 30 giây). Thêm ?duty=demo vào địa chỉ để xem thử khi chưa có ai trực.
  useEffect(() => {
    let alive = true;
    const demo = new URLSearchParams(window.location.search).get("duty") === "demo";
    const load = () => {
      fetch(`/api/duty${demo ? "?demo=1" : ""}`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<DutyStaff[]>) : []))
        .then((d) => alive && Array.isArray(d) && setDutyAll(d))
        .catch(() => undefined);
      if (!admin) return; // Tivi/bảng chỉ dành cho admin
      fetch(`/api/cases${demo ? "?demo=1" : ""}`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<CasesToday>) : null))
        .then((d) => alive && d && setCases(d))
        .catch(() => undefined);
      fetch(`/api/sales${demo ? "?demo=1" : ""}`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<SalesToday>) : null))
        .then((d) => alive && d && setSales(d))
        .catch(() => undefined);
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [admin]);

  // Phòng đang chỉnh sửa: đọc lúc mở trang, làm mới mỗi 10 giây (Claude hoặc anh có thể bật/tắt).
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/maintenance", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Partial<Record<DeptId, boolean>>>) : null))
        .then((m) => alive && m && setMaint(m))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const toggleMaint = useCallback(async (id: DeptId, on: boolean) => {
    setMaint((m) => ({ ...m, [id]: on }));
    try {
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dept: id, on }),
      });
      if (res.ok) setMaint((await res.json()) as Partial<Record<DeptId, boolean>>);
    } catch {
      /* giữ trạng thái hiển thị tạm; nhịp làm mới sau sẽ đồng bộ lại */
    }
  }, []);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  // Số liệu cho Tivi từng phòng (CHỈ admin): tải lúc mở trang, rồi làm mới mỗi phút.
  useEffect(() => {
    if (!admin) return;
    let alive = true;
    const load = () =>
      fetch("/api/tv", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<TvData>) : null))
        .then((d) => alive && d && setTv(d))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [admin]);

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
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Không giao được việc");
        }
        // Máy chủ phát trực tiếp trạng thái công việc (mỗi dòng 1 JSON) cho tới khi xong.
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let started = false;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            setJob(JSON.parse(line) as Job);
            if (!started) {
              started = true;
              setInput("");
              setSelected(null);
              setPanelOpen(true);
            }
          }
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSending(false);
      }
    },
    [sending]
  );

  const onDeptClick = useCallback(
    (id: DeptId) => {
      void send(id === "hq" ? "Tổng quan toàn công ty" : `Báo cáo của ${DEPT_BY_ID[id].name}`);
    },
    [send]
  );

  const states = useMemo(() => job?.agents ?? blankStates(), [job]);
  const busy = job ? job.phase !== "done" && job.phase !== "error" : false;
  const sel = selected ? states[selected] : null;
  const selMeta = selected ? AGENT_BY_ID[selected] : null;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#eef3ff] text-slate-800">
      <div className="absolute inset-0">
        <Office3D
          states={states}
          selected={selected}
          onSelect={setSelected}
          tv={tv}
          onTvClick={(id) => {
            closeCards();
            if (admin) setTvOpen(id);
            else setDenied({ what: `Tivi ${DEPT_BY_ID[id].name}` });
          }}
          maint={maint}
          duty={duty}
          board={dutyAll}
          sales={sales}
          cases={cases}
          onBoardClick={(k) => {
            closeCards();
            if (admin) setBoardOpen(k);
            else setDenied({ what: "bảng số liệu phòng làm việc" });
          }}
          onStaffClick={openPerson}
          onBossClick={(activity) => {
            closeCards();
            setBossInfo(activity || "Đang nghỉ giữa các cuộc gặp");
          }}
          locked={!admin}
          fxEvents={fxEvents}
          meIds={me?.staffIds ?? []}
        />
      </div>

      {/* Tiêu đề + chế độ chạy */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 space-y-2">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/85 px-4 py-2.5 shadow-sm backdrop-blur">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-tho-dark.png" alt="Thỏ" className="h-11 w-auto" />
          <div>
          <div className="text-base font-extrabold tracking-wide text-slate-900">Văn phòng AI · Thor</div>
          <div className="text-[11px] text-slate-500">7 phòng ban · mỗi AI lo đúng một nhánh việc · bấm Tivi trong phòng để xem số liệu</div>
          </div>
        </div>
        {me && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-violet-300 bg-white/90 px-3 py-1 text-[11px] font-semibold text-violet-700 shadow-sm">
              👤 {me.name} · {me.admin ? "Admin" : me.role === "reader" ? "Reader" : me.role === "saler" ? "Saler" : me.role === "qc" ? "QC" : me.role}
            </span>
            {rt && (
              <button
                onClick={() => {
                  setTabId((v) => v || Math.random().toString(36).slice(2, 7));
                  setMeetOpen((v) => !v);
                }} className="rounded-full border border-amber-400 bg-white/90 px-3 py-1 text-[11px] font-bold text-amber-800 shadow-sm hover:bg-amber-50">
                📞 Phòng họp (gọi video)
              </button>
            )}
            {me.uid !== "local" && (
              <button
                onClick={() => void fetch("/api/logout", { method: "POST" }).then(() => router.replace("/login"))}
                className="rounded-full border border-slate-300 bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
              >
                Đăng xuất
              </button>
            )}
          </div>
        )}
        {status && (
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border bg-white/85 px-3 py-1 text-[11px] font-semibold shadow-sm ${RUNNER_LABEL[status.runner].cls}`}>
              {RUNNER_LABEL[status.runner].text}
            </span>
            <span
              className={`rounded-full border bg-white/85 px-3 py-1 text-[11px] font-semibold shadow-sm ${
                status.thorConnected ? "border-emerald-400 text-emerald-700" : "border-red-400 text-red-600"
              }`}
            >
              {status.thorConnected ? "Đã nối dữ liệu Thor (chỉ đọc)" : "Chưa nối được dữ liệu Thor"}
            </span>
          </div>
        )}
      </div>

      {/* Ghi chú bên trái: màu theo phòng ban + nhiệm vụ (không liệt kê từng AI cho đỡ rối) */}
      <div className="absolute left-4 top-[132px] z-10 w-[min(268px,calc(100vw-2rem))]">
        <button
          onClick={() => setLegendOpen((v) => !v)}
          className="mb-1 rounded-lg border border-slate-200 bg-white/85 px-3 py-1 text-xs font-semibold text-slate-600 backdrop-blur hover:bg-white"
        >
          {legendOpen ? "▾ Ghi chú màu" : "▸ Ghi chú màu"}
        </button>
        {legendOpen && (
          <div className="max-h-[calc(100dvh-20rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white/88 p-3 shadow-sm backdrop-blur">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Phòng ban · nhiệm vụ</div>
            <ul className="space-y-1.5">
              {DEPTS.map((d) => (
                <li key={d.id} className="flex items-start gap-2">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: d.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-bold leading-tight text-slate-800">{d.name}</div>
                    <div className="text-[11px] leading-snug text-slate-500">{d.scope}</div>
                  </div>
                  {admin && <button
                    onClick={() => void toggleMaint(d.id, !maint[d.id])}
                    title={maint[d.id] ? "Đang chỉnh sửa — bấm để mở lại phòng" : "Đánh dấu phòng đang cấu hình/chỉnh sửa"}
                    className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] ${
                      maint[d.id] ? "border-red-400 bg-red-50 text-red-600" : "border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500"
                    }`}
                  >
                    🛠
                  </button>}
                </li>
              ))}
            </ul>
            <div className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Khu nghỉ · họp (đứng riêng)</div>
            <ul className="space-y-1">
              {LOUNGES.map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-[11px] text-slate-600">
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: l.color }} />
                  <b className="text-slate-800">{l.name}</b> — {l.scope}
                </li>
              ))}
            </ul>
            <div className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Nhân viên trực hôm nay ({duty.filter((s) => s.state === "on").length} đang trực · {duty.filter((s) => s.state !== "on").length} chưa/nghỉ)
            </div>
            <ul className="space-y-1 text-[11px] text-slate-600">
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#34d399" }} /> Reader ({duty.filter((s) => s.role === "reader" && s.state === "on").length} đang trực) — ngồi phòng làm việc Reader (góc đông bắc)</li>
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#fb923c" }} /> Saler ({duty.filter((s) => s.role === "saler" && s.state === "on").length} đang trực) — ngồi phòng làm việc Saler (phía tây)</li>
              <li className="text-slate-500">Chưa tới giờ trực / nghỉ giữa ca: đi dạo quanh công ty hoặc nghỉ ở quán, gym, phòng nghỉ. Mỗi nhân viên một màu áo riêng (chấm màu cạnh tên); viền tên: xanh lá = Reader, cam = Saler.</li>
            </ul>
            <div className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Đèn trước cửa phòng</div>
            <ul className="space-y-1 text-[11px] text-slate-600">
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Xanh — phòng đang rảnh</li>
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Cam — đang nhận việc</li>
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> Đỏ nhấp nháy — đang chỉnh sửa (bảng Work in Process)</li>
            </ul>
            <div className="mt-3 border-t border-slate-200 pt-2 text-[11px] leading-snug text-slate-500">
              Mỗi phòng 2 AI: <b>bàn trái = Quản lý</b>, <b>bàn phải = Vận hành</b>; áo cùng màu phòng. AI rảnh tự đi cà phê, ăn, tập gym, nghỉ theo giờ.
              Bấm <b>Tivi</b> trong phòng để xem số liệu và giao báo cáo cho phòng; bấm 🛠 để đánh dấu phòng đang chỉnh sửa.
            </div>
          </div>
        )}
      </div>

      {/* Bảng tin tương tác: ai vừa chọc/đấm/gửi icon cho ai */}
      {fxEvents.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 flex -translate-x-1/2 flex-col items-center gap-1">
          {fxEvents.slice(-3).map((e) => (
            <div key={e.id} className="fx-float rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-slate-700 shadow-lg ring-1 ring-slate-200">
              {FX_INFO[e.kind].emoji} {e.fromName} {FX_INFO[e.kind].verb} {e.toName}
            </div>
          ))}
        </div>
      )}

      {/* Phòng họp: gọi audio/video */}
      {meetOpen && rt && me && tabId && <MeetingPanel cfg={rt} me={{ id: `${me.uid}-${tabId}`, name: me.name }} onClose={() => setMeetOpen(false)} />}

      {/* Tivi phóng to của một phòng */}
      {tvOpen && (
        <div className="absolute top-4 z-20 w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-[#0b1226] p-4 text-white shadow-2xl" style={{ right: panelOpen ? 372 : 16 }}>
          <div className="-mx-4 -mt-4 mb-3 flex items-center justify-between rounded-t-2xl px-4 py-2.5 text-[#0b1226]" style={{ background: DEPT_BY_ID[tvOpen].color }}>
            <div className="text-sm font-extrabold uppercase tracking-wide">📺 {DEPT_BY_ID[tvOpen].name}</div>
            <button onClick={() => setTvOpen(null)} className="rounded px-2 text-lg leading-none hover:bg-black/10" aria-label="Đóng">
              ×
            </button>
          </div>
          {tv ? (
            <ul className="divide-y divide-white/10">
              {tv[tvOpen].map((l) => (
                <li key={l.k} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="text-[13px] text-slate-300">{l.k}</span>
                  <span className={`text-lg font-bold ${l.warn ? "text-amber-300" : "text-white"}`}>{l.v}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-3 text-sm text-slate-300">Chưa có số liệu (chưa nối được dữ liệu Thor).</div>
          )}
          <div className="mt-2 text-[11px] text-slate-400">
            {tv ? `Cập nhật ${new Date(tv.updatedAt).toLocaleTimeString("vi-VN")} · tự làm mới mỗi phút` : ""}
          </div>
          <button
            onClick={() => onDeptClick(tvOpen)}
            disabled={sending || busy}
            className="mt-3 w-full rounded-xl bg-white/10 py-2 text-sm font-semibold hover:bg-white/20 disabled:opacity-40"
          >
            Giao phòng này làm báo cáo chi tiết
          </button>
        </div>
      )}

      {/* Thẻ thông tin nhân viên (chạm vào nhân vật) */}
      {person && (
        <div className="absolute top-4 z-20 w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-[#0b1226] p-4 text-white shadow-2xl" style={{ right: panelOpen ? 372 : 16 }}>
          <div
            className="-mx-4 -mt-4 mb-3 flex items-center justify-between rounded-t-2xl px-4 py-2.5 text-[#0b1226]"
            style={{ background: person.card?.role === "saler" ? "#fb923c" : person.card?.role === "qc" ? "#a3e635" : "#34d399" }}
          >
            <div className="text-sm font-extrabold uppercase tracking-wide">
              👤 {person.card ? `${person.card.name} · ${person.card.role === "reader" ? "Reader" : person.card.role === "saler" ? "Saler" : "QC"}` : "Nhân viên"}
            </div>
            <button onClick={() => setPerson(null)} className="rounded px-2 text-lg leading-none hover:bg-black/10" aria-label="Đóng">
              ×
            </button>
          </div>
          {person.loading ? (
            <div className="py-4 text-sm text-slate-300">Đang lấy thông tin…</div>
          ) : person.error ? (
            <div className="py-3 text-sm text-red-300">⚠️ {person.error}</div>
          ) : (
            <ul className="divide-y divide-white/10">
              {person.card?.rows.map((r) => (
                <li key={r.k} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="text-[12px] text-slate-300">{r.k}</span>
                  <span className={`text-right text-[14px] font-bold ${r.warn ? "text-amber-300" : "text-white"}`}>{r.v}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 text-[11px] text-slate-400">Số liệu hôm nay từ Thor · chạm nhân vật khác để xem người khác</div>
          {person.card && !(me?.staffIds ?? []).includes(person.card.id) && <FxBar target={{ id: person.card.id, name: person.card.name }} onSend={sendFx} />}
        </div>
      )}

      {/* Không đủ quyền: Tivi / bảng / thông tin người khác */}
      {denied && (
        <div className="absolute top-4 z-20 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-red-400/60 bg-[#1b0b0b] p-4 text-white shadow-2xl" style={{ right: panelOpen ? 372 : 16 }}>
          <div className="-mx-4 -mt-4 mb-3 flex items-center justify-between rounded-t-2xl bg-red-500 px-4 py-2.5 text-white">
            <div className="text-sm font-extrabold uppercase tracking-wide">🔒 Yêu Cầu Quyền Truy Cập</div>
            <button onClick={() => setDenied(null)} className="rounded px-2 text-lg leading-none hover:bg-black/20" aria-label="Đóng">
              ×
            </button>
          </div>
          <div className="text-[13px] leading-snug text-red-100">
            Anh/chị không có quyền xem <b>{denied.name ? `thông tin của ${denied.name}` : denied.what}</b>. Tài khoản này chỉ xem được thông tin chính của <b>chính mình</b>.
          </div>
          {denied.id && <FxBar target={{ id: denied.id, name: denied.name ?? "bạn này" }} onSend={sendFx} />}
        </div>
      )}

      {/* Meo — bang chủ (Admin) */}
      {bossInfo !== null && (
        <div className="absolute top-4 z-20 w-[min(340px,calc(100vw-2rem))] rounded-2xl border border-amber-400/60 bg-[#1a1405] p-4 text-white shadow-2xl" style={{ right: panelOpen ? 372 : 16 }}>
          <div className="-mx-4 -mt-4 mb-3 flex items-center justify-between rounded-t-2xl bg-amber-400 px-4 py-2.5 text-amber-950">
            <div className="text-sm font-extrabold uppercase tracking-wide">👑 Meo · Bang chủ (Admin)</div>
            <button onClick={() => setBossInfo(null)} className="rounded px-2 text-lg leading-none hover:bg-black/10" aria-label="Đóng">
              ×
            </button>
          </div>
          <div className="text-[12px] text-amber-200/80">Đang làm</div>
          <div className="text-[15px] font-bold">{bossInfo}</div>
          <div className="mt-2 text-[11px] text-amber-100/60">Meo thường xuyên gặp trao đổi 1–3 nhân viên, ngồi chỉ đạo họp và ăn uống cùng mọi người.</div>
          <FxBar target={{ id: "boss", name: "Meo" }} onSend={sendFx} />
        </div>
      )}

      {/* Bảng ca trực hôm nay của phòng làm việc Reader / Saler (phóng to) */}
      {boardOpen && (
        <div className="absolute top-4 z-20 flex max-h-[calc(100dvh-8rem)] w-[min(420px,calc(100vw-2rem))] flex-col rounded-2xl border border-slate-700 bg-[#0b1226] p-4 text-white shadow-2xl" style={{ right: panelOpen ? 372 : 16 }}>
          <div className="-mx-4 -mt-4 mb-3 flex items-center justify-between rounded-t-2xl px-4 py-2.5 text-[#0b1226]" style={{ background: boardOpen === "sales" ? "#fb923c" : "#34d399" }}>
            <div className="text-sm font-extrabold uppercase tracking-wide">
              {boardOpen === "shift" ? "📋 Ca trực hôm nay · Reader" : boardOpen === "cases" ? "🗂 Ca đang xử lý · Reader" : "💰 Bán hàng hôm nay · Saler"}
            </div>
            <button onClick={() => setBoardOpen(null)} className="rounded px-2 text-lg leading-none hover:bg-black/10" aria-label="Đóng">
              ×
            </button>
          </div>
          {boardOpen === "cases" ? (
            <>
              <div className="mb-2 grid grid-cols-3 gap-2 rounded-xl bg-white/5 p-3 text-center">
                <div>
                  <div className="text-[11px] text-slate-400">Đơn Sale giao</div>
                  <div className="text-xl font-extrabold text-yellow-300">{cases?.totalOrders ?? 0}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Ca đang đợi</div>
                  <div className="text-xl font-extrabold">{cases?.totalWaiting ?? 0}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Ca đã xong</div>
                  <div className="text-xl font-extrabold text-green-400">{cases?.totalDone ?? 0}</div>
                </div>
              </div>
              {cases?.readers.length ? (
                <ul className="min-h-0 flex-1 divide-y divide-white/10 overflow-y-auto">
                  {cases.readers.map((r) => {
                    const idx = dutyAll.find((d) => d.id === r.id)?.idx;
                    return (
                      <li key={r.id} className="py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: idx === undefined ? "#64748b" : staffLook(idx).shirt }} />
                          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{r.name}</span>
                          <span className="text-[13px] font-bold text-yellow-300">{r.ordersToday} đơn</span>
                        </div>
                        <div className="ml-5 mt-0.5 text-[12px]">
                          {r.handling ? <span className="font-bold text-green-400">▶ đang xử lý ca {r.handling}</span> : <span className="text-slate-500">chưa có ca đến giờ</span>}
                          <span className="text-slate-400"> · xong {r.done} ca</span>
                        </div>
                        <div className="ml-5 mt-0.5 text-[11px] text-slate-300">Ca đang đợi: {r.waiting.length ? r.waiting.join(" · ") : "không có"}</div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="py-3 text-sm text-slate-300">Hôm nay chưa có ca nào được Sale giao.</div>
              )}
              <div className="mt-2 text-[11px] text-slate-400">Ca = giờ hẹn Sale gắn vào đơn (Danh sách đợi của Reader) · đơn = đơn hôm nay gán cho Reader · làm mới mỗi 30 giây</div>
            </>
          ) : boardOpen === "sales" ? (
            (() => {
              const shift = new Map(dutyAll.filter((s) => s.role === "saler").map((s) => [s.id, s]));
              const rows = [
                ...dutyAll.filter((s) => s.role === "saler").map((s) => ({ id: s.id, name: s.name, d: s, s: sales?.salers.find((x) => x.id === s.id) })),
                ...(sales?.salers ?? []).filter((x) => !shift.has(x.id)).map((x) => ({ id: x.id, name: x.name, d: undefined, s: x })),
              ].sort((a, b) => (b.s?.revenue ?? 0) - (a.s?.revenue ?? 0));
              return (
                <>
                  <div className="mb-2 grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-3">
                    <div>
                      <div className="text-[11px] text-slate-400">Tổng doanh thu hôm nay</div>
                      <div className="text-xl font-extrabold text-yellow-300">{formatDong(sales?.totalRevenue ?? 0)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400">Khách · Đơn</div>
                      <div className="text-xl font-extrabold">
                        {sales?.totalCustomers ?? 0} · {sales?.totalOrders ?? 0}
                      </div>
                    </div>
                  </div>
                  {rows.length ? (
                    <ul className="min-h-0 flex-1 divide-y divide-white/10 overflow-y-auto">
                      {rows.map((r) => (
                        <li key={r.id} className="py-2">
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.d ? staffLook(r.d.idx).shirt : "#64748b" }} />
                            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{r.name}</span>
                            <span className="text-[13px] font-bold text-green-400">{formatDong(r.s?.revenue ?? 0)}</span>
                          </div>
                          <div className="ml-5 mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-slate-400">
                            <span>Ca: {r.d ? `${r.d.from ?? "?"}–${r.d.to ?? "?"}${r.d.note ? ` (${r.d.note})` : ""}` : "không có ca"}</span>
                            <span>Khách: {r.s?.customers ?? 0}</span>
                            <span>Đơn: {r.s?.orders ?? 0}</span>
                          </div>
                          <div className="ml-5 mt-0.5 text-[11px] text-slate-300">
                            Gói: {r.s?.packages.length ? r.s.packages.map((p) => `${p.name} ×${p.count}`).join(" · ") : "chưa bán"}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="py-3 text-sm text-slate-300">Hôm nay chưa có Saler nào có ca hoặc có đơn.</div>
                  )}
                  <div className="mt-2 text-[11px] text-slate-400">Theo đơn hôm nay trong Thor · làm mới mỗi 30 giây · doanh thu = tổng tiền các đơn đã nhập</div>
                </>
              );
            })()
          ) : (() => {
            const list = dutyAll.filter((s) => s.role === "reader");
            const mark = { on: ["đang trực", "text-green-400"], break: ["nghỉ giữa ca", "text-amber-300"], soon: ["sắp trực", "text-sky-300"], done: ["hết ca", "text-slate-400"] } as const;
            return list.length ? (
              <ul className="min-h-0 flex-1 divide-y divide-white/10 overflow-y-auto">
                {list.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-1.5">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: staffLook(s.idx).shirt }} />
                    <span className={`min-w-0 flex-1 truncate text-[14px] font-semibold ${s.state === "done" ? "text-slate-400" : ""}`}>{s.name}</span>
                    <span className="text-right">
                      <span className="block text-[14px] font-bold">
                        {s.from ?? "?"}–{s.to ?? "?"}
                      </span>
                      <span className={`block text-[11px] ${mark[s.state][1]}`}>
                        {mark[s.state][0]}
                        {s.note ? ` · ${s.note}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-3 text-sm text-slate-300">Hôm nay chưa có ai đăng ký ca.</div>
            );
          })()}
          {boardOpen === "shift" && <div className="mt-2 text-[11px] text-slate-400">Theo bảng giờ trực của Thor · làm mới mỗi 30 giây · xếp theo giờ vào ca</div>}
        </div>
      )}

      {/* Bảng kết quả bên phải */}
      <div className="pointer-events-none absolute bottom-24 right-4 top-4 z-10 flex w-[min(340px,calc(100vw-2rem))] flex-col">
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="pointer-events-auto mb-2 self-end rounded-lg border border-slate-200 bg-white/85 px-3 py-1 text-xs text-slate-600 backdrop-blur hover:bg-white"
        >
          {panelOpen ? "Ẩn bảng ▸" : "◂ Hiện bảng"}
        </button>
        {panelOpen && (
          <div className="pointer-events-auto min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white/88 p-4 shadow-sm backdrop-blur">
            {selected && sel && selMeta ? (
              <div>
                <div className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-900">
                  <span className="h-3 w-3 rounded-full" style={{ background: selMeta.color }} />
                  {selMeta.name}
                </div>
                <div className="text-xs font-semibold" style={{ color: selMeta.color }}>
                  {DEPT_BY_ID[selMeta.dept].name}
                </div>
                <div className="mb-3 text-xs text-slate-500">Nhánh việc: {selMeta.branch}</div>
                {sel.task && <div className="mb-2 text-xs text-slate-600">📌 {sel.task}</div>}
                {sel.status === "idle" && <div className="text-sm text-slate-500">Đang rảnh — chưa có việc.</div>}
                {(sel.status === "working" || sel.status === "thinking") && (
                  <div className="text-sm text-emerald-700">Đang làm việc…</div>
                )}
                {sel.error && <div className="text-sm text-red-600">⚠️ {sel.error}</div>}
                {sel.result && <Md text={sel.result} />}
                <button onClick={() => setSelected(null)} className="mt-4 text-xs text-sky-700 underline">
                  ← Quay lại báo cáo chung
                </button>
              </div>
            ) : job ? (
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Yêu cầu</div>
                <div className="mb-3 text-sm font-semibold text-slate-900">{job.request}</div>
                <div className="mb-3 flex items-center gap-2 text-xs">
                  {busy && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />}
                  <span className={job.phase === "error" ? "text-red-600" : "text-emerald-700"}>{PHASE_TEXT[job.phase]}</span>
                </div>
                {job.final ? (
                  <Md text={job.final} />
                ) : (
                  <div className="space-y-1.5">
                    {job.plan.length > 0 && (
                      <div className="text-xs text-slate-500">
                        Đã giao việc cho: {job.plan.map((p) => AGENT_BY_ID[p.agent].name).join(", ")}
                      </div>
                    )}
                    {job.log.slice(-6).map((l, i) => (
                      <div key={i} className="text-[12px] text-slate-600">
                        <span className="text-slate-500">{l.agent ? `${AGENT_BY_ID[l.agent].name}: ` : ""}</span>
                        {l.msg}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm leading-relaxed text-slate-600">
                <div className="mb-2 font-bold text-slate-900">Chào anh Thỏ 🐰</div>
                Gõ yêu cầu ở thanh dưới, ví dụ <em>“Tổng quan toàn công ty”</em> hoặc <em>“Kế toán: kiểm tra công thức lương”</em>.
                <b>Chỉ huy</b> sẽ chia việc cho các phòng, mỗi AI làm một nhánh riêng rồi <b>Báo cáo</b> gộp lại.
                <div className="mt-3 text-xs text-slate-500">
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
          {(admin ? SUGGESTIONS : MY_SUGGESTIONS).map((s) => (
            <button
              key={s}
              disabled={sending || busy}
              onClick={() => send(s)}
              className="rounded-full border border-slate-200 bg-white/85 px-3 py-1 text-[11px] text-slate-600 shadow-sm backdrop-blur hover:border-violet-400 hover:text-violet-700 disabled:opacity-40"
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
          className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/92 p-2 pl-4 shadow-xl backdrop-blur"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Gõ tên một người (vd: Moon lương hôm nay) hoặc một phòng/việc…"
            maxLength={500}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || busy || !input.trim()}
            className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy ? "Đang làm…" : "Giao việc"}
          </button>
        </form>
        {error && <div className="mt-1 text-center text-xs text-red-600">{error}</div>}
      </div>
    </main>
  );
}
