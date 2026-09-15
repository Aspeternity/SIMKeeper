"use client";

import { useEffect, useRef, useState, type MouseEvent, type WheelEvent } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";

type InteractiveSession = {
  id: string;
  providerId: string;
  connectorId: number;
  state: "waiting" | "success" | "error" | "closed";
  message: string;
  createdAt: string;
  expiresAt: string;
};

type Props = {
  simId: number;
  disabled?: boolean;
  onBeforeStart?: () => Promise<void>;
  onAuthenticated?: () => Promise<void>;
};

export function SmartInteractiveAuth({
  simId,
  disabled = false,
  onBeforeStart,
  onAuthenticated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [session, setSession] = useState<InteractiveSession | null>(null);
  const [error, setError] = useState("");
  const [frameVersion, setFrameVersion] = useState(0);
  const [syncingAfterAuth, setSyncingAfterAuth] = useState(false);
  const completedRef = useRef("");

  async function api(body: Record<string, unknown>) {
    const response = await fetch("/api/sims/balance-source/smart-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Smart 人工认证操作失败");
    return data;
  }

  async function start() {
    if (starting || disabled) return;
    setStarting(true);
    setError("");
    completedRef.current = "";
    try {
      await onBeforeStart?.();
      const data = await api({ action: "start", simId });
      setSession(data.session as InteractiveSession);
      setOpen(true);
      setFrameVersion((value) => value + 1);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "无法启动 Smart 人工认证窗口");
    } finally {
      setStarting(false);
    }
  }

  async function close() {
    const current = session;
    setOpen(false);
    setSession(null);
    setError("");
    if (current?.state === "waiting") {
      await api({ action: "close", simId, sessionId: current.id }).catch(() => undefined);
    }
  }

  async function sendInput(payload: Record<string, unknown>) {
    if (!session || session.state !== "waiting") return;
    try {
      const data = await api({
        action: "input",
        simId,
        sessionId: session.id,
        ...payload,
      });
      if (data.session) setSession(data.session as InteractiveSession);
      setFrameVersion((value) => value + 1);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "浏览器交互失败");
    }
  }

  function onFrameClick(event: MouseEvent<HTMLImageElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    void sendInput({ kind: "click", x, y });
  }

  function onFrameWheel(event: WheelEvent<HTMLImageElement>) {
    event.preventDefault();
    void sendInput({ kind: "scroll", deltaY: Math.max(-1200, Math.min(1200, event.deltaY * 2)) });
  }

  useEffect(() => {
    if (!open || !session || session.state !== "waiting") return;
    const timer = window.setInterval(() => {
      void fetch(
        `/api/sims/balance-source/smart-auth?simId=${simId}&sessionId=${encodeURIComponent(session.id)}`,
        { cache: "no-store" },
      )
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "人工认证状态读取失败");
          setSession(data.session as InteractiveSession);
        })
        .catch((nextError) => {
          setError(nextError instanceof Error ? nextError.message : "人工认证状态读取失败");
        });
    }, 800);
    return () => window.clearInterval(timer);
  }, [open, session?.id, session?.state, simId]);

  useEffect(() => {
    if (!open || !session || session.state !== "waiting") return;
    const timer = window.setInterval(() => setFrameVersion((value) => value + 1), 850);
    return () => window.clearInterval(timer);
  }, [open, session?.id, session?.state]);

  useEffect(() => {
    if (!session || session.state !== "success" || completedRef.current === session.id) return;
    completedRef.current = session.id;
    setSyncingAfterAuth(true);
    setError("");
    void Promise.resolve(onAuthenticated?.())
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "认证成功，但余额同步失败");
      })
      .finally(() => setSyncingAfterAuth(false));
  }, [session, onAuthenticated]);

  return (
    <>
      <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-xs leading-5 text-sky-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-medium">Smart 人工认证</div>
            <div className="mt-0.5 text-sky-700">
              如果 My Smart 要求人机验证，可直接打开服务器 Chromium 的真实官网画面。账号和密码会自动填写，你只需亲自完成 reCAPTCHA 并点击官方 Login，不需要再复制 cURL。
            </div>
          </div>
          <button
            type="button"
            onClick={() => void start()}
            disabled={disabled || starting}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 text-xs font-medium text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
            {starting ? "正在打开…" : "进行人工认证"}
          </button>
        </div>
        {error && !open ? <div className="mt-2 text-rose-600">{error}</div> : null}
      </div>

      {open && session ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-2 sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">My Smart 人工认证</div>
                <div className="mt-0.5 text-xs leading-5 text-slate-500">
                  这是 SIMKeeper 服务器 Chromium 的实时画面。请直接点击下方网页完成 Smart 官方 reCAPTCHA / Login。
                </div>
              </div>
              <button
                type="button"
                onClick={() => void close()}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="关闭人工认证"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
              {session.state === "waiting" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
              ) : session.state === "success" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : null}
              <span className={session.state === "success" ? "font-medium text-emerald-700" : ""}>
                {session.message}
              </span>
              {syncingAfterAuth ? <span className="text-sky-700">正在立即同步余额…</span> : null}
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void sendInput({ kind: "reload" })}
                  disabled={session.state !== "waiting"}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] hover:bg-slate-100 disabled:opacity-40"
                >
                  <RefreshCw className="h-3 w-3" />刷新网页
                </button>
                <button
                  type="button"
                  onClick={() => void sendInput({ kind: "press", key: "Tab" })}
                  disabled={session.state !== "waiting"}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] hover:bg-slate-100 disabled:opacity-40"
                >
                  Tab
                </button>
                <button
                  type="button"
                  onClick={() => void sendInput({ kind: "press", key: "Enter" })}
                  disabled={session.state !== "waiting"}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] hover:bg-slate-100 disabled:opacity-40"
                >
                  Enter
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-slate-200 p-2">
              {session.state === "waiting" ? (
                <img
                  key={frameVersion}
                  src={`/api/sims/balance-source/smart-auth/frame?simId=${simId}&sessionId=${encodeURIComponent(session.id)}&v=${frameVersion}`}
                  alt="My Smart 服务器 Chromium 实时画面"
                  draggable={false}
                  onClick={onFrameClick}
                  onWheel={onFrameWheel}
                  className="mx-auto block h-auto max-h-[78vh] w-auto max-w-full cursor-crosshair select-none rounded-md bg-white shadow"
                />
              ) : (
                <div className="flex min-h-[420px] items-center justify-center rounded-lg bg-white p-8 text-center">
                  <div>
                    {session.state === "success" ? (
                      <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
                    ) : (
                      <ShieldCheck className="mx-auto h-10 w-10 text-slate-400" />
                    )}
                    <div className="mt-3 text-sm font-medium text-slate-800">{session.message}</div>
                    {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
                    <button
                      type="button"
                      onClick={() => void close()}
                      className="mt-4 h-9 rounded-lg bg-slate-950 px-4 text-xs font-medium text-white hover:bg-slate-800"
                    >
                      完成
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 border-t border-slate-200 bg-white px-4 py-3 text-[11px] leading-5 text-slate-500">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>画面和点击只在当前已登录的 SIMKeeper 会话中传输；验证码由你本人在 Smart 官方页面完成，SIMKeeper 不识别、不破解也不绕过 reCAPTCHA。成功后仅保留持久化 Chromium Profile。</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
