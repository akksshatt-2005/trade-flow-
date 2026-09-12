"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import AppLayout from "../../components/AppLayout";

export interface PurchaseInvoice {
  id: string;
  company_id: string;
  party_id: string;
  party?: { id: string; name: string; phone?: string | null; gst_number?: string | null };
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  gst_amount: number;
  walkin_name?: string | null;
  walkin_phone?: string | null;
  walkin_address?: string | null;
  status: "draft" | "confirmed" | "cancelled";
  lines?: any[];
  created_at: string;
}

export default function PurchasesPage() {
  const { user, token, activeCompany, loading: authLoading, apiFetch } = useAuth();
  const router = useRouter();

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
  const [walkinName, setWalkinName] = useState("");
  const [walkinPhone, setWalkinPhone] = useState("");
  const [walkinAddress, setWalkinAddress] = useState("");
  const [lines, setLines] = useState<
    Array<{ item_id: string; quantity: string; rate: string; gst_rate: string }>
  >([{ item_id: "", quantity: "10", rate: "80", gst_rate: "12" }]);

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!activeCompany?.id) return;
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
      setError("Failed to load purchase records.");
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id, apiFetch]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (activeCompany?.id) {
      loadData();
    }
  }, [authLoading, user, activeCompany?.id, loadData, router]);

  const handleOpenAdd = () => {
    setInvoiceNumber(`PUR-${Date.now().toString().slice(-6)}`);
    setVendorId(vendors[0]?.id || "");
    setWalkinName("");
    setWalkinPhone("");
    setWalkinAddress("");
    setLines([{ item_id: items[0]?.id || "", quantity: "10", rate: "80", gst_rate: String(items[0]?.gst_rate || 12) }]);
    setFormError(null);
    setShowAddModal(true);
  };

  const handleLineItemChange = (index: number, field: string, value: string) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "item_id") {
      const selectedProduct = items.find((i) => i.id === value);
      if (selectedProduct) {
        updated[index].gst_rate = String(selectedProduct.gst_rate || 12);
      }
    }
    setLines(updated);
  };

  const addLine = () => {
    setLines([...lines, { item_id: items[0]?.id || "", quantity: "10", rate: "80", gst_rate: "12" }]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 1) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  let computedSubtotal = 0;
  let computedGst = 0;
  lines.forEach((l) => {
    const q = Number(l.quantity) || 0;
    const r = Number(l.rate) || 0;
    const g = Number(l.gst_rate) || 0;
    const taxable = q * r;
    const tax = taxable * (g / 100);
    computedSubtotal += taxable;
    computedGst += tax;
  });
  const computedTotal = computedSubtotal + computedGst;

  const selectedVendor = vendors.find((v) => v.id === vendorId);

  // Create Purchase Bill
  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId) {
      setFormError("Please select a vendor supplier.");
      return;
    }
    if (!invoiceNumber.trim()) {
      setFormError("Purchase bill number is required.");
      return;
    }
    setFormSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        party_id: vendorId,
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate,
        walkin_name: walkinName.trim() || undefined,
        walkin_phone: walkinPhone.trim() || undefined,
        walkin_address: walkinAddress.trim() || undefined,
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
      if (res.ok) {
        setShowAddModal(false);
        loadData();
      } else {
        setFormError(data.message || "Failed to create purchase invoice.");
      }
    } catch (err: any) {
      setFormError(err.message || "Network error.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Confirm Inward Purchase
  const handleConfirmPurchase = async (invoiceId: string) => {
    setActionLoading(true);
    try {
      const res = await apiFetch(`/purchases/${invoiceId}/confirm`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        loadData();
        if (showDetailModal && selectedInvoice?.id === invoiceId) {
          handleViewDetail(invoiceId);
        }
      } else {
        alert(data.message || "Failed to confirm purchase bill.");
      }
    } catch (err: any) {
      alert(err.message || "Error confirming purchase bill.");
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel Purchase Bill
  const handleCancelPurchase = async (invoiceId: string) => {
    if (!confirm("Are you sure you want to cancel this draft purchase bill?")) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/purchases/${invoiceId}/cancel`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        loadData();
        if (showDetailModal && selectedInvoice?.id === invoiceId) {
          setShowDetailModal(false);
        }
      } else {
        alert(data.message || "Failed to cancel bill.");
      }
    } catch (err: any) {
      alert(err.message || "Error cancelling bill.");
    } finally {
      setActionLoading(false);
    }
  };

  // View Invoice Detail Modal
  const handleViewDetail = async (invoiceId: string) => {
    setDetailLoading(true);
    setShowDetailModal(true);
    try {
      const res = await apiFetch(`/purchases/${invoiceId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedInvoice(data.invoice);
      }
    } catch {
      // Ignore
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <AppLayout
      pageTitle="Inward Purchases & Vendor Bills"
      pageSubtitle="Record stock inward supplies, verify GST components, and confirm into stock ledger"
      headerActions={
        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          <span>+ Record Purchase Bill</span>
        </button>
      }
    >
      <div className="space-y-4">
        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-xs font-medium">
            {error}
          </div>
        )}

        {/* Dense Purchases Table */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="overflow-x-auto min-h-[350px]">
            {loading ? (
              <div className="p-12 text-center text-xs text-slate-500">
                <div className="inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                <div>Loading purchase records...</div>
              </div>
            ) : invoices.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">
                No inward purchase bills recorded yet. Click "+ Record Purchase Bill" above.
              </div>
            ) : (
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Bill Date</th>
                    <th>Bill #</th>
                    <th>Supplier / Vendor</th>
                    <th className="text-right">Taxable (₹)</th>
                    <th className="text-right">GST (₹)</th>
                    <th className="text-right">Total (₹)</th>
                    <th className="text-center">Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const taxable = Math.max(0, Number(inv.total_amount) - Number(inv.gst_amount));
                    return (
                      <tr key={inv.id}>
                        <td className="text-slate-600 whitespace-nowrap">{inv.invoice_date}</td>
                        <td className="font-mono font-bold text-slate-900">{inv.invoice_number}</td>
                        <td className="font-medium text-slate-900 max-w-xs truncate">
                          {inv.walkin_name
                            ? `${inv.party?.name || "Cash"} (${inv.walkin_name})`
                            : inv.party?.name || "Direct Supplier"}
                        </td>
                        <td className="text-right font-mono text-slate-700">
                          ₹{taxable.toFixed(2)}
                        </td>
                        <td className="text-right font-mono text-blue-700 font-semibold">
                          ₹{Number(inv.gst_amount).toFixed(2)}
                        </td>
                        <td className="text-right font-mono font-bold text-slate-900">
                          ₹{Number(inv.total_amount).toFixed(2)}
                        </td>
                        <td className="text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              inv.status === "confirmed"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : inv.status === "draft"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="text-right whitespace-nowrap space-x-2">
                          <button
                            type="button"
                            onClick={() => handleViewDetail(inv.id)}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                          >
                            View Bill
                          </button>
                          {inv.status === "draft" && (
                            <>
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => handleConfirmPurchase(inv.id)}
                                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                              >
                                Confirm Inward
                              </button>
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => handleCancelPurchase(inv.id)}
                                className="text-xs font-semibold text-red-600 hover:text-red-800 hover:underline cursor-pointer"
                              >
                                Cancel
                              </button>
                            </>
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

      {/* Record Purchase Bill Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Inward Purchase Bill Entry
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreatePurchase} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Vendor / Supplier <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 bg-white font-medium"
                  >
                    {vendors.length === 0 && <option value="">No vendors available</option>}
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} {v.is_system_account ? "(Cash Account)" : v.phone ? `(${v.phone})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Supplier Bill Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono font-bold focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bill Date
                  </label>
                  <input
                    type="date"
                    required
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
              </div>

              {/* Walk-in Vendor Details Section (Optional) */}
              {(selectedVendor?.name?.toLowerCase() === "cash" || selectedVendor?.is_system_account) && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-md space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                    <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>Walk-in Supplier Details (Optional)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        Supplier / Person Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Local Distributor"
                        value={walkinName}
                        onChange={(e) => setWalkinName(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 9876543210"
                        value={walkinPhone}
                        onChange={(e) => setWalkinPhone(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        Address / Location
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Wholesale Mandi"
                        value={walkinAddress}
                        onChange={(e) => setWalkinAddress(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Line Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Medicines Received
                  </h4>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                  >
                    + Add Item Line
                  </button>
                </div>

                <div className="space-y-2">
                  {lines.map((line, idx) => {
                    const q = Number(line.quantity) || 0;
                    const r = Number(line.rate) || 0;
                    const g = Number(line.gst_rate) || 0;
                    const lineTot = q * r * (1 + g / 100);

                    return (
                      <div
                        key={idx}
                        className="grid grid-cols-12 gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded items-center text-xs"
                      >
                        <div className="col-span-5">
                          <select
                            value={line.item_id}
                            onChange={(e) =>
                              handleLineItemChange(idx, "item_id", e.target.value)
                            }
                            className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 outline-none font-medium"
                          >
                            <option value="">-- Pick Medicine / Item --</option>
                            {items.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.name} {it.sku ? `(${it.sku})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="col-span-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="Qty"
                            value={line.quantity}
                            onChange={(e) =>
                              handleLineItemChange(idx, "quantity", e.target.value)
                            }
                            className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs font-mono text-right bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                          />
                        </div>

                        <div className="col-span-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Rate (₹)"
                            value={line.rate}
                            onChange={(e) =>
                              handleLineItemChange(idx, "rate", e.target.value)
                            }
                            className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs font-mono text-right bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                          />
                        </div>

                        <div className="col-span-2">
                          <select
                            value={line.gst_rate}
                            onChange={(e) =>
                              handleLineItemChange(idx, "gst_rate", e.target.value)
                            }
                            className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                          >
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="12">12%</option>
                            <option value="18">18%</option>
                            <option value="28">28%</option>
                          </select>
                        </div>

                        <div className="col-span-1 flex items-center justify-end">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="text-red-500 hover:text-red-700 p-1 font-bold text-sm cursor-pointer"
                            >
                              &times;
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Totals Summary */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded flex justify-between items-center text-xs">
                <div className="text-slate-600">
                  Total Items: <strong className="text-slate-900">{lines.length}</strong>
                </div>
                <div className="text-right space-y-0.5">
                  <div className="text-slate-600">
                    Taxable: <span className="font-mono">₹{computedSubtotal.toFixed(2)}</span> | GST: <span className="font-mono text-blue-700 font-semibold">₹{computedGst.toFixed(2)}</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">
                    Grand Total: <span className="font-mono text-emerald-700">₹{computedTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-2xs transition-colors"
                >
                  {formSubmitting ? "Saving..." : "Save Draft Bill"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Invoice Detail Modal */}
      {showDetailModal && selectedInvoice && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900">
                  Purchase Bill: {selectedInvoice.invoice_number}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    selectedInvoice.status === "confirmed"
                      ? "bg-blue-100 text-blue-800"
                      : selectedInvoice.status === "draft"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {selectedInvoice.status}
                </span>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    Supplier / Vendor
                  </span>
                  <span className="font-bold text-slate-900 text-sm">
                    {selectedInvoice.party?.name || "Direct Supplier"}
                  </span>
                  {selectedInvoice.walkin_name && (
                    <div className="text-blue-700 font-semibold text-xs mt-0.5">
                      Walk-in Supplier: {selectedInvoice.walkin_name}
                      {selectedInvoice.walkin_phone && ` (${selectedInvoice.walkin_phone})`}
                    </div>
                  )}
                  {selectedInvoice.walkin_address && (
                    <div className="text-slate-500 text-[11px]">
                      {selectedInvoice.walkin_address}
                    </div>
                  )}
                  {selectedInvoice.party?.gst_number && (
                    <div className="text-slate-500 font-mono text-[11px]">
                      GSTIN: {selectedInvoice.party.gst_number}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    Bill Date
                  </span>
                  <span className="font-semibold text-slate-900">
                    {selectedInvoice.invoice_date}
                  </span>
                </div>
              </div>

              {/* Line Items */}
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Item Description</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">GST %</th>
                    <th className="text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.lines?.map((l) => (
                    <tr key={l.id}>
                      <td className="font-semibold text-slate-900">
                        {l.item?.name || "Medicine Item"}
                      </td>
                      <td className="text-right font-mono">
                        {l.quantity} {l.item?.unit || "pcs"}
                      </td>
                      <td className="text-right font-mono">₹{Number(l.rate).toFixed(2)}</td>
                      <td className="text-right">{l.gst_rate}%</td>
                      <td className="text-right font-bold text-slate-900">
                        ₹{Number(l.line_total).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary Totals */}
              <div className="flex justify-end pt-3 border-t border-slate-200">
                <div className="w-64 space-y-1 text-right text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Taxable Subtotal:</span>
                    <span className="font-mono">
                      ₹{(Number(selectedInvoice.total_amount) - Number(selectedInvoice.gst_amount)).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Total GST Amount:</span>
                    <span className="font-mono text-blue-700">
                      ₹{Number(selectedInvoice.gst_amount).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-200">
                    <span>Grand Total:</span>
                    <span className="font-mono text-emerald-700">
                      ₹{Number(selectedInvoice.total_amount).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                {selectedInvoice.status === "draft" && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleConfirmPurchase(selectedInvoice.id)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  >
                    Confirm & Inward to Stock
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold"
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
