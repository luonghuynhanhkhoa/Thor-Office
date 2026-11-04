"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const [mode, setMode] = useState<"open" | "locked" | "password" | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/login")
      .then((r) => r.json())
      .then((d: { mode: "open" | "locked" | "password" }) => setMode(d.mode))
      .catch(() => setMode("password"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Không đăng nhập được");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#eef3ff] p-4 text-slate-800">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-tho-dark.png" alt="Thỏ" className="mx-auto mb-3 h-20 w-auto" />
        <h1 className="mb-1 text-center text-lg font-extrabold text-slate-900">Văn phòng AI · Thor</h1>
        {mode === "locked" ? (
          <p className="text-center text-sm text-red-600">
            Bản trên mạng đang <b>khoá</b>: chưa đặt mật khẩu (biến môi trường <code>OFFICE_PASSWORD</code> trên Vercel).
          </p>
        ) : mode === "open" ? (
          <Link href="/" className="mt-3 block rounded-xl bg-violet-500 py-2 text-center text-sm font-bold text-white">
            Vào văn phòng
          </Link>
        ) : (
          <form onSubmit={submit} className="mt-3 space-y-3">
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mật khẩu"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
            />
            {error && <div className="text-center text-xs text-red-600">{error}</div>}
            <button
              type="submit"
              disabled={busy || !password}
              className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy ? "Đang kiểm tra…" : "Vào văn phòng"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
