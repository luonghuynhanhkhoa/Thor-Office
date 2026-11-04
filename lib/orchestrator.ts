import { AGENTS, AGENT_BY_ID, DEPT_BY_ID, type AgentId, type AgentState, type Job } from "@/lib/agentsMeta";
import { LOGIC, WORKERS, planByKeywords } from "@/lib/agentLogic";
import { askModel, runnerMode } from "@/lib/runner";
import { Ctx } from "@/lib/thorData";
import { localAvailable } from "@/lib/thorFiles";
import { detectTopics, resolvePeople } from "@/lib/lookup";
import { lookupText } from "@/lib/lookup";

/** AI phụ trách truy xuất từng vai trò (AI "Quản lý" của phòng tương ứng). */
const LEAD: Record<"reader" | "saler" | "qc", AgentId> = { reader: "reader_manage", saler: "sale_manage", qc: "qc_manage" };

/**
 * Bộ điều phối: Chỉ huy chia việc → các AI chuyên môn làm SONG SONG (mỗi AI một nhánh)
 * → AI Báo cáo gộp kết quả. Trạng thái công việc lưu trong bộ nhớ máy chủ cục bộ.
 */
const store = globalThis as unknown as { __aiOfficeJobs?: Map<string, Job> };
const jobs = (store.__aiOfficeJobs ??= new Map<string, Job>());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (a: number, b: number) => a + Math.random() * (b - a);

export function getJob(id: string): Job | undefined {
  if (id === "latest") return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt)[0];
  return jobs.get(id);
}

export function listJobs(): Pick<Job, "id" | "request" | "createdAt" | "phase">[] {
  return [...jobs.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10)
    .map(({ id, request, createdAt, phase }) => ({ id, request, createdAt, phase }));
}

function blankAgents(): Record<AgentId, AgentState> {
  return Object.fromEntries(AGENTS.map((a) => [a.id, { status: "idle" } as AgentState])) as Record<
    AgentId,
    AgentState
  >;
}

export function startJob(request: string): Job {
  const id = Math.random().toString(36).slice(2, 10);
  const job: Job = {
    id,
    request,
    createdAt: Date.now(),
    phase: "planning",
    runner: runnerMode(),
    agents: blankAgents(),
    plan: [],
    log: [],
  };
  jobs.set(id, job);
  // Giữ tối đa 20 công việc gần nhất.
  if (jobs.size > 20) {
    const oldest = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    jobs.delete(oldest.id);
  }
  void run(job).catch((e) => {
    job.phase = "error";
    log(job, undefined, `Lỗi: ${(e as Error).message}`);
  });
  return job;
}

function log(job: Job, agent: AgentId | undefined, msg: string) {
  job.log.push({ t: Date.now(), agent, msg });
}

function set(job: Job, id: AgentId, patch: Partial<AgentState>) {
  job.agents[id] = { ...job.agents[id], ...patch };
}

async function plan(job: Job): Promise<{ agent: AgentId; task: string }[]> {
  const workers = WORKERS;
  if (job.runner !== "sim") {
    try {
      const catalog = workers
        .map((id) => `- ${id}: ${DEPT_BY_ID[AGENT_BY_ID[id].dept].name} · ${AGENT_BY_ID[id].name} — ${AGENT_BY_ID[id].branch}`)
        .join("\n");
      const text = await askModel(
        LOGIC.commander.system,
        `Danh sách AI chuyên môn:\n${catalog}\n\nYêu cầu của anh Thỏ: "${job.request}"\n\n` +
          `Chọn các AI cần thiết (mỗi AI một việc ngắn). Chỉ trả về JSON đúng dạng: ` +
          `{"assignments":[{"agent":"<id>","task":"<việc cụ thể>"}]}`
      );
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]) as { assignments?: { agent: string; task: string }[] };
        const out = (parsed.assignments ?? [])
          .filter((a) => workers.includes(a.agent as AgentId))
          .map((a) => ({ agent: a.agent as AgentId, task: String(a.task).slice(0, 160) }));
        if (out.length) return out;
      }
      log(job, "commander", "Chỉ huy trả lời không đúng khuôn, chuyển sang chia việc theo từ khoá.");
    } catch (e) {
      log(job, "commander", `Không gọi được AI để chia việc (${(e as Error).message}); chia theo từ khoá.`);
    }
  }
  return planByKeywords(job.request).map((agent) => ({
    agent,
    task: `${AGENT_BY_ID[agent].branch} — theo yêu cầu: ${job.request}`.slice(0, 160),
  }));
}

async function runWorker(job: Job, ctx: Ctx, agent: AgentId, task: string): Promise<void> {
  const logic = LOGIC[agent];
  set(job, agent, { status: "working", task, startedAt: Date.now(), result: undefined, error: undefined });
  log(job, agent, `Nhận việc: ${task}`);
  try {
    if (logic.localOnly && !localAvailable()) {
      await sleep(jitter(600, 1200));
      set(job, agent, {
        status: "done",
        result: "🖥️ Việc này cần đọc mã nguồn / git của Thor ngay trên máy anh nên bản chạy trên mạng chưa làm được. Mở bản trên máy (http://localhost:3300) để chạy.",
        finishedAt: Date.now(),
      });
      log(job, agent, "Bỏ qua: chỉ chạy được trên máy anh.");
      return;
    }
    const data = await logic.gather!(ctx);
    let text: string;
    if (job.runner === "sim") {
      await sleep(jitter(1800, 3600));
      text = logic.sim!(data as never, task);
    } else {
      try {
        text = await askModel(
          logic.system,
          `Việc được giao: ${task}\n\nDỮ LIỆU (JSON, đã tổng hợp từ Thor):\n${JSON.stringify(data)}`
        );
      } catch (e) {
        log(job, agent, `Không gọi được AI thật (${(e as Error).message}) — dùng tính toán tự động.`);
        text = logic.sim!(data as never, task);
      }
    }
    set(job, agent, { status: "done", result: text, finishedAt: Date.now() });
    log(job, agent, "Xong việc.");
  } catch (e) {
    set(job, agent, { status: "error", error: (e as Error).message, finishedAt: Date.now() });
    log(job, agent, `Lỗi: ${(e as Error).message}`);
  }
}

async function run(job: Job): Promise<void> {
  const ctx = new Ctx();

  // 1) Chỉ huy chia việc
  set(job, "commander", { status: "thinking", task: "Đang phân việc…", startedAt: Date.now() });
  log(job, "commander", `Nhận yêu cầu: "${job.request}"`);
  if (job.runner === "sim") await sleep(jitter(1200, 2000));

  // 0) Yêu cầu nhắc TÊN một người (Reader/Saler/QC) → chỉ truy xuất ĐÚNG người đó, đúng chủ đề được hỏi — không báo cáo tổng thể.
  const people = await resolvePeople(ctx, job.request);
  if (people.length) {
    const topics = detectTopics(job.request);
    job.plan = people.map((p) => ({ agent: LEAD[p.role], task: `Truy xuất ${p.name}${topics.length ? ` — ${topics.join(", ")}` : ""}` }));
    set(job, "commander", { status: "done", task: `Đã giao truy xuất ${people.map((p) => p.name).join(", ")}`, finishedAt: Date.now() });
    log(job, "commander", `Chỉ truy xuất: ${people.map((p) => p.name).join(", ")}${topics.length ? ` (${topics.join(", ")})` : ""}`);
    job.phase = "working";
    const texts = await Promise.all(
      people.map(async (p, i) => {
        const agent = job.plan[i].agent;
        set(job, agent, { status: "working", task: job.plan[i].task, startedAt: Date.now(), result: undefined, error: undefined });
        log(job, agent, `Nhận việc: ${job.plan[i].task}`);
        try {
          await sleep(jitter(900, 1800));
          const text = await lookupText(ctx, p, topics);
          set(job, agent, { status: "done", result: text, finishedAt: Date.now() });
          log(job, agent, "Xong việc.");
          return text;
        } catch (e) {
          set(job, agent, { status: "error", error: (e as Error).message, finishedAt: Date.now() });
          return `## ${p.name}\n⚠️ Không lấy được: ${(e as Error).message}`;
        }
      })
    );
    job.phase = "composing";
    set(job, "reporter", { status: "working", task: "Đang gửi kết quả…", startedAt: Date.now() });
    await sleep(jitter(500, 900));
    // trùng tên khác vai trò (vd Saler Hiếu và QC Hiếu): chỉ giữ người có thông tin đúng chủ đề được hỏi
    const useful = texts.filter((t) => t.trim());
    job.final = useful.length
      ? useful.join("\n\n---\n\n")
      : `## ${people.map((p) => p.name).join(", ")}\n- Chưa có thông tin cho mục được hỏi${topics.length ? ` (${topics.join(", ")})` : ""}.`;
    set(job, "reporter", { status: "done", task: "Đã gửi kết quả", finishedAt: Date.now() });
    job.phase = "done";
    log(job, "reporter", "Hoàn tất.");
    return;
  }

  job.plan = await plan(job);
  if (job.plan.length === 0) {
    set(job, "commander", { status: "done", task: "Chưa rõ yêu cầu", finishedAt: Date.now() });
    log(job, "commander", "Yêu cầu chưa chỉ rõ phòng/việc/người — hỏi lại, không đưa báo cáo tổng thể.");
    job.final =
      "## Em chưa rõ anh muốn xem gì\n" +
      "Anh nói rõ hơn giúp em, ví dụ:\n" +
      "- Một người: **“Moon”**, **“Reader Moon lương tháng này”**, **“Hiếu bán được gì hôm nay”**, **“Phi ca hôm nay”**\n" +
      "- Một phòng: **“Báo cáo của Phòng Kế Toán”**, **“Phòng QC khiếu nại”**\n" +
      "- Một việc: **“Ai đang trực hôm nay?”**, **“Kiểm tra đơn bị thiếu”**\n" +
      "- Toàn công ty: **“Tổng quan toàn công ty”**";
    job.phase = "done";
    return;
  }
  set(job, "commander", {
    status: "done",
    task: `Đã giao ${job.plan.length} việc cho ${job.plan.length} AI`,
    finishedAt: Date.now(),
  });
  log(job, "commander", `Giao việc: ${job.plan.map((p) => AGENT_BY_ID[p.agent].name).join(", ")}`);

  // 2) Các AI chuyên môn làm song song (mỗi AI một nhánh)
  job.phase = "working";
  await Promise.all(job.plan.map((p) => runWorker(job, ctx, p.agent, p.task)));

  // 3) Báo cáo gộp
  job.phase = "composing";
  set(job, "reporter", { status: "working", task: "Đang gộp báo cáo…", startedAt: Date.now() });
  const parts = job.plan
    .map((p) => ({ p, s: job.agents[p.agent] }))
    .filter(({ s }) => s.status === "done" || s.status === "error");
  const body = parts
    .map(({ p, s }) => {
      const m = AGENT_BY_ID[p.agent];
      return `### ${DEPT_BY_ID[m.dept].name} · ${m.name}\n${s.status === "done" ? s.result : `⚠️ Không lấy được: ${s.error}`}`;
    })
    .join("\n\n");

  let final: string;
  if (job.runner === "sim") {
    await sleep(jitter(1200, 2000));
    const warn = parts
      .flatMap(({ s }) => (s.result ?? "").split("\n"))
      .filter((l) => l.trim().startsWith("- ⚠️"));
    final =
      `## Báo cáo — ${job.request}\n\n` +
      (warn.length ? `**Cần xử lý (${warn.length}):**\n${warn.join("\n")}\n\n---\n\n` : "") +
      body;
  } else {
    try {
      final = await askModel(
        LOGIC.reporter.system,
        `Yêu cầu gốc: "${job.request}"\n\nKết quả của các AI:\n${body}`
      );
    } catch (e) {
      log(job, "reporter", `Không gọi được AI thật (${(e as Error).message}) — gộp tự động.`);
      final = `## Báo cáo — ${job.request}\n\n${body}`;
    }
  }
  job.final = final;
  set(job, "reporter", { status: "done", task: "Đã gửi báo cáo", finishedAt: Date.now() });
  job.phase = "done";
  log(job, "reporter", "Báo cáo hoàn tất.");
}
