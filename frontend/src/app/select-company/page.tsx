"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, Company } from "../../context/AuthContext";

export default function SelectCompanyPage() {
  const { user, companies, activeCompany, selectCompany, createCompany, refreshCompanies, loading, logout } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  const handleSelect = (company: Company) => {
    selectCompany(company);
    router.push("/");
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Company name is required.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await createCompany(name.trim(), gstNumber.trim(), address.trim());
      if (res.success && res.company) {
        setName("");
        setGstNumber("");
        setAddress("");
        setShowCreateModal(false);
        router.push("/");
      } else {
        setError(res.error || "Failed to create company.");
      }
    } catch {
      setError("Unexpected error creating company.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-400">
        <div className="flex items-center gap-3">
          <span className="h-6 w-6 border-2 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin" />
          <span className="text-sm font-medium">Loading workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-cyan-500 selection:text-white relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] bg-cyan-600/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="border-b border-slate-800/80 backdrop-blur-md bg-slate-950/60 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
              TF
            </div>
            <div>
              <span className="font-bold text-sm text-white">Trade Flow</span>
              <p className="text-[11px] text-slate-400">Multi-Tenant Company Selector</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
              <span className="h-2 w-2 rounded-full bg-cyan-400"></span>
              <span>@{user?.username}</span>
            </div>
            <button
              onClick={logout}
              className="text-xs text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-12 w-full flex-1 flex flex-col justify-center">
        <div className="max-w-2xl mx-auto text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/50 border border-cyan-800/60 text-xs text-cyan-300 mb-3">
            <span>🏢</span>
            <span>Tenant Workspace Selection</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Select or Create a Company
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Each company maintains strictly isolated inventory, parties, and invoices.
          </p>
        </div>

        {/* Company Grid or Empty State */}
        {companies.length > 0 ? (
          <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto w-full mb-8">
            {companies.map((comp) => {
              const isSelected = activeCompany?.id === comp.id;
              return (
                <div
                  key={comp.id}
                  onClick={() => handleSelect(comp)}
                  className={`group p-6 rounded-2xl border transition-all cursor-pointer relative overflow-hidden backdrop-blur-sm ${
                    isSelected
                      ? "bg-slate-900 border-cyan-500 shadow-xl shadow-cyan-500/10 ring-1 ring-cyan-500/50"
                      : "bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900/90"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center text-lg font-bold text-cyan-400 group-hover:scale-105 transition-transform">
                      {comp.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span
                      className={`text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full border font-semibold ${
                        comp.role === "owner"
                          ? "bg-amber-950/60 border-amber-800/80 text-amber-300"
                          : comp.role === "accountant"
                          ? "bg-cyan-950/60 border-cyan-800/80 text-cyan-300"
                          : "bg-slate-800 border-slate-700 text-slate-300"
                      }`}
                    >
                      {comp.role}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-white group-hover:text-cyan-300 transition-colors">
                    {comp.name}
                  </h3>

                  {comp.gst_number && (
                    <p className="text-xs text-slate-400 font-mono mt-1">
                      GSTIN: <span className="text-slate-300">{comp.gst_number}</span>
                    </p>
                  )}

                  {comp.address && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                      📍 {comp.address}
                    </p>
                  )}

                  <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Tenant ID: {comp.id.substring(0, 8)}...</span>
                    <span className="text-cyan-400 group-hover:translate-x-1 transition-transform flex items-center gap-1 font-medium">
                      Enter Company &rarr;
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="max-w-md mx-auto w-full bg-slate-900/70 border border-slate-800 rounded-2xl p-8 text-center mb-8">
            <div className="h-14 w-14 rounded-2xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-2xl mx-auto mb-4">
              🏪
            </div>
            <h2 className="text-lg font-semibold text-white">No Companies Found</h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              You do not have any pharmacy or business companies registered yet. Create your first company to get started.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-all shadow-lg shadow-cyan-600/20 cursor-pointer"
            >
              <span>+ Create First Company</span>
            </button>
          </div>
        )}

        {/* Action to create new company if already has companies */}
        {companies.length > 0 && (
          <div className="text-center">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium transition-all shadow-md cursor-pointer"
            >
              <span>+ Add Another Company / Store</span>
            </button>
          </div>
        )}

        {/* Modal for Creating New Company */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl relative">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white">Create New Company</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    You will automatically be assigned as Owner
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-white text-sm p-1 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              {error && (
                <div className="mb-5 p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateCompany} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Company / Pharmacy Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Apex Health & Pharmacy Ltd"
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    GST Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value)}
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Store Address (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. Shop 14, Main Medical Complex, MG Road"
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !name.trim()}
                    className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 disabled:opacity-50 text-white text-xs font-semibold transition-all shadow-lg shadow-cyan-600/20"
                  >
                    {submitting ? "Creating..." : "Create & Enter Store"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-600">
        Trade Flow Multi-Tenant Architecture &bull; Option A (Supabase Auth)
      </footer>
    </div>
  );
}
