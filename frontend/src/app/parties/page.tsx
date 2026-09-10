"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, Company } from "../../context/AuthContext";

export interface Party {
  id: string;
  company_id: string;
  name: string;
  type: "customer" | "vendor" | "both";
  phone?: string | null;
  address?: string | null;
  gst_number?: string | null;
  created_at: string;
}

export interface PartySummary {
  party: Party;
  sales_invoices_count: number;
  purchase_invoices_count: number;
  total_sales_amount: number;
  total_purchase_amount: number;
  outstanding_balance: number;
}

export default function PartiesPage() {
  const {
    user,
    companies,
    activeCompany,
    selectCompany,
    loading: authLoading,
    logout,
    apiFetch,
  } = useAuth();

  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "customer" | "vendor" | "both">("all");

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Selected party for detail / edit
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [partySummary, setPartySummary] = useState<PartySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Add party form state
  const [name, setName] = useState("");
  const [type, setType] = useState<"customer" | "vendor" | "both">("customer");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit party form state
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"customer" | "vendor" | "both">("customer");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editGstNumber, setEditGstNumber] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Header dropdown state
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setCompanyDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch Parties list for active company
  const loadParties = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    setError(null);
    try {
      const queryParam = activeTab === "all" ? "" : `?type=${activeTab}`;
      const res = await apiFetch(`/parties${queryParam}`);
      const data = await res.json();
      if (res.ok) {
        setParties(data.parties || []);
      } else {
        setError(data.message || "Failed to load parties.");
      }
    } catch {
      setError("Network error loading parties.");
    } finally {
      setLoading(false);
    }
  }, [activeCompany, activeTab, apiFetch]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    } else if (!authLoading && !activeCompany) {
      router.push("/select-company");
    } else if (activeCompany) {
      loadParties();
    }
  }, [user, activeCompany, authLoading, router, loadParties]);

  // Handle Add Party Submit
  const handleAddParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Party name is required.");
      return;
    }

    setFormError(null);
    setFormSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        type,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        gst_number: gstNumber.trim() || undefined,
      };

      const res = await apiFetch("/parties", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        setName("");
        setType("customer");
        setPhone("");
        setAddress("");
        setGstNumber("");
        setShowAddModal(false);
        loadParties();
      } else {
        const errorMsg = Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message || "Failed to create party.";
        setFormError(errorMsg);
      }
    } catch {
      setFormError("Unexpected error creating party.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Open Detail & Summary Modal
  const openDetailModal = async (party: Party) => {
    setSelectedParty(party);
    setShowDetailModal(true);
    setSummaryLoading(true);
    try {
      const res = await apiFetch(`/parties/${party.id}/summary`);
      const data = await res.json();
      if (res.ok) {
        setPartySummary(data.summary);
      } else {
        setPartySummary(null);
      }
    } catch {
      setPartySummary(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (party: Party) => {
    setSelectedParty(party);
    setEditName(party.name);
    setEditType(party.type);
    setEditPhone(party.phone || "");
    setEditAddress(party.address || "");
    setEditGstNumber(party.gst_number || "");
    setEditError(null);
    setShowEditModal(true);
  };

  // Handle Edit Party Submit
  const handleEditParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty) return;

    if (!editName.trim()) {
      setEditError("Party name is required.");
      return;
    }

    setEditError(null);
    setEditSubmitting(true);

    try {
      const payload = {
        name: editName.trim(),
        type: editType,
        phone: editPhone.trim() || undefined,
        address: editAddress.trim() || undefined,
        gst_number: editGstNumber.trim() || undefined,
      };

      const res = await apiFetch(`/parties/${selectedParty.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        setShowEditModal(false);
        if (showDetailModal) {
          openDetailModal(data.party);
        }
        loadParties();
      } else {
        const errorMsg = Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message || "Failed to update party.";
        setEditError(errorMsg);
      }
    } catch {
      setEditError("Network error updating party.");
    } finally {
      setEditSubmitting(false);
    }
  };

  // Search filter
  const filteredParties = parties.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.phone && p.phone.includes(searchTerm)) ||
      (p.gst_number && p.gst_number.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  const totalCount = parties.length;
  const customersCount = parties.filter((p) => p.type === "customer" || p.type === "both").length;
  const vendorsCount = parties.filter((p) => p.type === "vendor" || p.type === "both").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-cyan-500 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-800/80 backdrop-blur-md bg-slate-950/70 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
                TF
              </div>
              <div>
                <span className="font-bold text-sm tracking-tight text-white">Trade Flow</span>
                <p className="text-[11px] text-slate-400">Medicine & Inventory</p>
              </div>
            </Link>

            {/* Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800 text-xs">
              <Link
                href="/"
                className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/inventory"
                className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                📦 Items & Catalog
              </Link>
              <Link
                href="/parties"
                className="px-3 py-1.5 rounded-lg bg-cyan-950/80 text-cyan-300 font-medium border border-cyan-800/60"
              >
                👥 Parties Directory
              </Link>
            </nav>
          </div>

          {/* User & Company Control */}
          <div className="flex items-center gap-3">
            <div className="relative" ref={dropdownRef}>
              <button
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

              {companyDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 backdrop-blur-xl animate-fadeIn">
                  <div className="px-3 py-2 border-b border-slate-800/80 mb-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Switch Active Store
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
                            <div className="font-medium truncate text-white">{comp.name}</div>
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
                      + Manage Stores
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 font-mono">
              <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
              <span>@{user?.username}</span>
            </div>

            <button
              onClick={logout}
              className="px-3 py-1.5 rounded-xl border border-slate-800 text-slate-400 hover:text-rose-400 text-xs font-medium transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-8 w-full flex-1">
        {/* Page Banner & KPIs */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/60 text-xs text-cyan-300 mb-2">
              <span>👥</span>
              <span>Multi-Tenant Customer & Vendor Directory</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Customers & Vendors Directory
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1">
              Active Store: <span className="text-white font-semibold">{activeCompany?.name}</span>
            </p>
          </div>

          {/* Quick KPI stats */}
          <div className="flex items-center gap-3">
            <div className="bg-slate-900/80 border border-slate-800 px-4 py-2.5 rounded-2xl">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block">
                Total Parties
              </span>
              <span className="text-lg font-extrabold text-white font-mono">
                {totalCount}
              </span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 px-4 py-2.5 rounded-2xl">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block">
                Customers
              </span>
              <span className="text-lg font-extrabold text-emerald-400 font-mono">
                {customersCount}
              </span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 px-4 py-2.5 rounded-2xl">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block">
                Vendors
              </span>
              <span className="text-lg font-extrabold text-cyan-300 font-mono">
                {vendorsCount}
              </span>
            </div>

            <button
              id="add-party-btn"
              onClick={() => setShowAddModal(true)}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-xs transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-2 cursor-pointer ml-2"
            >
              <span>+ Add Customer / Vendor</span>
            </button>
          </div>
        </div>

        {/* Filter Tabs & Search Toolbar */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 mb-6 backdrop-blur-sm flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs w-full md:w-auto">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === "all"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              All ({totalCount})
            </button>
            <button
              onClick={() => setActiveTab("customer")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === "customer"
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-800/60 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🛒 Customers ({customersCount})
            </button>
            <button
              onClick={() => setActiveTab("vendor")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === "vendor"
                  ? "bg-cyan-950 text-cyan-300 border border-cyan-800/60 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🏭 Vendors ({vendorsCount})
            </button>
            <button
              onClick={() => setActiveTab("both")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === "both"
                  ? "bg-purple-950 text-purple-300 border border-purple-800/60 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🔄 Both
            </button>
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <div className="relative w-full md:w-72">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, phone, or GSTIN..."
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
              <span className="absolute left-3 top-2.5 text-slate-500 text-xs">🔍</span>
            </div>

            <button
              onClick={loadParties}
              disabled={loading}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white text-xs transition-colors cursor-pointer"
            >
              {loading ? "..." : "🔄 Refresh"}
            </button>
          </div>
        </div>

        {/* Parties List Table */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-sm">
          {loading ? (
            <div className="py-20 text-center text-cyan-400 flex items-center justify-center gap-3">
              <span className="h-5 w-5 border-2 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin" />
              <span className="text-xs font-medium">Loading party records...</span>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-rose-400 text-xs">{error}</div>
          ) : filteredParties.length === 0 ? (
            <div className="py-16 text-center">
              <div className="h-12 w-12 rounded-2xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-xl mx-auto mb-3">
                👥
              </div>
              <h3 className="text-sm font-semibold text-white">No Parties Found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {searchTerm
                  ? "No customers or vendors match your search query."
                  : "Add your first client or supplier to this company."}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20"
                >
                  + Add First Party
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-950/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="py-3.5 px-6">Party / Business Name</th>
                    <th className="py-3.5 px-4">Type</th>
                    <th className="py-3.5 px-4">Contact Phone</th>
                    <th className="py-3.5 px-4">GSTIN</th>
                    <th className="py-3.5 px-4">Address</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {filteredParties.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="py-4 px-6">
                        <div className="font-semibold text-white group-hover:text-cyan-300 transition-colors">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          ID: {p.id.substring(0, 8)}...
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase font-mono border ${
                            p.type === "customer"
                              ? "bg-emerald-950/60 border-emerald-800/80 text-emerald-300"
                              : p.type === "vendor"
                              ? "bg-cyan-950/60 border-cyan-800/80 text-cyan-300"
                              : "bg-purple-950/60 border-purple-800/80 text-purple-300"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              p.type === "customer"
                                ? "bg-emerald-400"
                                : p.type === "vendor"
                                ? "bg-cyan-400"
                                : "bg-purple-400"
                            }`}
                          />
                          {p.type}
                        </span>
                      </td>

                      <td className="py-4 px-4 font-mono text-slate-300">
                        {p.phone ? (
                          <span className="text-slate-300">📞 {p.phone}</span>
                        ) : (
                          <span className="text-slate-600 italic">None</span>
                        )}
                      </td>

                      <td className="py-4 px-4 font-mono text-slate-400">
                        {p.gst_number ? (
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 uppercase">
                            {p.gst_number}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      <td className="py-4 px-4 text-slate-400 max-w-xs truncate">
                        {p.address ? (
                          <span>📍 {p.address}</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-right space-x-2">
                        <button
                          onClick={() => openDetailModal(p)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-medium border border-slate-700 transition-colors cursor-pointer"
                        >
                          📊 Summary
                        </button>
                        <button
                          onClick={() => openEditModal(p)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white text-[11px] font-medium border border-slate-800 transition-colors cursor-pointer"
                        >
                          ✏️ Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Add Party Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-white">Add Customer / Vendor</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Scoped to {activeCompany?.name}
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-sm p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mb-5 p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs">
                ⚠️ {formError}
              </div>
            )}

            <form onSubmit={handleAddParty} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Party / Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. MedPlus Pharmacy or Sharma Distributors"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Party Type *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setType("customer")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      type === "customer"
                        ? "bg-emerald-950/80 border-emerald-600 text-emerald-300 ring-1 ring-emerald-500/50"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    🛒 Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setType("vendor")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      type === "vendor"
                        ? "bg-cyan-950/80 border-cyan-600 text-cyan-300 ring-1 ring-cyan-500/50"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    🏭 Vendor
                  </button>
                  <button
                    type="button"
                    onClick={() => setType("both")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      type === "both"
                        ? "bg-purple-950/80 border-purple-600 text-purple-300 ring-1 ring-purple-500/50"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    🔄 Both
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Contact Phone (8-15 digits)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 9876543210"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  GSTIN / Tax ID (Optional)
                </label>
                <input
                  type="text"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value)}
                  placeholder="e.g. 27ABCDE1234F1Z5"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Address (Optional)
                </label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Plot 42, Pharma Complex, Industrial Area"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting || !name.trim()}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-lg shadow-cyan-600/20 disabled:opacity-50"
                >
                  {formSubmitting ? "Saving..." : "Add Party"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Party Detail & Summary Modal */}
      {showDetailModal && selectedParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
              <div>
                <span
                  className={`text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full border font-semibold ${
                    selectedParty.type === "customer"
                      ? "bg-emerald-950/60 border-emerald-800/80 text-emerald-300"
                      : selectedParty.type === "vendor"
                      ? "bg-cyan-950/60 border-cyan-800/80 text-cyan-300"
                      : "bg-purple-950/60 border-purple-800/80 text-purple-300"
                  }`}
                >
                  {selectedParty.type}
                </span>
                <h3 className="text-xl font-bold text-white mt-1.5">{selectedParty.name}</h3>
                <p className="text-xs text-slate-400 font-mono">ID: {selectedParty.id}</p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-white text-sm p-1.5 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Summary Statistics */}
            {summaryLoading ? (
              <div className="py-8 text-center text-cyan-400 text-xs">
                Computing invoice aggregates...
              </div>
            ) : partySummary ? (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                      Sales Invoices
                    </span>
                    <span className="text-base font-bold text-emerald-400 font-mono">
                      {partySummary.sales_invoices_count}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      ₹{partySummary.total_sales_amount.toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                      Purchase Invoices
                    </span>
                    <span className="text-base font-bold text-cyan-300 font-mono">
                      {partySummary.purchase_invoices_count}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      ₹{partySummary.total_purchase_amount.toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 col-span-2 sm:col-span-1">
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                      Outstanding
                    </span>
                    <span className="text-base font-bold text-slate-300 font-mono">
                      ₹{partySummary.outstanding_balance.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Balance Due
                    </span>
                  </div>
                </div>

                {/* Contact Information */}
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-900">
                    <span className="text-slate-500">Phone:</span>
                    <span className="font-mono text-slate-200">
                      {selectedParty.phone || "None"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-900">
                    <span className="text-slate-500">GSTIN:</span>
                    <span className="font-mono text-slate-200 uppercase">
                      {selectedParty.gst_number || "Unregistered"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-900">
                    <span className="text-slate-500">Address:</span>
                    <span className="text-slate-200 text-right max-w-xs">
                      {selectedParty.address || "None"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Created:</span>
                    <span className="font-mono text-slate-400">
                      {new Date(selectedParty.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setShowDetailModal(false);
                      openEditModal(selectedParty);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
                  >
                    ✏️ Edit Details
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Edit Party Modal */}
      {showEditModal && selectedParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-white">Edit Party</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Type cannot be changed if invoices are linked
                </p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white text-sm p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="mb-5 p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs">
                ⚠️ {editError}
              </div>
            )}

            <form onSubmit={handleEditParty} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Party / Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Party Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditType("customer")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      editType === "customer"
                        ? "bg-emerald-950/80 border-emerald-600 text-emerald-300 ring-1 ring-emerald-500/50"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    🛒 Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditType("vendor")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      editType === "vendor"
                        ? "bg-cyan-950/80 border-cyan-600 text-cyan-300 ring-1 ring-cyan-500/50"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    🏭 Vendor
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditType("both")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      editType === "both"
                        ? "bg-purple-950/80 border-purple-600 text-purple-300 ring-1 ring-purple-500/50"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    🔄 Both
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  GSTIN / Tax ID
                </label>
                <input
                  type="text"
                  value={editGstNumber}
                  onChange={(e) => setEditGstNumber(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Address
                </label>
                <textarea
                  rows={2}
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting || !editName.trim()}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-lg shadow-cyan-600/20 disabled:opacity-50"
                >
                  {editSubmitting ? "Updating..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-600">
        Trade Flow Parties Management &bull; Phase 4 Active
      </footer>
    </div>
  );
}
