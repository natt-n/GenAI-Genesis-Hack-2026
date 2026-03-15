"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/session";

export default function Home() {
  const router = useRouter();
  const { setAnalysisPayload, reset } = useSessionStore();

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!url.trim()) return;

    setLoading(true);
    setError("");
    setStatus("");
    reset();

    const normalizedUrl = url.trim();

    const steps = [
      "Fetching repo files...",
      "Reading manifests, routes, and models...",
      "Analysing business capabilities...",
      "Detecting runtime and external services...",
      "Preparing sandbox options...",
    ];

    let i = 0;
    setStatus(steps[0]);

    const interval = setInterval(() => {
      i += 1;
      if (i < steps.length) setStatus(steps[i]);
    }, 2200);

    try {
      const res = await fetch("/api/analyse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ repoUrl: normalizedUrl }),
      });

      const data = await res.json();
      clearInterval(interval);

      if (!res.ok) {
        throw new Error(data?.error || "Analysis failed");
      }

      setAnalysisPayload({
        sessionId: data.sessionId,
        repoUrl: normalizedUrl,
        result: data.result ?? null,
        buildPlan: data.buildPlan ?? null,
        dockerfile: data.dockerfile ?? null,
        composeFile: data.composeFile ?? null,
        mockManifest: data.mockManifest ?? null,
        dockerStatus: data.dockerStatus ?? null,
      });

      setStatus("");
      router.push(`/scenarios?session=${data.sessionId}`);
    } catch (err: any) {
      clearInterval(interval);
      setError(err?.message || "Something went wrong");
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8">
      <div className="max-w-xl w-full">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-3">BorderPass</h1>
          <p className="text-gray-400 text-lg">
            Paste a GitHub repo. Analyse the app, choose features, then launch a
            tailored demo sandbox.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <label className="block text-sm text-gray-400 mb-2 font-mono">
            GITHUB REPO URL
          </label>

          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/org/repo"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 mb-4 font-mono text-sm"
            disabled={loading}
          />

          <button
            onClick={handleSubmit}
            disabled={loading || !url.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? "Analysing repo..." : "Analyse repo →"}
          </button>

          {status && (
            <div className="mt-4 flex items-center gap-3 text-sm text-gray-400">
              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span>{status}</span>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-sm text-gray-600">
          Analyse first. Docker sandbox is finalized after feature selection and
          palette configuration.
        </div>
      </div>
    </main>
  );
}
