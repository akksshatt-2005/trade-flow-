"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, Company } from "../../context/AuthContext";

export default function SelectCompanyPage() {
  const { user, companies, activeCompany, selectCompany, createCompany, loading, logout } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [address, setAddress] = useState("");
  const [state, setState] = useState("Maharashtra");
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
      const fullAddress = address.trim() ? `${address.trim()}, ${state.trim()}` : state.trim();
      const res = await createCompany(name.trim(), gstNumber.trim(), fullAddress);
      if (res.success && res.company) {
        setName("");
        setGstNumber("");
        setAddress("");
        setShowCreateModal(false);
        selectCompany(res.company);
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
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-xs text-slate-500">
        Loading shops...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 rounded-lg bg-blue-600 items-center justify-center font-bold text-white text-xl shadow-md mb-3">
            TF
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Select Active Business
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Choose the pharmacy store or business branch to manage
          </p>
        </div>

        {/* Company List Card */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Your Registered Shops ({companies.length})
            </span>
            <button
              onClick={() => setShowCreateModal(true)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
            >
              + Register New Shop
            </button>
          </div>

          {companies.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              You do not have any shops registered yet.
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm"
                >
                  Register Your First Shop
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {companies.map((comp) => (
                <div
                  key={comp.id}
                  onClick={() => handleSelect(comp)}
                  className="p-3 border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50/50 flex items-center justify-between transition-colors cursor-pointer group"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900 group-hover:text-blue-900">
                      {comp.name}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                      <span>{comp.gst_number || "Unregistered GST"}</span>
                      {comp.address && <span>&bull; {comp.address}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">
                      {comp.role}
                    </span>
                    <span className="text-blue-600 font-bold text-sm">&rarr;</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Signed in as <strong>{user?.username}</strong></span>
            <button
              onClick={logout}
              className="text-red-600 hover:underline font-semibold cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Register New Shop Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Register New Shop / Business
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateCompany} className="p-5 space-y-4">
              {error && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Shop / Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Medical & General Store"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GSTIN Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 27AABCS1234F1Z1"
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono uppercase focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Operating State
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Maharashtra"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Address (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Store location, street, area, city"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  {submitting ? "Creating..." : "Save Shop"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
