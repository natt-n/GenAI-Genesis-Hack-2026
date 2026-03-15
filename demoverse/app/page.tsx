"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/session";

export default function Home() {
  const router = useRouter();

  const { setSessionId, setRepoUrl, setResult, setDockerResult } =
    useSessionStore();

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!url.trim()) return;

    setLoading(true);
    setError("");

    const steps = [
      "Fetching repo files...",
      "Reading README and routes...",
      "Analysing product functionality...",
      "Analysing docker sandbox requirements...",
      "Finding external dependencies to mock...",
      "Preparing scenario map...",
    ];

    let i = 0;
    setStatus(steps[0]);

    const interval = setInterval(() => {
      i++;
      if (i < steps.length) setStatus(steps[i]);
    }, 3000);

    try {
      const analyseRes = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: url }),
      });

      const analyseData = await analyseRes.json();

      if (!analyseRes.ok) {
        throw new Error(analyseData.error || "Analysis failed");
      }

      setStatus("Analysing docker sandbox requirements...");

      const dockerRes = await fetch("/api/dockeranalyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: url,
          sessionId: analyseData.sessionId,
        }),
      });

      const dockerData = await dockerRes.json();

      clearInterval(interval);

      if (!dockerRes.ok) {
        throw new Error(dockerData.error || "Docker analysis failed");
      }

      setSessionId(analyseData.sessionId);
      setRepoUrl(url);
      setResult(analyseData.result ?? null);
      setDockerResult(dockerData.result ?? null);

      router.push(`/scenarios?session=${analyseData.sessionId}`);
    } catch (err: any) {
      clearInterval(interval);
      setError(err.message || "Something went wrong");
      setStatus("");
      setLoading(false);
      return;
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8">
      <div className="max-w-xl w-full">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-3">DemoVerse</h1>
          <p className="text-gray-400 text-lg">
            Paste a GitHub repo. Get a live demo sandbox in minutes!
            Discover your product's demoverse. 
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
            {loading ? "Analysing..." : "Analyse repo →"}
          </button>

          {status && (
            <div className="mt-4 flex items-center gap-3 text-sm text-gray-400">
              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              {status}
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        <p className="text-center text-gray-600 text-sm mt-6">
          Works with Next.js, React, Rails, Django, and Express web apps
        </p>
      </div>
    </main>
  );
}