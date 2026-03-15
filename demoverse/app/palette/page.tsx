"use client";
import { useSessionStore } from "@/store/session";
import type { PaletteControl } from "@/store/session";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function PalettePage() {
  const router = useRouter();
  const { result, selectedFeatureIds, paletteConfig, setPaletteValues } = useSessionStore();
  const [values, setValues] = useState<Record<string, string | number | boolean>>({});

  useEffect(() => {
    if (!result) { router.push("/"); return; }
    // Palette is generated from scenarios; user must come via "Configure data" so we have paletteConfig
    if (!paletteConfig) { router.push("/scenarios"); return; }
    const defaults: Record<string, string | number | boolean> = {};
    paletteConfig.controls.forEach((c: PaletteControl) => {
      defaults[c.id] = c.default_value as string | number | boolean;
    });
    setValues(defaults);
  }, [result, paletteConfig, router]);

  function handleChange(id: string, value: string | number | boolean) {
    setValues((prev) => ({ ...prev, [id]: value }));
  }

  function handleLaunch() {
    setPaletteValues(values);
    router.push("/generate");
  }

  if (!result || !paletteConfig) return null;

  const groups: Record<string, PaletteControl[]> = paletteConfig.controls.reduce(
    (acc: Record<string, PaletteControl[]>, c: PaletteControl) => {
      if (!acc[c.group]) acc[c.group] = [];
      acc[c.group].push(c);
      return acc;
    },
    {} as Record<string, PaletteControl[]>
  );

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <p className="text-indigo-400 font-mono text-xs mb-2">
            STEP 03 — DATA PALETTE
          </p>
          <h1 className="text-3xl font-bold mb-2">Configure sandbox data</h1>
          <p className="text-gray-400">
            AI has identified the controllable elements for your selected
            features and sandbox dependencies. Adjust to shape your demo.
          </p>
          {selectedFeatureIds.length > 0 && result && (
            <p className="text-gray-500 text-sm mt-2">
              Based on {selectedFeatureIds.length} feature{selectedFeatureIds.length !== 1 ? "s" : ""}:{" "}
              {result.features
                .filter((f) => selectedFeatureIds.includes(f.id))
                .map((f) => f.name)
                .join(", ")}
            </p>
          )}
        </div>

        <div className="space-y-6 mb-8">
          {Object.entries(groups).map(([group, controls]) => (
            <div
              key={group}
              className="bg-gray-900 border border-gray-800 rounded-xl p-6"
            >
              <h2 className="text-xs font-mono text-gray-500 mb-4 tracking-widest">
                {group.toUpperCase()}
              </h2>
              <div className="space-y-4">
                {controls.map((control: PaletteControl) => (
                  <div key={control.id}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-gray-200">
                        {control.label}
                      </label>
                      {control.type === "toggle" && (
                        <button
                          onClick={() =>
                            handleChange(
                              control.id,
                              values[control.id] === "on" || values[control.id] === true ? "off" : "on"
                            )
                          }
                          className={`w-10 h-6 rounded-full transition-colors flex items-center ${
                            values[control.id] === "on" || values[control.id] === true
                              ? "bg-indigo-600"
                              : "bg-gray-700"
                          }`}
                        >
                          <div
                            className={`w-4 h-4 bg-white rounded-full mx-1 transition-transform ${
                              values[control.id] === "on" || values[control.id] === true
                                ? "translate-x-4"
                                : "translate-x-0"
                            }`}
                          />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      {control.description}
                    </p>
                    {control.type === "select" && (
                      <select
                        value={String(values[control.id] ?? control.default_value ?? "")}
                        onChange={(e) =>
                          handleChange(control.id, e.target.value)
                        }
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-indigo-500"
                      >
                        {(control.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}
                    {control.type === "slider" && (
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={control.min ?? 0}
                          max={control.max ?? 10}
                          value={Number(values[control.id] ?? control.default_value ?? control.min ?? 0)}
                          onChange={(e) =>
                            handleChange(control.id, Number(e.target.value))
                          }
                          className="flex-1 accent-indigo-500"
                        />
                        <span className="text-sm text-gray-400 w-8 text-right font-mono">
                          {values[control.id] ?? control.default_value ?? control.min ?? 0}
                          {control.unit ? ` ${control.unit}` : ""}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-gray-800">
          <button
            onClick={() => router.push("/scenarios")}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={handleLaunch}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Continue to generate →
          </button>
        </div>
      </div>
    </main>
  );
}