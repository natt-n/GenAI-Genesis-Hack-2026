"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/session";

type DockerStatus =
  | "idle"
  | "building"
  | "running"
  | "error"
  | "stopped";

type LogLine = {
  ts: number;
  text: string;
  level: "info" | "error" | "success";
};

export default function SandboxPage() {
  const router = useRouter();
  const {
    sessionId,
    dockerfile,
    composeFile,
    buildPlan,
    mockManifest,
    result,
    dockerStatus,
    setDockerStatus,
  } = useSessionStore();

  const [status, setStatus] = useState<DockerStatus>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [activeTab, setActiveTab] = useState<
    "logs" | "dockerfile" | "compose" | "manifest"
  >("logs");
  const [error, setError] = useState<string | null>(null);
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!sessionId || !dockerfile) {
      router.push("/");
    }
  }, [sessionId, dockerfile, router]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  function pushLog(text: string, level: LogLine["level"] = "info") {
    setLogs((prev) => [...prev, { ts: Date.now(), text, level }]);
  }

  async function startSandbox() {
    if (!sessionId) return;

    setStatus("building");
    setError(null);
    setLogs([]);
    setSandboxUrl(null);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/docker/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(Boolean);

        for (const line of lines) {
          try {
            const event = JSON.parse(line);

            if (event.type === "log") {
              pushLog(event.text, event.level ?? "info");
            } else if (event.type === "status") {
              if (event.status === "running") {
                setStatus("running");
                setDockerStatus("running");
                if (event.url) setSandboxUrl(event.url);
                pushLog(`Sandbox is live at ${event.url ?? "localhost"}`, "success");
              } else if (event.status === "error") {
                setStatus("error");
                setDockerStatus("error");
                setError(event.message ?? "Build failed");
                pushLog(event.message ?? "Build failed", "error");
              }
            }
          } catch {
            // Non-JSON line — treat as raw log
            if (line.trim()) pushLog(line);
          }
        }
      }

      // Stream ended without an explicit running/error event
      if (status === "building") {
        setStatus("running");
        setDockerStatus("running");
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        pushLog("Build cancelled.", "info");
        setStatus("stopped");
        return;
      }

      const msg = err?.message || "Failed to start sandbox";
      setError(msg);
      pushLog(msg, "error");
      setStatus("error");
    }
  }

  async function stopSandbox() {
    abortRef.current?.abort();

    if (!sessionId) return;

    try {
      await fetch("/api/docker/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      // Best-effort stop
    }

    setStatus("stopped");
    setDockerStatus("stopped");
    pushLog("Sandbox stopped.", "info");
  }

  if (!sessionId || !dockerfile) return null;

  const port = buildPlan?.port ?? 3000;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-indigo-400 font-mono text-xs mb-2">
              STEP 04 — SANDBOX
            </p>
            <h1 className="text-3xl font-bold mb-1">
              {result?.app_name ?? "Sandbox"}
            </h1>
            <p className="text-gray-400 text-sm">
              Docker sandbox · port {port}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => router.push("/palette")}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-900"
            >
              ← Back
            </button>

            {status === "idle" || status === "error" || status === "stopped" ? (
              <button
                onClick={startSandbox}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
              >
                {status === "error" || status === "stopped"
                  ? "Retry sandbox"
                  : "Launch sandbox →"}
              </button>
            ) : status === "building" ? (
              <button
                onClick={stopSandbox}
                className="rounded-lg bg-red-800 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
              >
                Cancel build
              </button>
            ) : (
              <button
                onClick={stopSandbox}
                className="rounded-lg border border-red-700 px-5 py-2 text-sm font-semibold text-red-400 hover:bg-red-900/30 transition-colors"
              >
                Stop sandbox
              </button>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="mb-6 flex items-center gap-3">
          <StatusDot status={status} />
          <span className="text-sm font-mono text-gray-400">
            {statusLabel(status)}
          </span>

          {status === "running" && sandboxUrl && (
            <a
              href={sandboxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-4 rounded-lg bg-teal-900/40 border border-teal-700 px-4 py-1.5 text-sm font-semibold text-teal-300 hover:bg-teal-800/40 transition-colors"
            >
              Open sandbox ↗
            </a>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Content grid */}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Left: tabs */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="flex border-b border-gray-800">
              {(
                [
                  ["logs", "Build logs"],
                  ["dockerfile", "Dockerfile"],
                  ["compose", "docker-compose.yml"],
                  ["manifest", "Mock manifest"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`px-4 py-3 text-xs font-mono transition-colors ${
                    activeTab === key
                      ? "border-b-2 border-indigo-500 text-indigo-300 bg-gray-950"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="h-[420px] overflow-y-auto p-4">
              {activeTab === "logs" && (
                <div className="font-mono text-xs space-y-0.5">
                  {logs.length === 0 ? (
                    <p className="text-gray-600">
                      {status === "idle"
                        ? "Press Launch sandbox to start building."
                        : "Waiting for output..."}
                    </p>
                  ) : (
                    logs.map((line, i) => (
                      <div
                        key={i}
                        className={logColor(line.level)}
                      >
                        <span className="text-gray-700 mr-2 select-none">
                          {new Date(line.ts).toISOString().slice(11, 19)}
                        </span>
                        {line.text}
                      </div>
                    ))
                  )}
                  <div ref={logsEndRef} />
                </div>
              )}

              {activeTab === "dockerfile" && (
                <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap">
                  {dockerfile ?? "Not generated yet."}
                </pre>
              )}

              {activeTab === "compose" && (
                <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap">
                  {composeFile ?? "Not generated yet."}
                </pre>
              )}

              {activeTab === "manifest" && (
                <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap">
                  {mockManifest
                    ? JSON.stringify(mockManifest, null, 2)
                    : "Not generated yet."}
                </pre>
              )}
            </div>
          </div>

          {/* Right: summary */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <p className="text-xs font-mono text-indigo-400 mb-4">
                SANDBOX DETAILS
              </p>

              <div className="space-y-3 text-sm">
                <Detail label="Status" value={statusLabel(status)} />
                <Detail
                  label="Runtime"
                  value={buildPlan?.framework ?? buildPlan?.runtime ?? "—"}
                />
                <Detail label="Port" value={String(port)} />
                <Detail
                  label="Base image"
                  value={buildPlan?.baseImage ?? "—"}
                />
                <Detail
                  label="Build stage"
                  value={buildPlan?.needsBuildStage ? "Yes (multi-stage)" : "No"}
                />
                <Detail
                  label="Features active"
                  value={String(
                    mockManifest?.enabledFeatures?.length ?? "—"
                  )}
                />
              </div>
            </div>

            {sandboxUrl && status === "running" && (
              <div className="rounded-2xl border border-teal-800 bg-teal-950/30 p-5">
                <p className="text-xs font-mono text-teal-400 mb-2">
                  LIVE URL
                </p>
                <a
                  href={sandboxUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-300 text-sm break-all hover:text-teal-200"
                >
                  {sandboxUrl}
                </a>
              </div>
            )}

            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <p className="text-xs font-mono text-gray-500 mb-2">
                SEED FILES
              </p>
              {mockManifest?.seedFiles?.length ? (
                <ul className="space-y-1">
                  {(mockManifest.seedFiles as { path: string }[]).map((f) => (
                    <li key={f.path} className="text-xs font-mono text-gray-400">
                      {f.path}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-600">None</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-gray-500 text-xs mb-0.5">{label}</p>
      <p className="text-white">{value}</p>
    </div>
  );
}

function StatusDot({ status }: { status: DockerStatus }) {
  const base = "w-2.5 h-2.5 rounded-full flex-shrink-0";

  if (status === "building") {
    return (
      <div
        className={`${base} bg-amber-400 animate-pulse`}
        aria-label="Building"
      />
    );
  }
  if (status === "running") {
    return <div className={`${base} bg-teal-400`} aria-label="Running" />;
  }
  if (status === "error") {
    return <div className={`${base} bg-red-500`} aria-label="Error" />;
  }
  return <div className={`${base} bg-gray-600`} aria-label="Idle" />;
}

function statusLabel(status: DockerStatus): string {
  switch (status) {
    case "building":
      return "Building…";
    case "running":
      return "Running";
    case "error":
      return "Build failed";
    case "stopped":
      return "Stopped";
    default:
      return "Ready to launch";
  }
}

function logColor(level: LogLine["level"]): string {
  switch (level) {
    case "error":
      return "text-red-400";
    case "success":
      return "text-teal-400";
    default:
      return "text-gray-300";
  }
}