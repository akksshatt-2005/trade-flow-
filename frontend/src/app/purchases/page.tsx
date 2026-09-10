"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";

export interface PurchaseInvoice {
  id: string;
  company_id: string;
  party_id: string;
  party?: { id: string; name: string; phone?: string | null; gst_number?: string | null };
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  gst_amount: number;
  status: "draft" | "confirmed" | "cancelled";
  lines?: any[];
  created_at: string;
}

export default function PurchasesPage() {
  const {
    user,
    companies,
    activeCompany,
    selectCompany,
    loading: authLoading,
    logout,
    apiFetch,
  } = useAuth();

  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Form State
  const [vendorId, setVendorId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [lines, setLines] = useState<
    Array<{ item_id: string; quantity: string; rate: string; gst_rate: string }>
  >([{ item_id: "", quantity: "1", rate: "100", gst_rate: "12" }]);

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Header dropdown state
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setCompanyDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadData = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    setError(null);
    try {
      const [invRes, vendRes, itemsRes] = await Promise.all([
        apiFetch("/purchases"),
        apiFetch("/parties?type=vendor"),
        apiFetch("/items"),
      ]);

      const [invData, vendData, itemsData] = await Promise.all([
        invRes.json(),
        vendRes.json(),
        itemsRes.json(),
      ]);

      if (invRes.ok) setInvoices(invData.invoices || []);
      if (vendRes.ok) setVendors(vendData.parties || []);
      if (itemsRes.ok) setItems(itemsData.items || []);
    } catch {
      setError("Failed to load purchase invoices.");
    } finally {
      setLoading(false);
    }
  }, [activeCompany, apiFetch]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    } else if (!authLoading && !activeCompany) {
      router.push("/select-company");
    } else if (activeCompany) {
      loadData();
    }
  }, [user, activeCompany, authLoading, router, loadData]);

  // Line calculations
  const addLine = () => {
    setLines([...lines, { item_id: "", quantity: "1", rate: "100", gst_rate: "12" }]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 1) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const updateLine = (index: number, field: string, value: string) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "item_id") {
      const foundItem = items.find((it) => it.id === value);
      if (foundItem) {
        updated[index].gst_rate = String(foundItem.gst_rate ?? 12);
      }
    }
    setLines(updated);
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let totalTax = 0;
    for (const l of lines) {
      const q = Number(l.quantity) || 0;
      const r = Number(l.rate) || 0;
      const g = Number(l.gst_rate) || 0;
      const tax = q * r * (g / 100);
      subtotal += q * r;
      totalTax += tax;
    }
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(totalTax * 100) / 100,
      total: Math.round((subtotal + totalTax) * 100) / 100,
    };
  };

  const totals = calculateTotals();

  // Create Purchase Submit
  const handleCreatePurchase = async (e: React.FormEvent, autoConfirm: boolean = false) => {
    e.preventDefault();
    if (!vendorId) {
      setFormError("Please select a vendor.");
      return;
    }
    if (!invoiceNumber.trim()) {
      setFormError("Invoice number is required.");
      return;
    }
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].item_id) {
        setFormError(`Please select an item on line #${i + 1}`);
        return;
      }
    }

    setFormError(null);
    setFormSubmitting(true);

    try {
      const payload = {
        party_id: vendorId,
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate,
        lines: lines.map((l) => ({
          item_id: l.item_id,
          quantity: Number(l.quantity),
          rate: Number(l.rate),
          gst_rate: Number(l.gst_rate),
        })),
      };

      const res = await apiFetch("/purchases", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message || "Failed to create invoice.";
        setFormError(errorMsg);
        setFormSubmitting(false);
        return;
      }

      if (autoConfirm && data.invoice?.id) {
        await apiFetch(`/purchases/${data.invoice.id}/confirm`, { method: "POST" });
      }

      setShowAddModal(false);
      setInvoiceNumber("");
      setLines([{ item_id: "", quantity: "1", rate: "100", gst_rate: "12" }]);
      loadData();
    } catch {
      setFormError("Unexpected network error creating purchase invoice.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Open Invoice Detail
  const openInvoiceDetail = async (inv: PurchaseInvoice) => {
    setSelectedInvoice(inv);
    setShowDetailModal(true);
    setDetailLoading(true);
    try {
      const res = await apiFetch(`/purchases/${inv.id}`);
      const data = await res.json();
      if (res.ok) setSelectedInvoice(data.invoice);
    } finally {
      setDetailLoading(false);
    }
  };

  // Confirm Invoice Action
  const handleConfirm = async (id: string) => {
    setActionLoading(true);
    try {
      const res = await apiFetch(`/purchases/${id}/confirm`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setShowDetailModal(false);
        loadData();
      } else {
        alert(data.message || "Failed to confirm invoice.");
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel Invoice Action
  const handleCancel = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this draft purchase invoice?")) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/purchases/${id}/cancel`, { method: "POST" });
      if (res.ok) {
        setShowDetailModal(false);
        loadData();
      }
    } finally {
      setActionLoading(false);
    }
  };

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
                📦 Items
              </Link>
              <Link
                href="/parties"
                className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                👥 Parties
              </Link>
              <Link
                href="/sales"
                className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                🧾 Sales Billing
              </Link>
              <Link
                href="/purchases"
                className="px-3 py-1.5 rounded-lg bg-cyan-950/80 text-cyan-300 font-medium border border-cyan-800/60"
              >
                📥 Purchases
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs text-slate-200"
              >
                <span>🏢</span>
                <span className="font-medium max-w-[140px] truncate">{activeCompany?.name}</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                  {activeCompany?.role}
                </span>
              </button>
            </div>
            <button
              onClick={logout}
              className="px-3 py-1.5 rounded-xl border border-slate-800 text-slate-400 hover:text-rose-400 text-xs font-medium cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 w-full flex-1">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/60 text-xs text-cyan-300 mb-2">
              <span>📥</span>
              <span>Inward Vendor Invoices & Stock Receipts</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Purchase Invoices
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Store: <span className="text-white font-semibold">{activeCompany?.name}</span>
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-xs transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-2 cursor-pointer self-start sm:self-auto"
          >
            <span>+ New Purchase Invoice</span>
          </button>
        </div>

        {/* Invoice List Table */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-sm">
          {loading ? (
            <div className="py-20 text-center text-cyan-400 text-xs">
              Loading purchase bills...
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-16 text-center">
              <div className="h-12 w-12 rounded-2xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-xl mx-auto mb-3">
                📥
              </div>
              <h3 className="text-sm font-semibold text-white">No Purchase Invoices Yet</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Record purchases from pharmaceutical distributors to increase stock inventory.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-4 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
              >
                + Create First Purchase
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-950/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="py-3.5 px-6">Invoice #</th>
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4">Supplier / Vendor</th>
                    <th className="py-3.5 px-4">GST Tax</th>
                    <th className="py-3.5 px-4">Total Amount</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-4 px-6 font-mono font-bold text-white">
                        {inv.invoice_number}
                      </td>
                      <td className="py-4 px-4 font-mono text-slate-400">{inv.invoice_date}</td>
                      <td className="py-4 px-4 font-medium text-slate-200">
                        {inv.party?.name || "Unknown Vendor"}
                      </td>
                      <td className="py-4 px-4 font-mono text-slate-400">
                        ₹{inv.gst_amount.toFixed(2)}
                      </td>
                      <td className="py-4 px-4 font-mono font-bold text-cyan-300">
                        ₹{inv.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase font-mono border ${
                            inv.status === "confirmed"
                              ? "bg-emerald-950/60 border-emerald-800/80 text-emerald-300"
                              : inv.status === "draft"
                              ? "bg-amber-950/60 border-amber-800/80 text-amber-300"
                              : "bg-slate-800 border-slate-700 text-slate-400"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              inv.status === "confirmed"
                                ? "bg-emerald-400"
                                : inv.status === "draft"
                                ? "bg-amber-400"
                                : "bg-slate-500"
                            }`}
                          />
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => openInvoiceDetail(inv)}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-medium border border-slate-700 cursor-pointer"
                        >
                          View & Manage &rarr;
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

      {/* Add Purchase Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-3xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white">Create Purchase Invoice</h3>
                <p className="text-xs text-slate-400">Record stock incoming from supplier</p>
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

            <form className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Select Vendor *
                  </label>
                  <select
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-cyan-500/50"
                  >
                    <option value="">-- Choose Vendor --</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Invoice Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="e.g. BILL-2026-001"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs font-mono focus:ring-2 focus:ring-cyan-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Invoice Date
                  </label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs font-mono focus:ring-2 focus:ring-cyan-500/50"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-300">Medicines / Line Items</span>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
                  >
                    + Add Another Item
                  </button>
                </div>

                <div className="space-y-2">
                  {lines.map((line, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 items-center text-xs"
                    >
                      <div className="col-span-5">
                        <select
                          value={line.item_id}
                          onChange={(e) => updateLine(idx, "item_id", e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white text-xs"
                        >
                          <option value="">Select Item / Medicine...</option>
                          {items.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.name} ({it.unit})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          placeholder="Qty"
                          min="0.01"
                          step="any"
                          value={line.quantity}
                          onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono text-xs"
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          placeholder="Rate ₹"
                          min="0"
                          step="any"
                          value={line.rate}
                          onChange={(e) => updateLine(idx, "rate", e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono text-xs"
                        />
                      </div>

                      <div className="col-span-2">
                        <select
                          value={line.gst_rate}
                          onChange={(e) => updateLine(idx, "gst_rate", e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono text-xs"
                        >
                          <option value="0">0%</option>
                          <option value="5">5%</option>
                          <option value="12">12%</option>
                          <option value="18">18%</option>
                          <option value="28">28%</option>
                        </select>
                      </div>

                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="text-slate-500 hover:text-rose-400 p-1 rounded"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals Summary */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-end">
                <div className="w-64 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Taxable Subtotal:</span>
                    <span className="font-mono">₹{totals.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>GST Tax:</span>
                    <span className="font-mono">₹{totals.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-white text-sm pt-2 border-t border-slate-800">
                    <span>Total Amount:</span>
                    <span className="font-mono text-cyan-300">₹{totals.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={formSubmitting}
                  onClick={(e) => handleCreatePurchase(e, false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  disabled={formSubmitting}
                  onClick={(e) => handleCreatePurchase(e, true)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold shadow-lg shadow-cyan-500/20"
                >
                  Save & Confirm (Receive Stock)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {showDetailModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800">
              <div>
                <span
                  className={`text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full border font-semibold ${
                    selectedInvoice.status === "confirmed"
                      ? "bg-emerald-950/60 border-emerald-800/80 text-emerald-300"
                      : selectedInvoice.status === "draft"
                      ? "bg-amber-950/60 border-amber-800/80 text-amber-300"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  {selectedInvoice.status}
                </span>
                <h3 className="text-xl font-bold text-white mt-1.5">
                  Purchase: {selectedInvoice.invoice_number}
                </h3>
                <p className="text-xs text-slate-400">
                  Supplier: <span className="text-slate-200">{selectedInvoice.party?.name}</span> &bull; Date: {selectedInvoice.invoice_date}
                </p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-white text-sm p-1.5 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {detailLoading ? (
              <div className="py-8 text-center text-cyan-400 text-xs">Loading line items...</div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-900/60 text-[10px] uppercase font-semibold text-slate-400 border-b border-slate-800">
                        <th className="py-2.5 px-4">Item</th>
                        <th className="py-2.5 px-3">Qty</th>
                        <th className="py-2.5 px-3">Rate</th>
                        <th className="py-2.5 px-3">GST</th>
                        <th className="py-2.5 px-4 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {(selectedInvoice.lines || []).map((l: any, i: number) => (
                        <tr key={i}>
                          <td className="py-2.5 px-4 font-sans text-white">{l.item?.name || "Item"}</td>
                          <td className="py-2.5 px-3 text-cyan-300">{l.quantity} {l.item?.unit}</td>
                          <td className="py-2.5 px-3">₹{l.rate}</td>
                          <td className="py-2.5 px-3">{l.gst_rate}%</td>
                          <td className="py-2.5 px-4 text-right font-bold text-slate-200">
                            ₹{l.line_total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center text-xs">
                  <span className="text-slate-400">Total Purchase Amount:</span>
                  <span className="font-mono text-base font-bold text-cyan-300">
                    ₹{selectedInvoice.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {selectedInvoice.status === "draft" && (
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleCancel(selectedInvoice.id)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 text-xs font-medium transition-colors"
                    >
                      Cancel Invoice
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleConfirm(selectedInvoice.id)}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20"
                    >
                      {actionLoading ? "Confirming..." : "✓ Confirm & Receive Stock"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-600">
        Trade Flow Invoicing Engine &bull; Phase 5 Active
      </footer>
    </div>
  );
}
