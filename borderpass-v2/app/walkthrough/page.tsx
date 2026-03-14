"use client";
import { useSessionStore } from "@/store/session";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function WalkthroughPage() {
  const router = useRouter();
  const { result, sessionId } = useSessionStore();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!result) router.push("/");
  }, [result]);

  if (!result) return null;

  const steps = result.walkthrough_steps;
  const current = steps[step];

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <p className="text-indigo-400 font-mono text-xs mb-2">
            STEP 04 — WALKTHROUGH
          </p>
          <h1 className="text-3xl font-bold mb-2">Here's what's in your sandbox</h1>
          <p className="text-gray-400">
            Step through the key features before entering, or skip to explore
            freely.
          </p>
        </div>

        {/* Progress pips */}
        <div className="flex gap-2 mb-6">
          {steps.map((_: any, i: number) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? "bg-indigo-500 w-8"
                  : i < step
                  ? "bg-green-500 w-4"
                  : "bg-gray-700 w-4"
              }`}
            />
          ))}
          <span className="text-gray-500 text-xs ml-auto font-mono">
            {step + 1} / {steps.length}
          </span>
        </div>

        {/* Step card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
          <div className="text-indigo-400 font-mono text-xs mb-3">
            {current.feature_id.toUpperCase().replace(/_/g, " ")}
          </div>
          <h2 className="text-xl font-semibold mb-3">{current.title}</h2>
          <p className="text-gray-300 leading-relaxed mb-4">{current.caption}</p>
          <div className="flex gap-4 text-sm text-gray-500">
            <span className="font-mono bg-gray-800 px-2 py-1 rounded">
              {current.route}
            </span>
            <span className="bg-gray-800 px-2 py-1 rounded">
              ↳ {current.highlight}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            ← Back
          </button>

          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={() => router.push(`/sandbox/${sessionId}`)}
              className="bg-green-600 hover:bg-green-500 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Enter sandbox →
            </button>
          )}
        </div>

        <div className="text-center mt-4">
          <button
            onClick={() => router.push(`/sandbox/${sessionId}`)}
            className="text-gray-500 hover:text-gray-300 text-sm underline underline-offset-2 transition-colors"
          >
            Skip walkthrough
          </button>
        </div>
      </div>
    </main>
  );
}