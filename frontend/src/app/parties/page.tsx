"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import AppLayout from "../../components/AppLayout";
import { Party, getDrugLicenseStatus } from "@/lib/party-utils";

export type { Party };

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
  const [filterComplianceAlertsOnly, setFilterComplianceAlertsOnly] = useState(false);

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
  const [newEmail, setNewEmail] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("Maharashtra");
  const [newPincode, setNewPincode] = useState("");
  const [newGst, setNewGst] = useState("");
  const [newPan, setNewPan] = useState("");
  const [newDlNumber, setNewDlNumber] = useState("");
  const [newDlExpiry, setNewDlExpiry] = useState("");
  const [newOpeningBalance, setNewOpeningBalance] = useState<string>("0");
  const [newOpeningBalanceType, setNewOpeningBalanceType] = useState<"dr" | "cr">("cr");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Form states - Edit Party
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"customer" | "vendor" | "both">("customer");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");
  const [editPincode, setEditPincode] = useState("");
  const [editGst, setEditGst] = useState("");
  const [editPan, setEditPan] = useState("");
  const [editDlNumber, setEditDlNumber] = useState("");
  const [editDlExpiry, setEditDlExpiry] = useState("");
  const [editOpeningBalance, setEditOpeningBalance] = useState<string>("0");
  const [editOpeningBalanceType, setEditOpeningBalanceType] = useState<"dr" | "cr">("cr");
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
          email: newEmail.trim() || undefined,
          address: newAddress.trim() || undefined,
          city: newCity.trim() || undefined,
          state: newState.trim() || undefined,
          pincode: newPincode.trim() || undefined,
          gst_number: newGst.trim() || undefined,
          pan: newPan.trim() || undefined,
          drug_license_number: newDlNumber.trim() || undefined,
          drug_license_expiry: newDlExpiry.trim() || undefined,
          opening_balance: Number(newOpeningBalance) || 0,
          opening_balance_type: newOpeningBalanceType,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowAddModal(false);
        setNewName("");
        setNewPhone("");
        setNewEmail("");
        setNewAddress("");
        setNewCity("");
        setNewPincode("");
        setNewGst("");
        setNewPan("");
        setNewDlNumber("");
        setNewDlExpiry("");
        setNewOpeningBalance("0");
        setNewOpeningBalanceType("cr");
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
    } catch (err: any) {
      console.error("Failed to load party summary", err);
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
    setEditEmail(party.email || "");
    setEditAddress(party.address || "");
    setEditCity(party.city || "");
    setEditState(party.state || "Maharashtra");
    setEditPincode(party.pincode || "");
    setEditGst(party.gst_number || "");
    setEditPan(party.pan || "");
    setEditDlNumber(party.drug_license_number || "");
    setEditDlExpiry(party.drug_license_expiry || "");
    setEditOpeningBalance(String(party.opening_balance ?? 0));
    setEditOpeningBalanceType(party.opening_balance_type === "dr" ? "dr" : "cr");
    setEditError(null);
    setShowEditModal(true);
  };

  // 5. Submit Edit
  const handleEditParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty) return;
    if (!editName.trim()) {
      setEditError("Party name is required.");
      return;
    }
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await apiFetch(`/parties/${selectedParty.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          type: editType,
          phone: editPhone.trim() || undefined,
          email: editEmail.trim() || undefined,
          address: editAddress.trim() || undefined,
          city: editCity.trim() || undefined,
          state: editState.trim() || undefined,
          pincode: editPincode.trim() || undefined,
          gst_number: editGst.trim() || undefined,
          pan: editPan.trim() || undefined,
          drug_license_number: editDlNumber.trim() || undefined,
          drug_license_expiry: editDlExpiry.trim() || undefined,
          opening_balance: Number(editOpeningBalance) || 0,
          opening_balance_type: editOpeningBalanceType,
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

  // Filter parties based on search and filters
  const filteredParties = parties.filter((party) => {
    const matchesSearch =
      searchTerm.trim() === "" ||
      party.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (party.phone && party.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (party.email && party.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (party.city && party.city.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (party.state && party.state.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (party.gst_number && party.gst_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (party.pan && party.pan.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (party.drug_license_number && party.drug_license_number.toLowerCase().includes(searchTerm.toLowerCase()));

    let matchesType = true;
    if (filterType === "customer") {
      matchesType = party.type === "customer" || party.type === "both";
    } else if (filterType === "vendor") {
      matchesType = party.type === "vendor" || party.type === "both";
    }

    if (filterComplianceAlertsOnly) {
      const dlStatus = getDrugLicenseStatus(party.drug_license_expiry);
      const hasComplianceAlert = dlStatus.status === "expiring_soon" || dlStatus.status === "expired";
      return matchesSearch && matchesType && hasComplianceAlert;
    }

    return matchesSearch && matchesType;
  });

  const customerCount = parties.filter((p) => p.type === "customer" || p.type === "both").length;
  const vendorCount = parties.filter((p) => p.type === "vendor" || p.type === "both").length;
  const complianceAlertCount = parties.filter((p) => {
    const s = getDrugLicenseStatus(p.drug_license_expiry);
    return s.status === "expiring_soon" || s.status === "expired";
  }).length;

  return (
    <AppLayout
      pageTitle="Parties Directory"
      pageSubtitle={`Customers, Vendor suppliers, and pharma compliance licenses for ${activeCompany?.name || "your shop"}`}
      headerActions={
        <div className="flex items-center gap-2">
          <Link
            href="/import?type=parties"
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>Bulk Import (.xlsx / .csv)</span>
          </Link>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span>+ Add Customer / Vendor</span>
          </button>
        </div>
      }
    >
      <div className="space-y-4 max-w-7xl mx-auto">
        {/* Search & Type Filter Tabs */}
        <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="Search by Party Name, Phone, Email, GSTIN, PAN, DL No..."
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

          {/* Type Filter Tabs & Compliance Alert Toggle */}
          <div className="flex items-center gap-2">
            {complianceAlertCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterComplianceAlertsOnly(!filterComplianceAlertsOnly)}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                  filterComplianceAlertsOnly
                    ? "bg-amber-500 text-white border-amber-600 shadow-xs"
                    : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                }`}
              >
                <svg className="w-3.5 h-3.5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>License Alerts ({complianceAlertCount})</span>
              </button>
            )}

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
                {searchTerm || filterComplianceAlertsOnly
                  ? "No parties match your search or filter criteria."
                  : "No customer or vendor records found. Click '+ Add Customer / Vendor' above."}
              </div>
            ) : (
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Party Name</th>
                    <th>Type</th>
                    <th>Contact</th>
                    <th>GSTIN / PAN</th>
                    <th>Drug License (Pharma)</th>
                    <th>Location</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParties.map((party) => {
                    const isSystem = Boolean(party.is_system_account) || party.name.toLowerCase() === "cash";
                    const dlStatus = getDrugLicenseStatus(party.drug_license_expiry);

                    return (
                      <tr key={party.id} className={dlStatus.status === "expired" ? "bg-red-50/20" : ""}>
                        <td className="font-bold text-slate-900 max-w-xs truncate">
                          <div className="flex items-center gap-2">
                            <span>{party.name}</span>
                            {isSystem && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 border border-slate-300 text-slate-700 text-[9px] font-bold uppercase tracking-wider">
                                System Cash
                              </span>
                            )}
                          </div>
                          {party.opening_balance ? (
                            <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                              Op. Bal: ₹{Number(party.opening_balance).toFixed(2)}{" "}
                              <span className="uppercase font-semibold">{party.opening_balance_type || "cr"}</span>
                            </div>
                          ) : null}
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
                        <td className="text-xs">
                          <div className="font-mono text-slate-700">{party.phone || "—"}</div>
                          {party.email && <div className="text-[11px] text-slate-400 truncate max-w-[150px]">{party.email}</div>}
                        </td>
                        <td className="font-mono text-xs">
                          <div className="text-slate-700 font-semibold">{party.gst_number || <span className="text-slate-400 font-normal">No GSTIN</span>}</div>
                          {party.pan && <div className="text-[10px] text-slate-400">PAN: {party.pan}</div>}
                        </td>
                        <td>
                          {party.drug_license_number ? (
                            <div>
                              <div className="font-mono text-xs text-slate-900 font-semibold">
                                {party.drug_license_number}
                              </div>
                              {party.drug_license_expiry && (
                                <div className="mt-1 flex items-center gap-1">
                                  {dlStatus.status === "expired" ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                                      <span>⚠️ License expired</span>
                                      <span className="font-normal font-mono">({party.drug_license_expiry})</span>
                                    </span>
                                  ) : dlStatus.status === "expiring_soon" ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                                      <span>⚠️ Expiring soon</span>
                                      <span className="font-normal font-mono">({dlStatus.daysRemaining}d left)</span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      Exp: {party.drug_license_expiry}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="text-xs text-slate-600 max-w-xs truncate">
                          <div className="font-semibold text-slate-800">
                            {party.city ? `${party.city}, ` : ""}{party.state || "Maharashtra"}{party.pincode ? ` - ${party.pincode}` : ""}
                          </div>
                          {party.address && <div className="text-[11px] text-slate-400 truncate">{party.address}</div>}
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
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Add New Customer / Vendor
                </h3>
                <p className="text-[11px] text-slate-500">
                  Register party directory contact with pharma compliance details
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAddParty} className="p-5 space-y-4 overflow-y-auto">
              {addError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {addError}
                </div>
              )}

              {/* SECTION 1: Core Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Party / Business Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Pharma Distributors or City Chemist"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Party Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 bg-white font-medium"
                  >
                    <option value="customer">Customer (Buyer)</option>
                    <option value="vendor">Vendor (Supplier)</option>
                    <option value="both">Both (Buyer & Supplier)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone / Mobile Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. +91 9876543210"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. billing@apexpharma.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
              </div>

              {/* SECTION 2: Address Details */}
              <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg space-y-3">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Location & Address
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Premises / Street Address
                  </label>
                  <input
                    type="text"
                    placeholder="Shop/Office number, building name, road"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Mumbai"
                      value={newCity}
                      onChange={(e) => setNewCity(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Operating State
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Maharashtra"
                      value={newState}
                      onChange={(e) => setNewState(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      PIN Code (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 400001"
                      value={newPincode}
                      onChange={(e) => setNewPincode(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: Tax & Pharma Compliance (Grouped together) */}
              <div className="p-3 bg-blue-50/40 border border-blue-200 rounded-lg space-y-3">
                <div className="text-[11px] font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span>Tax & Pharma Compliance Identifiers</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      GSTIN Number (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 27AABCS1234F1Z1"
                      value={newGst}
                      onChange={(e) => setNewGst(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono uppercase bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      PAN Number (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. AABCS1234F"
                      value={newPan}
                      onChange={(e) => setNewPan(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono uppercase bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-blue-100">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Drug License Number (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 20B/21B-MH-12345"
                      value={newDlNumber}
                      onChange={(e) => setNewDlNumber(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Drug License Expiry Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={newDlExpiry}
                      onChange={(e) => setNewDlExpiry(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: Opening Balance */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Opening Balance (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={newOpeningBalance}
                    onChange={(e) => setNewOpeningBalance(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Balance Type
                  </label>
                  <select
                    value={newOpeningBalanceType}
                    onChange={(e) => setNewOpeningBalanceType(e.target.value as "dr" | "cr")}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 bg-white"
                  >
                    <option value="cr">Cr (Payable to Vendor)</option>
                    <option value="dr">Dr (Receivable from Customer)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
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
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Edit Party Details
                </h3>
                <p className="text-[11px] text-slate-500">
                  {selectedParty.name} &bull; <span className="capitalize">{selectedParty.type}</span>
                </p>
              </div>
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
            <form onSubmit={handleEditParty} className="p-5 space-y-4 overflow-y-auto">
              {editError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {editError}
                </div>
              )}

              {/* SECTION 1: Core Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
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
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Party Type
                  </label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 bg-white font-medium"
                  >
                    <option value="customer">Customer</option>
                    <option value="vendor">Vendor</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
              </div>

              {/* SECTION 2: Address Details */}
              <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg space-y-3">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Location & Address
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Premises / Street Address
                  </label>
                  <input
                    type="text"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={editCity}
                      onChange={(e) => setEditCity(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Operating State
                    </label>
                    <input
                      type="text"
                      value={editState}
                      onChange={(e) => setEditState(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      PIN Code
                    </label>
                    <input
                      type="text"
                      value={editPincode}
                      onChange={(e) => setEditPincode(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: Tax & Pharma Compliance */}
              <div className="p-3 bg-blue-50/40 border border-blue-200 rounded-lg space-y-3">
                <div className="text-[11px] font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span>Tax & Pharma Compliance Identifiers</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      GSTIN Number
                    </label>
                    <input
                      type="text"
                      value={editGst}
                      onChange={(e) => setEditGst(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono uppercase bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      PAN Number
                    </label>
                    <input
                      type="text"
                      value={editPan}
                      onChange={(e) => setEditPan(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono uppercase bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-blue-100">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Drug License Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 20B/21B-MH-12345"
                      value={editDlNumber}
                      onChange={(e) => setEditDlNumber(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Drug License Expiry Date
                    </label>
                    <input
                      type="date"
                      value={editDlExpiry}
                      onChange={(e) => setEditDlExpiry(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: Opening Balance */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Opening Balance (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editOpeningBalance}
                    onChange={(e) => setEditOpeningBalance(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Balance Type
                  </label>
                  <select
                    value={editOpeningBalanceType}
                    onChange={(e) => setEditOpeningBalanceType(e.target.value as "dr" | "cr")}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 bg-white"
                  >
                    <option value="cr">Cr (Payable to Vendor)</option>
                    <option value="dr">Dr (Receivable from Customer)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedParty(null);
                  }}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  {editLoading ? "Updating..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Party Financial Summary & Details Drawer */}
      {showSummaryDrawer && selectedParty && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Party Account & Compliance Profile
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

            <div className="p-5 space-y-4 overflow-y-auto">
              {summaryLoading ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  <div className="inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                  <div>Calculating account metrics...</div>
                </div>
              ) : summaryData ? (
                <div className="space-y-4">
                  {/* Pharma Compliance Badge Banner */}
                  {selectedParty.drug_license_number && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-900">
                          Drug License: {selectedParty.drug_license_number}
                        </span>
                        {(() => {
                          const s = getDrugLicenseStatus(selectedParty.drug_license_expiry);
                          if (s.status === "expired") {
                            return (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                                ⚠️ License Expired ({selectedParty.drug_license_expiry})
                              </span>
                            );
                          }
                          if (s.status === "expiring_soon") {
                            return (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                ⚠️ Expiring in {s.daysRemaining} days
                              </span>
                            );
                          }
                          if (selectedParty.drug_license_expiry) {
                            return (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                Valid until {selectedParty.drug_license_expiry}
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Invoice Metrics */}
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

                  <div className="bg-slate-50 border border-slate-200 rounded p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Opening Balance
                      </span>
                      <span className="text-xs text-slate-600">
                        Initial onboarding ledger balance
                      </span>
                    </div>
                    <span className="text-sm font-bold text-slate-900 font-mono">
                      ₹{Number(selectedParty.opening_balance || 0).toFixed(2)}{" "}
                      <span className="uppercase text-[11px] text-slate-500 font-bold">
                        {selectedParty.opening_balance_type || "cr"}
                      </span>
                    </span>
                  </div>

                  {/* Detailed Information Grid */}
                  <div className="text-xs text-slate-600 space-y-2 pt-3 border-t border-slate-200">
                    <div className="grid grid-cols-2 gap-2">
                      <div><strong className="text-slate-900">Phone:</strong> {selectedParty.phone || "—"}</div>
                      <div><strong className="text-slate-900">Email:</strong> {selectedParty.email || "—"}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><strong className="text-slate-900">GSTIN:</strong> {selectedParty.gst_number || "Unregistered"}</div>
                      <div><strong className="text-slate-900">PAN:</strong> {selectedParty.pan || "—"}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><strong className="text-slate-900">City:</strong> {selectedParty.city || "—"}</div>
                      <div><strong className="text-slate-900">State:</strong> {selectedParty.state || "Maharashtra"}</div>
                    </div>
                    {selectedParty.pincode && (
                      <div><strong className="text-slate-900">PIN Code:</strong> {selectedParty.pincode}</div>
                    )}
                    {selectedParty.address && (
                      <div><strong className="text-slate-900">Address:</strong> {selectedParty.address}</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 text-center py-4">
                  Unable to load summary data.
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowSummaryDrawer(false);
                  handleOpenEdit(selectedParty);
                }}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
              >
                Edit Details &rarr;
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSummaryDrawer(false);
                  setSelectedParty(null);
                }}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
