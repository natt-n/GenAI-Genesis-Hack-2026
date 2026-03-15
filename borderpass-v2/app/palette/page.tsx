"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/session";

export default function PalettePage() {
  const router = useRouter();

  const {
    sessionId,
    result,
    selectedFeatureIds,
    paletteValues,
    setPaletteValues,
    setBuildPlan,
    setDockerfile,
    setComposeFile,
    setMockManifest,
    setDockerStatus,
  } = useSessionStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedFeatures = useMemo(() => {
    const features = result?.features ?? [];
    const selected = new Set(selectedFeatureIds);
    return features.filter((feature) => selected.has(feature.id));
  }, [result, selectedFeatureIds]);

  const controls = useMemo(() => {
    const allControls = result?.palette_controls ?? [];
    const selected = new Set(selectedFeatureIds);

    return allControls.filter((control) => {
      if ("feature_id" in control && control.feature_id) {
        return selected.has(control.feature_id);
      }

      if (
        "feature_ids" in control &&
        Array.isArray(control.feature_ids) &&
        control.feature_ids.length > 0
      ) {
        return control.feature_ids.some((id: string) => selected.has(id));
      }

      return true;
    });
  }, [result, selectedFeatureIds]);

  function updateControl(id: string, value: any) {
    setPaletteValues({
      ...paletteValues,
      [id]: value,
    });
  }

  async function handleLaunchSandbox() {
    if (!sessionId) {
      setError("Missing session. Please restart the flow.");
      return;
    }

    if (selectedFeatureIds.length === 0) {
      setError("Please select at least one feature.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/sandbox/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          selectedFeatureIds,
          paletteValues,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to finalize sandbox");
      }

      setBuildPlan(data.buildPlan ?? null);
      setDockerfile(data.dockerfile ?? null);
      setComposeFile(data.composeFile ?? null);
      setMockManifest(data.mockManifest ?? null);
      setDockerStatus(data.dockerStatus ?? "ready");

      router.push("/sandbox");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to finalize sandbox"
      );
    } finally {
      setLoading(false);
    }
  }

  if (!result) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <p className="text-indigo-400 font-mono text-xs mb-2">
            STEP 03 — CONTROL PALETTE
          </p>
          <h1 className="text-3xl font-bold mb-2">Configure sandbox data</h1>
          <p className="text-gray-400">
            Set mock values, seed sizes, and toggles for the features you chose.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="space-y-6">
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <h2 className="text-lg font-semibold mb-3">Selected features</h2>

              <div className="flex flex-wrap gap-2">
                {selectedFeatures.map((feature) => (
                  <span
                    key={feature.id}
                    className="rounded-full bg-indigo-950 border border-indigo-800 px-3 py-1 text-sm text-indigo-200"
                  >
                    {feature.name}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <h2 className="text-lg font-semibold mb-4">Mock controls</h2>

              {controls.length === 0 ? (
                <p className="text-gray-400">
                  No specific controls were detected for the selected features.
                  You can still launch the sandbox with default mock values.
                </p>
              ) : (
                <div className="space-y-4">
                  {controls.map((control) => {
                    const value =
                      paletteValues[control.id] ?? control.default_value;

                    if (control.type === "toggle") {
                      return (
                        <label
                          key={control.id}
                          className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-950 px-4 py-4"
                        >
                          <div className="pr-4">
                            <p className="font-medium">{control.label}</p>
                            <p className="text-sm text-gray-400">
                              {control.description}
                            </p>
                          </div>

                          <input
                            type="checkbox"
                            checked={Boolean(value)}
                            onChange={(e) =>
                              updateControl(control.id, e.target.checked)
                            }
                            className="h-4 w-4"
                          />
                        </label>
                      );
                    }

                    if (control.type === "select") {
                      return (
                        <div
                          key={control.id}
                          className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-4"
                        >
                          <p className="font-medium mb-1">{control.label}</p>
                          <p className="text-sm text-gray-400 mb-3">
                            {control.description}
                          </p>

                          <select
                            value={value ?? ""}
                            onChange={(e) =>
                              updateControl(control.id, e.target.value)
                            }
                            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none"
                          >
                            {(control.options ?? []).map((option: string) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={control.id}
                        className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-4"
                      >
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <div>
                            <p className="font-medium">{control.label}</p>
                            <p className="text-sm text-gray-400">
                              {control.description}
                            </p>
                          </div>

                          <span className="text-sm font-mono text-indigo-300">
                            {String(value ?? control.default_value ?? 0)}
                          </span>
                        </div>

                        <input
                          type="range"
                          min={control.min ?? 0}
                          max={control.max ?? 100}
                          value={value ?? control.default_value ?? 0}
                          onChange={(e) =>
                            updateControl(control.id, Number(e.target.value))
                          }
                          className="w-full"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-xl border border-red-800 bg-red-950 px-4 py-3 text-red-200">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={() => router.push("/scenarios")}
                className="rounded-lg border border-gray-700 px-5 py-3 text-gray-300 hover:bg-gray-900"
              >
                ← Back
              </button>

              <button
                onClick={handleLaunchSandbox}
                disabled={loading}
                className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Building sandbox..." : "Launch sandbox"}
              </button>
            </div>
          </section>

          <aside className="h-fit rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs font-mono text-indigo-400 mb-3">
              SANDBOX OUTPUT
            </p>

            <div className="space-y-4 text-sm">
              <div>
                <p className="text-gray-500 mb-1">App</p>
                <p className="text-white">
                  {result.app_name || "Untitled App"}
                </p>
              </div>

              <div>
                <p className="text-gray-500 mb-1">Selected features</p>
                <p className="text-white">{selectedFeatureIds.length}</p>
              </div>

              <div>
                <p className="text-gray-500 mb-1">Mock controls shown</p>
                <p className="text-white">{controls.length}</p>
              </div>

              <div>
                <p className="text-gray-500 mb-1">Build mode</p>
                <p className="text-white">Docker + mocked services</p>
              </div>

              <div>
                <p className="text-gray-500 mb-1">Expected result</p>
                <p className="text-gray-400">
                  The finalized sandbox will only include the selected feature
                  flags, feature-scoped mock data, and the control palette
                  values configured here.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
