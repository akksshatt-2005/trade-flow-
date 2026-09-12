"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import AppLayout from "../../components/AppLayout";

export interface Party {
  id: string;
  company_id: string;
  name: string;
  type: "customer" | "vendor" | "both";
  phone?: string | null;
  address?: string | null;
  state?: string | null;
  gst_number?: string | null;
  is_system_account?: boolean;
  created_at: string;
}

export interface PartySummaryData {
  party: Party;
  sales_invoices_count: number;
  purchase_invoices_count: number;
  total_sales_amount: number;
  total_purchase_amount: number;
  outstanding_balance: number;
}

export default function PartiesPage() {
  const { user, token, activeCompany, loading: authLoading, apiFetch } = useAuth();
  const router = useRouter();

  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "customer" | "vendor">("all");

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSummaryDrawer, setShowSummaryDrawer] = useState(false);

  // Selected party for edit / summary
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [summaryData, setSummaryData] = useState<PartySummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Form states - Add Party
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"customer" | "vendor" | "both">("customer");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newState, setNewState] = useState("Maharashtra");
  const [newGst, setNewGst] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Form states - Edit Party
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"customer" | "vendor" | "both">("customer");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editState, setEditState] = useState("");
  const [editGst, setEditGst] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // 1. Fetch Parties
  const fetchParties = useCallback(async () => {
    if (!token || !activeCompany?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/parties");
      if (res.ok) {
        const data = await res.json();
        setParties(data.parties || []);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Failed to load parties.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect to backend server.");
    } finally {
      setLoading(false);
    }
  }, [token, activeCompany?.id, apiFetch]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (activeCompany?.id) {
      fetchParties();
    }
  }, [authLoading, user, activeCompany?.id, fetchParties, router]);

  // 2. Add Party
  const handleAddParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setAddError("Party name is required.");
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await apiFetch("/parties", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          type: newType,
          phone: newPhone.trim() || undefined,
          address: newAddress.trim() || undefined,
          state: newState.trim() || undefined,
          gst_number: newGst.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowAddModal(false);
        setNewName("");
        setNewPhone("");
        setNewAddress("");
        setNewGst("");
        fetchParties();
      } else {
        setAddError(data.message || "Failed to add party.");
      }
    } catch (err: any) {
      setAddError(err.message || "Network error adding party.");
    } finally {
      setAddLoading(false);
    }
  };

  // 3. View Summary Drawer
  const handleViewSummary = async (party: Party) => {
    setSelectedParty(party);
    setShowSummaryDrawer(true);
    setSummaryLoading(true);
    try {
      const res = await apiFetch(`/parties/${party.id}/summary`);
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data.summary);
      }
    } catch {
      // Ignore
    } finally {
      setSummaryLoading(false);
    }
  };

  // 4. Open Edit Modal
  const handleOpenEdit = (party: Party) => {
    setSelectedParty(party);
    setEditName(party.name);
    setEditType(party.type);
    setEditPhone(party.phone || "");
    setEditAddress(party.address || "");
    setEditState(party.state || "");
    setEditGst(party.gst_number || "");
    setShowEditModal(true);
  };

  const handleEditParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await apiFetch(`/parties/${selectedParty.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          type: editType,
          phone: editPhone.trim() || undefined,
          address: editAddress.trim() || undefined,
          state: editState.trim() || undefined,
          gst_number: editGst.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowEditModal(false);
        setSelectedParty(null);
        fetchParties();
      } else {
        setEditError(data.message || "Failed to update party.");
      }
    } catch (err: any) {
      setEditError(err.message || "Network error updating party.");
    } finally {
      setEditLoading(false);
    }
  };

  // Filter parties by search term and type tab
  const filteredParties = parties.filter((party) => {
    const matchesSearch =
      searchTerm.trim() === "" ||
      party.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (party.phone && party.phone.includes(searchTerm)) ||
      (party.gst_number && party.gst_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (party.state && party.state.toLowerCase().includes(searchTerm.toLowerCase()));

    if (filterType === "customer") {
      return matchesSearch && (party.type === "customer" || party.type === "both");
    }
    if (filterType === "vendor") {
      return matchesSearch && (party.type === "vendor" || party.type === "both");
    }
    return matchesSearch;
  });

  const customerCount = parties.filter((p) => p.type === "customer" || p.type === "both").length;
  const vendorCount = parties.filter((p) => p.type === "vendor" || p.type === "both").length;

  return (
    <AppLayout
      pageTitle="Parties Directory"
      pageSubtitle={`Customers and Vendor suppliers for ${activeCompany?.name || "your shop"}`}
      headerActions={
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          <span>+ Add Customer / Vendor</span>
        </button>
      }
    >
      <div className="space-y-4 max-w-7xl mx-auto">
        {/* Search & Type Filter Tabs */}
        <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="Search by Party Name, Phone, State, or GSTIN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
              />
              <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Type Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setFilterType("all")}
              className={`px-3 py-1 rounded font-semibold transition-colors cursor-pointer ${
                filterType === "all"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All ({parties.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("customer")}
              className={`px-3 py-1 rounded font-semibold transition-colors cursor-pointer ${
                filterType === "customer"
                  ? "bg-white text-blue-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Customers ({customerCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("vendor")}
              className={`px-3 py-1 rounded font-semibold transition-colors cursor-pointer ${
                filterType === "vendor"
                  ? "bg-white text-blue-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Vendors ({vendorCount})
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-xs font-medium">
            {error}
          </div>
        )}

        {/* Dense Parties Table */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="overflow-x-auto min-h-[350px]">
            {loading ? (
              <div className="p-12 text-center text-xs text-slate-500">
                <div className="inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                <div>Loading directory...</div>
              </div>
            ) : filteredParties.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">
                {searchTerm
                  ? "No parties match your search query."
                  : "No customer or vendor records found. Click '+ Add Customer / Vendor' above."}
              </div>
            ) : (
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Party Name</th>
                    <th>Type</th>
                    <th>Phone</th>
                    <th>Operating State</th>
                    <th>GSTIN</th>
                    <th>Address</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParties.map((party) => {
                    const isSystem = Boolean(party.is_system_account) || party.name.toLowerCase() === "cash";
                    return (
                      <tr key={party.id}>
                        <td className="font-bold text-slate-900 max-w-xs truncate flex items-center gap-2">
                          <span>{party.name}</span>
                          {isSystem && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700 text-[10px] font-bold uppercase tracking-wider">
                              System Cash
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              party.type === "customer"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : party.type === "vendor"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : "bg-purple-50 text-purple-700 border border-purple-200"
                            }`}
                          >
                            {party.type}
                          </span>
                        </td>
                        <td className="font-mono text-slate-700">{party.phone || "—"}</td>
                        <td className="text-slate-800 font-medium capitalize">
                          {party.state || "Maharashtra"}
                        </td>
                        <td className="font-mono text-slate-500">{party.gst_number || "—"}</td>
                        <td className="text-slate-500 max-w-xs truncate">
                          {party.address || "—"}
                        </td>
                        <td className="text-right whitespace-nowrap space-x-2">
                          <button
                            type="button"
                            onClick={() => handleViewSummary(party)}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                          >
                            Summary
                          </button>
                          {!isSystem && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(party)}
                              className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Add Party Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Add New Customer / Vendor
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAddParty} className="p-5 space-y-4">
              {addError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {addError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Party / Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. City Care Hospital or Cipla Distribution"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Party Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 bg-white"
                  >
                    <option value="customer">Customer (Sales Outward)</option>
                    <option value="vendor">Vendor / Supplier (Purchase Inward)</option>
                    <option value="both">Both (Customer & Vendor)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. +91 9876543210"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Operating State (for GST)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Maharashtra or Delhi"
                    value={newState}
                    onChange={(e) => setNewState(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GSTIN Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 27AABCS1234F1Z1"
                    value={newGst}
                    onChange={(e) => setNewGst(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono uppercase focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Billing Address
                </label>
                <textarea
                  rows={2}
                  placeholder="Street, locality, city, pincode"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-2xs transition-colors"
                >
                  {addLoading ? "Saving..." : "Save Party"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Party Modal */}
      {showEditModal && selectedParty && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Edit Party Details
              </h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedParty(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleEditParty} className="p-5 space-y-4">
              {editError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {editError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Party Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Party Type
                  </label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 bg-white"
                  >
                    <option value="customer">Customer</option>
                    <option value="vendor">Vendor</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Operating State
                  </label>
                  <input
                    type="text"
                    value={editState}
                    onChange={(e) => setEditState(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GSTIN Number
                  </label>
                  <input
                    type="text"
                    value={editGst}
                    onChange={(e) => setEditGst(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono uppercase focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Billing Address
                </label>
                <textarea
                  rows={2}
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedParty(null);
                  }}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-2xs transition-colors"
                >
                  {editLoading ? "Updating..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Party Financial Summary Drawer */}
      {showSummaryDrawer && selectedParty && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Party Account Summary
                </h3>
                <p className="text-[11px] text-slate-500">
                  {selectedParty.name} &bull; <span className="capitalize">{selectedParty.type}</span>
                </p>
              </div>
              <button
                onClick={() => {
                  setShowSummaryDrawer(false);
                  setSelectedParty(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-5 space-y-4">
              {summaryLoading ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Calculating account metrics...
                </div>
              ) : summaryData ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded p-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Sales Invoices
                      </span>
                      <span className="text-lg font-bold text-slate-900">
                        {summaryData.sales_invoices_count}
                      </span>
                      <div className="text-[11px] text-emerald-700 font-semibold mt-1">
                        Total ₹{Number(summaryData.total_sales_amount).toFixed(2)}
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded p-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Purchase Bills
                      </span>
                      <span className="text-lg font-bold text-slate-900">
                        {summaryData.purchase_invoices_count}
                      </span>
                      <div className="text-[11px] text-blue-700 font-semibold mt-1">
                        Total ₹{Number(summaryData.total_purchase_amount).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider block">
                        Outstanding Balance
                      </span>
                      <span className="text-xs text-blue-700 font-medium">
                        Current ledger balance
                      </span>
                    </div>
                    <span className="text-base font-bold text-blue-950 font-mono">
                      ₹{Number(summaryData.outstanding_balance).toFixed(2)}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 space-y-1 pt-2 border-t border-slate-200">
                    <div><strong>Phone:</strong> {selectedParty.phone || "Not provided"}</div>
                    <div><strong>GSTIN:</strong> {selectedParty.gst_number || "Unregistered"}</div>
                    <div><strong>State:</strong> {selectedParty.state || "Maharashtra"}</div>
                    <div><strong>Address:</strong> {selectedParty.address || "Not provided"}</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 text-center py-4">
                  Unable to load summary data.
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowSummaryDrawer(false);
                  setSelectedParty(null);
                }}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold"
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
