"use client";
import { useSessionStore } from "@/store/session";
import type { RepoFeature } from "@/store/session";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function ScenariosPage() {
  const router = useRouter();
  const {
    sessionId,
    result,
    dockerResult,
    selectedFeatureIds,
    setSelectedFeatureIds,
    setPaletteConfig,
  } = useSessionStore();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!result) { router.push("/"); return; }
    // Restore selection if user navigates back, otherwise pre-select first two
    if (selectedFeatureIds.length > 0) {
      setSelected(new Set(selectedFeatureIds));
    } else {
      setSelected(new Set(result.features.slice(0, 2).map((f) => f.id)));
    }
  }, [result]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 8) return prev; // max 8 enforced
        next.add(id);
      }
      return next;
    });
  }

  async function handleNext() {
    if (!result || !sessionId || selected.size === 0) return;

    setLoading(true);
    setError("");

    const selectedIds = Array.from(selected);
    const selectedFeatures = result.features.filter((f) =>
      selectedIds.includes(f.id)
    );

    try {
      const res = await fetch("/api/palette", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          selectedFeatures,
          roles: result.roles ?? [],
          entities: result.entities ?? [],
          externalDependencies: dockerResult?.externalDependencies ?? [],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate palette");

      // Save to store before navigating so palette/page.tsx can read immediately
      setSelectedFeatureIds(selectedIds);
      setPaletteConfig(data.paletteConfig);
      router.push("/palette");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!result) return null;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto">

        <div className="mb-8">
          <p className="text-indigo-400 font-mono text-xs mb-2">STEP 02 — SCENARIOS</p>
          <h1 className="text-3xl font-bold mb-2">{result.app_name}</h1>
          <p className="text-gray-400">{result.app_description}</p>
          {result.compatibility === "red" && (
            <div className="mt-3 bg-red-900/30 border border-red-700 rounded-lg px-4 py-2 text-red-400 text-sm">
              {result.compatibility_reason}
            </div>
          )}
          {result.compatibility === "yellow" && (
            <div className="mt-3 bg-amber-900/30 border border-amber-700 rounded-lg px-4 py-2 text-amber-400 text-sm">
              {result.compatibility_reason}
            </div>
          )}
        </div>

        <div className="mb-6">
          <p className="text-gray-300 mb-4">
            Select the features you want active in the sandbox. Maximum 8.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.features.map((feature: RepoFeature) => {
              const isSelected = selected.has(feature.id);
              const isDisabled = !isSelected && selected.size >= 8;
              return (
                <div
                  key={feature.id}
                  onClick={() => !isDisabled && toggle(feature.id)}
                  className={`border rounded-xl p-4 transition-all ${
                    isDisabled
                      ? "border-gray-800 bg-gray-900 opacity-40 cursor-not-allowed"
                      : isSelected
                      ? "border-indigo-500 bg-indigo-950 cursor-pointer"
                      : "border-gray-800 bg-gray-900 hover:border-gray-600 cursor-pointer"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className={`font-semibold ${isSelected ? "text-indigo-300" : "text-white"}`}>
                      {feature.name}
                    </h3>
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs flex-shrink-0 ml-2 ${
                      isSelected
                        ? "bg-indigo-500 border-indigo-500 text-white"
                        : "border-gray-600"
                    }`}>
                      {isSelected && "✓"}
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm">{feature.description}</p>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {feature.roles.map((role) => (
                      <span
                        key={role}
                        className="text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-400 font-mono"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-gray-800">
          <span className="text-gray-400 text-sm">
            <span className="text-white font-semibold">{selected.size}</span> of{" "}
            {result.features.length} features selected
            {selected.size === 8 && (
              <span className="text-amber-400 ml-2">(maximum reached)</span>
            )}
          </span>
          <button
            onClick={handleNext}
            disabled={selected.size === 0 || loading}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
          >
            {loading && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {loading ? "Generating palette..." : "Configure data →"}
          </button>
        </div>

      </div>
    </main>
  );
}