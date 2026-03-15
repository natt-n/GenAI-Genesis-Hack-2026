"use client";

import { useSessionStore } from "@/store/session";
import type { RepoFeature } from "@/store/session";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import type { MockPlan } from "@/lib/mockgenerator";
import type { DockerfileArtifact } from "@/lib/dockerfilemaker";

export default function GeneratePage() {
  const router = useRouter();
  const {
    result,
    dockerResult,
    selectedFeatureIds,
    paletteConfig,
    paletteValues,
  } = useSessionStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [artifact, setArtifact] = useState<DockerfileArtifact | null>(null);
  const [activeTab, setActiveTab] = useState<"dockerfile" | "compose" | "env">("dockerfile");

  useEffect(() => {
    if (!result) {
      router.push("/");
      return;
    }
    if (!paletteConfig) {
      router.push("/palette");
      return;
    }
  }, [result, paletteConfig, router]);

  const selectedFeatures: RepoFeature[] =
    result?.features.filter((f) => selectedFeatureIds.includes(f.id)) ?? [];

  async function handleGenerate() {
    if (!dockerResult) {
      setError("Docker analysis is required. Please run analysis from the home page.");
      return;
    }

    setLoading(true);
    setError("");
    setArtifact(null);

    try {
      const mockRes = await fetch("/api/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dockerAnalysis: dockerResult,
          paletteValues: Object.keys(paletteValues).length > 0 ? paletteValues : undefined,
        }),
      });
      const mockData = await mockRes.json();
      if (!mockRes.ok) throw new Error(mockData.error || "Failed to generate mock data");

      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dockerAnalysis: dockerResult,
          mockPlan: mockData.mockPlan as MockPlan,
        }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error || "Failed to generate Docker artifacts");

      setArtifact(genData.artifact as DockerfileArtifact);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!result || !paletteConfig) return null;

  const paletteEntries = paletteConfig.controls.map((c) => ({
    id: c.id,
    label: c.label,
    value: paletteValues[c.id] ?? c.default_value,
  }));

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <p className="text-indigo-400 font-mono text-xs mb-2">
            STEP 04 — GENERATE SANDBOX
          </p>
          <h1 className="text-3xl font-bold mb-2">Overview & generate</h1>
          <p className="text-gray-400">
            Review your chosen business features and data palette, then generate
            the Docker sandbox with mock data for CodeSandbox.
          </p>
        </div>

        {/* Business features chosen */}
        <section className="mb-8">
          <h2 className="text-xs font-mono text-gray-500 mb-3 tracking-widest">
            BUSINESS FEATURES CHOSEN
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm mb-4">{result.app_name} — {result.app_description}</p>
            <ul className="space-y-3">
              {selectedFeatures.map((f) => (
                <li
                  key={f.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50"
                >
                  <span className="font-medium text-indigo-300">{f.name}</span>
                  <span className="text-gray-400 text-sm">{f.description}</span>
                  <div className="flex gap-2 flex-shrink-0">
                    {f.roles.map((r) => (
                      <span
                        key={r}
                        className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Control palette inputs chosen */}
        <section className="mb-8">
          <h2 className="text-xs font-mono text-gray-500 mb-3 tracking-widest">
            CONTROL PALETTE INPUTS CHOSEN
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {paletteEntries.map(({ id, label, value }) => (
                <li
                  key={id}
                  className="flex justify-between items-center py-2 px-3 rounded-lg bg-gray-800/50 border border-gray-700/50"
                >
                  <span className="text-sm text-gray-300">{label}</span>
                  <span className="text-sm font-mono text-indigo-300">
                    {typeof value === "boolean" ? (value ? "on" : "off") : String(value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {error && (
          <div className="mb-6 bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 mb-8">
          <button
            onClick={handleGenerate}
            disabled={loading || !dockerResult}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
          >
            {loading && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {loading ? "Generating mock data & Docker..." : "Generate sandbox"}
          </button>
          {!dockerResult && (
            <span className="text-amber-400 text-sm">
              Docker analysis is missing — run repo analysis first.
            </span>
          )}
          <button
            onClick={() => router.push("/palette")}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ← Back to palette
          </button>
        </div>

        {/* Artifact output */}
        {artifact && (
          <section className="border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex border-b border-gray-800 bg-gray-900/80">
              {["dockerfile", "compose", "env"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as typeof activeTab)}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? "text-indigo-400 border-b-2 border-indigo-500 bg-gray-900"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {tab === "dockerfile" && "Dockerfile"}
                  {tab === "compose" && "docker-compose"}
                  {tab === "env" && ".env.sandbox"}
                </button>
              ))}
            </div>
            <div className="p-4 bg-gray-950 min-h-[200px]">
              {activeTab === "dockerfile" && (
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                  {artifact.dockerfile.replace(/\\n/g, "\n")}
                </pre>
              )}
              {activeTab === "compose" && (
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                  {artifact.dockerCompose?.replace(/\\n/g, "\n") ?? "No compose file (single-container sandbox)."}
                </pre>
              )}
              {activeTab === "env" && (
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                  {artifact.envSandbox.replace(/\\n/g, "\n")}
                </pre>
              )}
            </div>
            <div className="px-4 py-2 border-t border-gray-800 bg-gray-900/50 text-xs text-gray-500">
              CodeSandbox-ready: {artifact.summary.codeSandboxReady ? "Yes" : "No"} · Port: {artifact.summary.exposedPort}
              {artifact.summary.composeServices.length > 0 && ` · Services: ${artifact.summary.composeServices.join(", ")}`}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
