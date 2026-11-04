import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { thorRoot } from "@/lib/thorData";

/**
 * Đọc MÃ NGUỒN Thor và chạy vài lệnh KIỂM TRA CHỈ-ĐỌC (tsc, eslint, git status) cho Trung
 * Tâm Kiểm Soát / Điều Hành. Không có hàm nào ghi, xoá hay sửa file.
 */

/** Có thư mục mã nguồn Thor trên máy này không (bản chạy trên mạng thì không có → các việc đọc mã/git sẽ báo "chỉ chạy trên máy anh"). */
export function localAvailable(): boolean {
  try {
    return fs.existsSync(path.join(thorRoot(), "package.json"));
  } catch {
    return false;
  }
}

/** Giải đường dẫn tương đối trong Thor, chặn thoát ra ngoài thư mục Thor. */
function inThor(rel: string): string {
  const root = thorRoot();
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("Đường dẫn ngoài Thor");
  return full;
}

export function readThorFile(rel: string): string | null {
  try {
    return fs.readFileSync(inThor(rel), "utf8");
  } catch {
    return null;
  }
}

export function listThorDir(rel: string): { name: string; isDir: boolean }[] {
  try {
    return fs
      .readdirSync(inThor(rel), { withFileTypes: true })
      .map((d) => ({ name: d.name, isDir: d.isDirectory() }));
  } catch {
    return [];
  }
}

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".vercel", "dist", "coverage"]);

/** Duyệt toàn bộ file của 1 thư mục (bỏ node_modules, .next, .git…). */
export function walk(
  dir: string,
  visit: (rel: string, abs: string, size: number, mtimeMs: number) => void,
  rootOverride?: string
): void {
  const root = rootOverride ?? thorRoot();
  const rec = (abs: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(abs, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) rec(p);
      } else {
        try {
          const st = fs.statSync(p);
          visit(path.relative(root, p).replace(/\\/g, "/"), p, st.size, st.mtimeMs);
        } catch {
          /* bỏ qua file đọc không được */
        }
      }
    }
  };
  rec(path.resolve(root, dir));
}

/** Chạy 1 lệnh cho phép, không qua shell, có giới hạn thời gian. */
function run(file: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { cwd, timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code) : 1) : 0;
      resolve({ code, out: `${stdout ?? ""}${stderr ?? ""}` });
    });
  });
}

export type RepoRef = { name: string; dir: string };

/** Các kho mã trong thư mục M mà Trung tâm kiểm soát theo dõi. */
export function repos(): RepoRef[] {
  const parent = path.resolve(thorRoot(), "..");
  return ["Thor", "songsat", "ai-office", "kinhdich", "ai-sale-thor"]
    .map((n) => ({ name: n, dir: path.join(parent, n) }))
    .filter((r) => fs.existsSync(path.join(r.dir, ".git")));
}

export async function gitStatus(dir: string): Promise<{ branch: string; dirty: string[]; ahead: number; behind: number }> {
  const { out } = await run("git", ["status", "-sb", "--porcelain"], dir, 20000);
  const lines = out.split(/\r?\n/).filter(Boolean);
  const head = lines[0] ?? "";
  const ahead = Number(head.match(/ahead (\d+)/)?.[1] ?? 0);
  const behind = Number(head.match(/behind (\d+)/)?.[1] ?? 0);
  return {
    branch: head.replace(/^##\s*/, "").split("...")[0],
    dirty: lines.slice(1).map((l) => l.trim()),
    ahead,
    behind,
  };
}

/** Kết quả kiểm tra tsc/eslint được nhớ 10 phút (chạy khá nặng). */
const g = globalThis as unknown as { __aiOfficeChecks?: Map<string, { at: number; value: unknown }> };
const checks = (g.__aiOfficeChecks ??= new Map());
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = checks.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value as T;
  const value = await load();
  checks.set(key, { at: Date.now(), value });
  return value;
}

export function runTsc(): Promise<{ ok: boolean; errors: number; sample: string[] }> {
  return cached("tsc", async () => {
    const root = thorRoot();
    const bin = path.join(root, "node_modules", "typescript", "bin", "tsc");
    if (!fs.existsSync(bin)) return { ok: false, errors: -1, sample: ["Không tìm thấy TypeScript trong Thor"] };
    const { out } = await run(process.execPath, [bin, "--noEmit", "--pretty", "false"], root, 180_000);
    const errs = out.split(/\r?\n/).filter((l) => /error TS\d+/.test(l));
    return { ok: errs.length === 0, errors: errs.length, sample: errs.slice(0, 5) };
  });
}

export function runEslint(): Promise<{ errors: number; warnings: number; files: number; topRules: [string, number][]; sample: string[] }> {
  return cached("eslint", async () => {
    const root = thorRoot();
    const bin = path.join(root, "node_modules", "eslint", "bin", "eslint.js");
    if (!fs.existsSync(bin)) return { errors: -1, warnings: 0, files: 0, topRules: [], sample: ["Không tìm thấy ESLint trong Thor"] };
    const { out } = await run(process.execPath, [bin, ".", "-f", "json"], root, 240_000);
    try {
      const start = out.indexOf("[");
      const data = JSON.parse(out.slice(start)) as {
        filePath: string;
        errorCount: number;
        warningCount: number;
        messages: { ruleId: string | null; message: string; line: number }[];
      }[];
      const rules = new Map<string, number>();
      const sample: string[] = [];
      let errors = 0;
      let warnings = 0;
      for (const f of data) {
        errors += f.errorCount;
        warnings += f.warningCount;
        for (const m of f.messages) {
          const r = m.ruleId ?? "(không rõ)";
          rules.set(r, (rules.get(r) ?? 0) + 1);
          if (sample.length < 4) sample.push(`${path.relative(root, f.filePath).replace(/\\/g, "/")}:${m.line} ${m.message.slice(0, 80)}`);
        }
      }
      return { errors, warnings, files: data.length, topRules: [...rules.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), sample };
    } catch {
      return { errors: -1, warnings: 0, files: 0, topRules: [], sample: ["Không đọc được kết quả ESLint"] };
    }
  });
}
