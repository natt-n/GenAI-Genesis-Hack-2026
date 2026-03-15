"use client";
import { useSessionStore } from "@/store/session";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function PalettePage() {
  const router = useRouter();
  const { result, selectedFeatureIds, setPaletteValues } = useSessionStore();
  const [values, setValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!result) { router.push("/"); return; }
    const defaults: Record<string, any> = {};
    result.palette_controls.forEach((c: any) => {
      defaults[c.id] = c.default_value;
    });
    setValues(defaults);
  }, [result]);

  function handleChange(id: string, value: any) {
    setValues((prev) => ({ ...prev, [id]: value }));
  }

  function handleLaunch() {
    setPaletteValues(values);
    router.push("/walkthrough");
  }

  if (!result) return null;

  const groups: Record<string, any[]> = result.palette_controls.reduce(
    (acc: Record<string, any[]>, c: any) => {
      if (!acc[c.group]) acc[c.group] = [];
      acc[c.group].push(c);
      return acc;
    },
    {} as Record<string, any[]>
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
            features. Adjust to shape your demo.
          </p>
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
                {controls.map((control: any) => (
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
                              values[control.id] === "on" ? "off" : "on"
                            )
                          }
                          className={`w-10 h-6 rounded-full transition-colors flex items-center ${
                            values[control.id] === "on"
                              ? "bg-indigo-600"
                              : "bg-gray-700"
                          }`}
                        >
                          <div
                            className={`w-4 h-4 bg-white rounded-full mx-1 transition-transform ${
                              values[control.id] === "on"
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
                        value={values[control.id] || ""}
                        onChange={(e) =>
                          handleChange(control.id, e.target.value)
                        }
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-indigo-500"
                      >
                        {(control.options as string[]).map((opt) => (
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
                          min={control.min}
                          max={control.max}
                          value={values[control.id] ?? control.min}
                          onChange={(e) =>
                            handleChange(control.id, Number(e.target.value))
                          }
                          className="flex-1 accent-indigo-500"
                        />
                        <span className="text-sm text-gray-400 w-8 text-right font-mono">
                          {values[control.id] ?? control.min}
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
            Generate walkthrough →
          </button>
        </div>
      </div>
    </main>
  );
}