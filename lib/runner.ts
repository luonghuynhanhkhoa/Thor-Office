import { spawn, spawnSync } from "node:child_process";

/**
 * Cách chạy AI. Tự chọn theo thứ tự (hoặc ép bằng biến AI_RUNNER=api|cli|sim):
 *  1. api — có ANTHROPIC_API_KEY (đặt trong .env.local của app này): gọi Claude API trực tiếp.
 *  2. cli — máy có lệnh `claude` (Claude Code) đã đăng nhập: chạy `claude -p` (không cần khoá API).
 *  3. sim — chưa nối AI nào: mỗi AI tự TÍNH từ số liệu Thor thật (không dùng AI, không tốn phí).
 */
export type RunnerMode = "api" | "cli" | "sim";

let cliCache: boolean | undefined;
function hasClaudeCli(): boolean {
  if (cliCache === undefined) {
    const r = spawnSync(process.platform === "win32" ? "where" : "which", ["claude"], {
      stdio: "ignore",
    });
    cliCache = r.status === 0;
  }
  return cliCache;
}

export function runnerMode(): RunnerMode {
  const force = process.env.AI_RUNNER;
  if (force === "api" || force === "cli" || force === "sim") return force;
  if (process.env.ANTHROPIC_API_KEY) return "api";
  if (hasClaudeCli()) return "cli";
  return "sim";
}

async function viaApi(system: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API lỗi ${res.status}`);
  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (json.content ?? []).map((c) => c.text ?? "").join("").trim();
}

function viaCli(system: string, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Lời nhắc hệ thống + yêu cầu gộp vào stdin (tránh lỗi trích dẫn tham số trên Windows).
    const child = spawn("claude", ["-p", "--output-format", "text", "--max-turns", "2"], {
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Claude (dòng lệnh) quá thời gian 120 giây"));
    }, 120_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error(`Claude (dòng lệnh) lỗi ${code}: ${err.slice(0, 200)}`));
    });
    child.stdin.write(`${system}\n\n---\n${prompt}`);
    child.stdin.end();
  });
}

/** Hỏi AI thật (api hoặc cli). Chế độ sim không gọi hàm này. */
export async function askModel(system: string, prompt: string): Promise<string> {
  const mode = runnerMode();
  if (mode === "api") return viaApi(system, prompt);
  if (mode === "cli") return viaCli(system, prompt);
  throw new Error("Chưa nối AI thật");
}
