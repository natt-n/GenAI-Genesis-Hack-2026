"use client";
import { useSessionStore } from "@/store/session";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function ScenariosPage() {
  const router = useRouter();
  const { result, selectedFeatureIds, setSelectedFeatureIds } =
    useSessionStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!result) { router.push("/"); return; }
    // Pre-select first two features
    const defaults = result.features.slice(0, 2).map((f: any) => f.id);
    setSelected(new Set(defaults));
  }, [result]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleNext() {
    setSelectedFeatureIds(Array.from(selected));
    router.push("/palette");
  }

  if (!result) return null;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <p className="text-indigo-400 font-mono text-xs mb-2">STEP 02 — SCENARIOS</p>
          <h1 className="text-3xl font-bold mb-2">{result.app_name}</h1>
          <p className="text-gray-400">{result.app_description}</p>
        </div>

        <div className="mb-6">
          <p className="text-gray-300 mb-4">
            Select the features you want active in the sandbox. Unselected
            features will be hidden.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.features.map((feature: any) => {
              const isSelected = selected.has(feature.id);
              return (
                <div
                  key={feature.id}
                  onClick={() => toggle(feature.id)}
                  className={`border rounded-xl p-4 cursor-pointer transition-all ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-950"
                      : "border-gray-800 bg-gray-900 hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3
                      className={`font-semibold ${
                        isSelected ? "text-indigo-300" : "text-white"
                      }`}
                    >
                      {feature.name}
                    </h3>
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs flex-shrink-0 ml-2 ${
                        isSelected
                          ? "bg-indigo-500 border-indigo-500 text-white"
                          : "border-gray-600"
                      }`}
                    >
                      {isSelected && "✓"}
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm">{feature.description}</p>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {feature.roles.map((role: string) => (
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

        <div className="flex items-center justify-between pt-4 border-t border-gray-800">
          <span className="text-gray-400 text-sm">
            <span className="text-white font-semibold">{selected.size}</span> of{" "}
            {result.features.length} features selected
          </span>
          <button
            onClick={handleNext}
            disabled={selected.size === 0}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Configure data →
          </button>
        </div>
      </div>
    </main>
  );
}