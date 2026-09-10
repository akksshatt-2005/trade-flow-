"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, Company } from "../context/AuthContext";

interface HealthData {
  status: string;
  timestamp: string;
  version: string;
  uptimeSeconds: number;
}

export default function DashboardPage() {
  const {
    user,
    token,
    companies,
    activeCompany,
    selectCompany,
    loading: authLoading,
    logout,
    apiFetch,
  } = useAuth();

  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [scopedContext, setScopedContext] = useState<any>(null);
  const [scopedLoading, setScopedLoading] = useState(false);

  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setCompanyDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch Backend Health
  const checkHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await apiFetch("/health");
      if (res.ok) {
        const json = await res.json();
        setHealthData(json);
      } else {
        setHealthError(`Server returned status: ${res.status}`);
      }
    } catch (err: any) {
      setHealthError(err.message || "Failed to connect to backend");
    } finally {
      setHealthLoading(false);
    }
  };

  // Verify Scoped Tenant Access via Backend Guard
  const verifyTenantScope = async () => {
    if (!token || !activeCompany) return;
    setScopedLoading(true);
    try {
      const res = await apiFetch("/companies/current");
      if (res.ok) {
        const data = await res.json();
        setScopedContext(data.context);
      }
    } catch {
      // Ignore
    } finally {
      setScopedLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  useEffect(() => {
    if (activeCompany) {
      verifyTenantScope();
    }
  }, [activeCompany]);

  const isConnected = !healthLoading && !healthError && healthData?.status === "ok";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-cyan-500 selection:text-white">
      {/* Navigation Header */}
      <header className="border-b border-slate-800/80 backdrop-blur-md bg-slate-950/70 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
              TF
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight text-white flex items-center gap-2">
                Trade Flow
                <span className="text-[10px] uppercase font-mono px-2 py-0.2 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/50">
                  v0.2.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Medicine & Inventory System</p>
            </div>
          </div>

          {/* User & Company Context Nav Actions */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {/* Switch Company Control Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    id="switch-company-btn"
                    onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs text-slate-200 transition-all cursor-pointer shadow-sm"
                  >
                    <span className="text-cyan-400">🏢</span>
                    <span className="font-medium max-w-[140px] truncate">
                      {activeCompany ? activeCompany.name : "Select Company"}
                    </span>
                    {activeCompany && (
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                        {activeCompany.role}
                      </span>
                    )}
                    <svg
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                        companyDropdownOpen ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {companyDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 backdrop-blur-xl animate-fadeIn">
                      <div className="px-3 py-2 border-b border-slate-800/80 mb-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Switch Active Company
                        </p>
                      </div>

                      <div className="max-h-56 overflow-y-auto space-y-1">
                        {companies.map((comp) => {
                          const isCurrent = activeCompany?.id === comp.id;
                          return (
                            <button
                              key={comp.id}
                              onClick={() => {
                                selectCompany(comp);
                                setCompanyDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                                isCurrent
                                  ? "bg-cyan-950/60 text-cyan-300 border border-cyan-800/50"
                                  : "hover:bg-slate-800/70 text-slate-300"
                              }`}
                            >
                              <div className="truncate pr-2">
                                <div className="font-medium truncate text-white">
                                  {comp.name}
                                </div>
                                {comp.gst_number && (
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    {comp.gst_number}
                                  </div>
                                )}
                              </div>
                              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                {comp.role}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-800/80">
                        <Link
                          href="/select-company"
                          onClick={() => setCompanyDropdownOpen(false)}
                          className="w-full block text-center py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-medium transition-colors"
                        >
                          + Manage & Add Companies
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                {/* User Profile Badge */}
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                  <span className="font-mono">@{user.username}</span>
                </div>

                {/* Logout Button */}
                <button
                  id="logout-btn"
                  onClick={logout}
                  className="px-3 py-1.5 rounded-xl border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-900/50 text-xs font-medium transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-xl text-slate-300 hover:text-white text-xs font-medium transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20 transition-all"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Dashboard Body */}
      <main className="max-w-7xl mx-auto px-6 py-10 w-full flex-1">
        {/* Welcome Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 p-6 sm:p-8 rounded-3xl relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/60 text-xs text-cyan-300 mb-3">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
              Phase 2: Authentication & Tenant Context Active
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              {activeCompany ? activeCompany.name : "Welcome to Trade Flow"}
            </h1>
            <p className="text-slate-400 text-sm mt-1 max-w-xl">
              {activeCompany
                ? `Logged in as @${user?.username} (${activeCompany.role.toUpperCase()}). Scoped to Tenant ID: ${activeCompany.id}`
                : "Multi-tenant inventory, medicine catalog, and billing system with strict data isolation."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {user ? (
              <>
                <Link
                  href="/select-company"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700"
                >
                  <span>🔄 Switch Company</span>
                </Link>
                <button
                  onClick={verifyTenantScope}
                  disabled={scopedLoading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-all shadow-lg shadow-cyan-600/20"
                >
                  <span>{scopedLoading ? "Verifying..." : "⚡ Test Guard Access"}</span>
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-all shadow-lg shadow-cyan-600/20"
              >
                <span>Sign In to Access Dashboard &rarr;</span>
              </Link>
            )}
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Card 1: Auth & User Security */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
            <div className="h-10 w-10 rounded-xl bg-cyan-950 border border-cyan-800/80 flex items-center justify-center text-lg mb-4 text-cyan-400">
              🔐
            </div>
            <h3 className="text-base font-semibold text-white mb-1">
              Supabase Auth (Option A)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Username-only login. Passwords reside strictly inside Supabase Auth. Public table holds 0 password hashes.
            </p>
            <div className="text-[11px] font-mono text-cyan-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
              {user ? `User: @${user.username}` : "State: Unauthenticated"}
            </div>
          </div>

          {/* Card 2: Tenant Scoping Guard */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
            <div className="h-10 w-10 rounded-xl bg-emerald-950 border border-emerald-800/80 flex items-center justify-center text-lg mb-4 text-emerald-400">
              🛡️
            </div>
            <h3 className="text-base font-semibold text-white mb-1">
              CompanyScopeGuard
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Enforces <code className="text-slate-300">x-company-id</code> validation on every request. Rejects unauthorized access with HTTP 403.
            </p>
            <div className="text-[11px] font-mono text-emerald-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
              {activeCompany ? `Tenant: ${activeCompany.id.substring(0, 16)}...` : "Tenant: None Active"}
            </div>
          </div>

          {/* Card 3: Stock Ledger Protection */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
            <div className="h-10 w-10 rounded-xl bg-purple-950 border border-purple-800/80 flex items-center justify-center text-lg mb-4 text-purple-400">
              📦
            </div>
            <h3 className="text-base font-semibold text-white mb-1">
              Immutable Stock Ledger
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Postgres trigger blocks UPDATE and DELETE. Append-only transactions ensure 100% audit integrity.
            </p>
            <div className="text-[11px] font-mono text-purple-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
              Trigger: prevent_stock_ledger_modification()
            </div>
          </div>
        </div>

        {/* Backend Connectivity Status */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4 mb-4">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                Backend System Health & Session Status
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Target Endpoint: <code className="text-cyan-300 font-mono">/health</code>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-mono font-medium ${
                  isConnected
                    ? "bg-emerald-950/40 border-emerald-800/50 text-emerald-300"
                    : "bg-rose-950/40 border-rose-800/50 text-rose-300"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-500"
                  }`}
                />
                <span>{isConnected ? "Backend Operational" : "Backend Offline"}</span>
              </div>

              <button
                onClick={checkHealth}
                disabled={healthLoading}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors cursor-pointer"
              >
                {healthLoading ? "Checking..." : "Re-Check"}
              </button>
            </div>
          </div>

          {healthData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                <span className="text-slate-500 block text-[10px]">Status</span>
                <span className="text-emerald-400 font-bold">{healthData.status}</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                <span className="text-slate-500 block text-[10px]">Version</span>
                <span className="text-cyan-300">{healthData.version}</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                <span className="text-slate-500 block text-[10px]">Uptime</span>
                <span className="text-slate-300">{healthData.uptimeSeconds}s</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                <span className="text-slate-500 block text-[10px]">Active Companies</span>
                <span className="text-white font-bold">{companies.length}</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-600">
        Trade Flow Multi-Tenant Platform &bull; Phase 2 Complete
      </footer>
    </div>
  );
}
