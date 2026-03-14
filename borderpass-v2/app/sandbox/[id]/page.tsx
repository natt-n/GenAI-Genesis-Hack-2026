"use client";
import { useSessionStore } from "@/store/session";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function SandboxPage() {
  const router = useRouter();
  const { result, sessionId, selectedFeatureIds } = useSessionStore();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!result) router.push("/");
  }, [result]);

  if (!result) return null;

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/s/${sessionId}`
      : "";

  function copyLink() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const hiddenFeatures = result.features
    .filter((f: any) => !selectedFeatureIds.includes(f.id))
    .map((f: any) => f.name)
    .join(" · ");

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-gray-500">
            sandbox.borderpass.io/s/{sessionId?.slice(0, 8)}
          </span>
          <span className="text-xs bg-green-900 text-green-400 px-2 py-0.5 rounded-full font-mono">
            ● Live
          </span>
          <span className="text-xs bg-yellow-900 text-yellow-400 px-2 py-0.5 rounded-full font-mono">
            Expires 24h
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/walkthrough")}
            className="text-xs text-gray-400 hover:text-white px-3 py-1.5 border border-gray-700 rounded-lg transition-colors"
          >
            ← Walkthrough
          </button>
          <button
            onClick={copyLink}
            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {copied ? "Copied!" : "Share link →"}
          </button>
        </div>
      </div>

      {/* Sandbox iframe */}
      <div className="flex-1">
        <iframe
          srcDoc={result.sandbox_html}
          className="w-full border-0"
          style={{ height: "calc(100vh - 80px)" }}
          title="Sandbox"
          sandbox="allow-scripts allow-forms allow-same-origin"
        />
      </div>

      {/* Hidden features note */}
      {hiddenFeatures && (
        <div className="px-4 py-2 bg-gray-900 border-t border-gray-800 text-xs text-gray-600 font-mono text-center">
          Illusion layer active — hidden: {hiddenFeatures}
        </div>
      )}
    </main>
  );
}