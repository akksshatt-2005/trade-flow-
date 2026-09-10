"use client";

import { useEffect, useState, useCallback } from "react";

interface HealthResponse {
  status: string;
  service?: string;
  timestamp?: string;
  uptime?: string;
  message?: string;
  targetUrl?: string;
  [key: string]: unknown;
}

export default function Home() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isCloudDeployment, setIsCloudDeployment] = useState<boolean>(false);

  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsCloudDeployment(
        window.location.hostname !== "localhost" &&
          window.location.hostname !== "127.0.0.1"
      );
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    const start = performance.now();

    try {
      // First try Next.js proxy route, then direct backend
      let res = await fetch(`/api/health`, { cache: "no-store" });
      if (!res.ok) {
        // Fallback to direct backend call
        res = await fetch(`${backendUrl}/health`, { cache: "no-store" });
      }

      const end = performance.now();
      setLatency(Math.round(end - start));

      const json = await res.json();
      if (!res.ok || json.status === "offline" || json.status === "error") {
        throw new Error(
          json.message || `HTTP error! status: ${res.status} ${res.statusText}`
        );
      }

      setData(json);
      setLastChecked(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch health check";
      setError(msg);
      setData(null);
      setLastChecked(new Date());
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const isConnected = !loading && !error && data?.status === "ok";
  const isCloudWithLocalhost = isCloudDeployment && backendUrl.includes("localhost");

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-cyan-500 selection:text-white">
      {/* Header / Nav */}
      <header className="border-b border-slate-800/80 backdrop-blur-md bg-slate-950/60 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
              TF
            </div>
            <div>
              <div className="font-bold text-base tracking-tight text-white flex items-center gap-2">
                Trade Flow
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/50">
                  Scaffold
                </span>
              </div>
              <p className="text-xs text-slate-400">Full-Stack Scaffolding v0.1.0</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono font-medium transition-all ${
                loading
                  ? "bg-amber-950/40 border-amber-800/50 text-amber-300"
                  : isConnected
                  ? "bg-emerald-950/40 border-emerald-800/50 text-emerald-300 shadow-sm shadow-emerald-500/10"
                  : "bg-rose-950/40 border-rose-800/50 text-rose-300"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  loading
                    ? "bg-amber-400 animate-ping"
                    : isConnected
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-rose-500"
                }`}
              />
              <span>
                {loading
                  ? "Checking Backend..."
                  : isConnected
                  ? "Backend Connected"
                  : "Backend Offline"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto px-6 py-12 w-full flex-1 flex flex-col justify-center">
        {/* Cloud Warning Alert if on Vercel with localhost URL */}
        {isCloudWithLocalhost && (
          <div className="mb-8 p-4 rounded-xl bg-amber-950/50 border border-amber-800/60 text-amber-200 text-sm flex items-start gap-3 shadow-lg">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="font-semibold text-amber-100">
                You are viewing this site live on Vercel Cloud!
              </p>
              <p className="text-xs text-amber-300/90 mt-1 leading-relaxed">
                Vercel cannot connect to <code className="bg-amber-900/60 px-1 py-0.5 rounded text-white">http://localhost:4000</code> because your NestJS backend is only running on your local computer.
              </p>
              <p className="text-xs text-amber-300/90 mt-1">
                👉 <strong>To fix for Vercel:</strong> Deploy your backend to <strong>Render</strong>, then set <code className="bg-amber-900/60 px-1 py-0.5 rounded text-white">NEXT_PUBLIC_BACKEND_URL=https://your-backend.onrender.com</code> in Vercel Project Settings.
              </p>
            </div>
          </div>
        )}

        {/* Hero Section */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300 mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
            End-to-End Scaffold Verification
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent mb-4">
            Trade Flow Full-Stack Core
          </h1>
          <p className="text-slate-400 text-base leading-relaxed">
            Next.js App Router communicating with NestJS backend, structured for Supabase integration and cloud deployment.
          </p>
        </div>

        {/* Health Check Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm mb-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                Backend Health Status Check
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Target Endpoint: <code className="bg-slate-950 px-2 py-0.5 rounded text-cyan-300 font-mono">{backendUrl}/health</code>
              </p>
            </div>

            <button
              id="recheck-health-btn"
              onClick={fetchHealth}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 disabled:opacity-50 disabled:pointer-events-none text-white text-sm font-medium transition-all shadow-lg shadow-cyan-600/20 cursor-pointer"
            >
              <svg
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {loading ? "Checking..." : "Re-check Health"}
            </button>
          </div>

          {/* Status Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Status Code</div>
              <div className="text-xl font-bold font-mono text-white flex items-center gap-2">
                {isConnected ? (
                  <span className="text-emerald-400">200 OK</span>
                ) : error ? (
                  <span className="text-rose-400">Failed</span>
                ) : (
                  <span className="text-slate-500">Checking...</span>
                )}
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Roundtrip Latency</div>
              <div className="text-xl font-bold font-mono text-cyan-400">
                {latency !== null ? `${latency} ms` : "—"}
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Last Sync Time</div>
              <div className="text-sm font-mono text-slate-300 truncate">
                {lastChecked ? lastChecked.toLocaleTimeString() : "Pending"}
              </div>
            </div>
          </div>

          {/* Response Payload Viewer */}
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Response Payload</span>
              <span className="text-[11px] text-slate-500 lowercase font-mono">application/json</span>
            </div>

            {error ? (
              <div className="bg-rose-950/30 border border-rose-900/50 rounded-xl p-4 text-rose-300 text-sm font-mono flex flex-col gap-2">
                <div className="font-semibold flex items-center gap-2">
                  <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Error reaching backend server
                </div>
                <p className="text-xs text-rose-300/80">{error}</p>
                <div className="mt-2 text-xs text-slate-400">
                  {isCloudWithLocalhost ? (
                    <div>
                      <span className="text-amber-300 font-semibold">Cloud Notice:</span> You are accessing this page on Vercel. Deploy your backend to Render and set <code className="bg-slate-900 px-1 py-0.5 rounded text-cyan-300">NEXT_PUBLIC_BACKEND_URL</code> in Vercel.
                    </div>
                  ) : (
                    <div>
                      <span className="text-slate-300 font-semibold">Local Troubleshooting:</span> Make sure backend is running locally on port 4000 (<code className="bg-slate-900 px-1 py-0.5 rounded text-cyan-300">cd backend && npm run start:dev</code>).
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-cyan-300 overflow-x-auto">
                {loading && !data
                  ? "Loading health response..."
                  : JSON.stringify(data, null, 2)}
              </pre>
            )}
          </div>
        </div>

        {/* Stack Architecture Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Next.js Card */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-black border border-slate-700 flex items-center justify-center text-xs font-bold text-white">
                N
              </div>
              <h3 className="font-semibold text-white text-sm">Frontend</h3>
              <span className="ml-auto text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">Next.js 15</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              React + TypeScript with App Router, deployed on Vercel.
            </p>
            <div className="text-[11px] font-mono text-slate-400 bg-slate-950 p-2 rounded border border-slate-800/80">
              Path: <span className="text-cyan-400">/frontend</span>
            </div>
          </div>

          {/* NestJS Card */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-xs font-bold text-rose-400">
                🐈
              </div>
              <h3 className="font-semibold text-white text-sm">Backend</h3>
              <span className="ml-auto text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">NestJS 10</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              TypeScript API framework with CORS and modular health check, deployable on Render.
            </p>
            <div className="text-[11px] font-mono text-slate-400 bg-slate-950 p-2 rounded border border-slate-800/80">
              Path: <span className="text-cyan-400">/backend</span>
            </div>
          </div>

          {/* Supabase Card */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-400">
                ⚡
              </div>
              <h3 className="font-semibold text-white text-sm">Supabase</h3>
              <span className="ml-auto text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">Postgres</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Connected to project <code className="text-emerald-400 font-mono">swgtmvsscaervhahzfjh</code>.
            </p>
            <div className="text-[11px] font-mono text-slate-400 bg-slate-950 p-2 rounded border border-slate-800/80 truncate">
              URL: <span className="text-cyan-400">swgtmvsscaervhahzfjh.supabase.co</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        <p>Trade Flow Scaffolding • Next.js + NestJS + Supabase</p>
      </footer>
    </main>
  );
}
