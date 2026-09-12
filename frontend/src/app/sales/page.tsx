"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import AppLayout from "../../components/AppLayout";

export interface SalesInvoice {
  id: string;
  company_id: string;
  party_id: string;
  party?: { id: string; name: string; phone?: string | null; gst_number?: string | null; state?: string | null };
  invoice_number: string;
  invoice_date: string;
  total_taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  gst_amount: number;
  total_amount: number;
  is_interstate: boolean;
  status: "draft" | "confirmed" | "cancelled";
  lines?: any[];
  created_at: string;
}

export default function SalesPage() {
  const { user, token, activeCompany, loading: authLoading, apiFetch } = useAuth();
  const router = useRouter();

  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Form State
  const [customerId, setCustomerId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [lines, setLines] = useState<
    Array<{ item_id: string; quantity: string; rate: string; gst_rate: string }>
  >([{ item_id: "", quantity: "1", rate: "120", gst_rate: "12" }]);

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [shortageErrors, setShortageErrors] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!activeCompany?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [invRes, custRes, itemsRes] = await Promise.all([
        apiFetch("/sales"),
        apiFetch("/parties?type=customer"),
        apiFetch("/items"),
      ]);

      const [invData, custData, itemsData] = await Promise.all([
        invRes.json(),
        custRes.json(),
        itemsRes.json(),
      ]);

      if (invRes.ok) setInvoices(invData.invoices || []);
      if (custRes.ok) setCustomers(custData.parties || []);
      if (itemsRes.ok) setItems(itemsData.items || []);
    } catch {
      setError("Failed to load billing records.");
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

  // Handle open add modal
  const handleOpenAdd = () => {
    setInvoiceNumber(`INV-${Date.now().toString().slice(-6)}`);
    setCustomerId(customers[0]?.id || "");
    setLines([{ item_id: items[0]?.id || "", quantity: "1", rate: "100", gst_rate: String(items[0]?.gst_rate || 12) }]);
    setFormError(null);
    setShortageErrors([]);
    setShowAddModal(true);
  };

  const handleLineItemChange = (index: number, field: string, value: string) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };

    // Auto fill default gst_rate if item changed
    if (field === "item_id") {
      const selectedProduct = items.find((i) => i.id === value);
      if (selectedProduct) {
        updated[index].gst_rate = String(selectedProduct.gst_rate || 12);
      }
    }
    setLines(updated);
  };

  const addLine = () => {
    setLines([...lines, { item_id: items[0]?.id || "", quantity: "1", rate: "100", gst_rate: "12" }]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 1) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  // Live Tax Computations for Create Form
  const selectedCust = customers.find((c) => c.id === customerId);
  const compState = (activeCompany?.address || "").toLowerCase();
  const custState = (selectedCust?.state || selectedCust?.address || "").toLowerCase();
  const isInterState = Boolean(compState && custState && !compState.includes(custState) && !custState.includes(compState));

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

  // Create Draft Sales Invoice
  const handleCreateSales = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      setFormError("Please select a customer.");
      return;
    }
    if (!invoiceNumber.trim()) {
      setFormError("Invoice number is required.");
      return;
    }
    setFormSubmitting(true);
    setFormError(null);
    setShortageErrors([]);

    try {
      const payload = {
        party_id: customerId,
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate,
        lines: lines.map((l) => ({
          item_id: l.item_id,
          quantity: Number(l.quantity),
          rate: Number(l.rate),
          gst_rate: Number(l.gst_rate),
        })),
      };

      const res = await apiFetch("/sales", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setShowAddModal(false);
        loadData();
      } else {
        setFormError(data.message || "Failed to create sales invoice.");
      }
    } catch (err: any) {
      setFormError(err.message || "Network error.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Confirm Sales Invoice (atomic stock check)
  const handleConfirmInvoice = async (invoiceId: string) => {
    setActionLoading(true);
    setShortageErrors([]);
    try {
      const res = await apiFetch(`/sales/${invoiceId}/confirm`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        loadData();
        if (showDetailModal && selectedInvoice?.id === invoiceId) {
          handleViewDetail(invoiceId);
        }
      } else {
        if (data.shortages) {
          setShortageErrors(data.shortages);
          alert(`Cannot confirm invoice: ${data.message}`);
        } else {
          alert(data.message || "Failed to confirm invoice.");
        }
      }
    } catch (err: any) {
      alert(err.message || "Error confirming invoice.");
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel Sales Invoice
  const handleCancelInvoice = async (invoiceId: string) => {
    if (!confirm("Are you sure you want to cancel this draft sales invoice?")) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/sales/${invoiceId}/cancel`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        loadData();
        if (showDetailModal && selectedInvoice?.id === invoiceId) {
          setShowDetailModal(false);
        }
      } else {
        alert(data.message || "Failed to cancel invoice.");
      }
    } catch (err: any) {
      alert(err.message || "Error cancelling invoice.");
    } finally {
      setActionLoading(false);
    }
  };

  // View Invoice Detail Modal
  const handleViewDetail = async (invoiceId: string) => {
    setDetailLoading(true);
    setShowDetailModal(true);
    try {
      const res = await apiFetch(`/sales/${invoiceId}`);
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
      pageTitle="Sales Invoices"
      pageSubtitle={`Outward billing and customer GST tax invoices for ${activeCompany?.name || "your shop"}`}
      headerActions={
        <button
          onClick={handleOpenAdd}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          <span>+ Create Sales Invoice</span>
        </button>
      }
    >
      <div className="space-y-4 max-w-7xl mx-auto">
        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-xs font-medium">
            {error}
          </div>
        )}

        {/* Dense Sales Invoices Table */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="overflow-x-auto min-h-[350px]">
            {loading ? (
              <div className="p-12 text-center text-xs text-slate-500">
                <div className="inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                <div>Loading sales records...</div>
              </div>
            ) : invoices.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">
                No sales invoices created yet. Click "+ Create Sales Invoice" above.
              </div>
            ) : (
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Invoice Date</th>
                    <th>Invoice #</th>
                    <th>Customer Name</th>
                    <th>GST Scheme</th>
                    <th className="text-right">Taxable (₹)</th>
                    <th className="text-right">GST (₹)</th>
                    <th className="text-right">Total (₹)</th>
                    <th className="text-center">Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="text-slate-600 whitespace-nowrap">{inv.invoice_date}</td>
                      <td className="font-mono font-bold text-slate-900">{inv.invoice_number}</td>
                      <td className="font-medium text-slate-900 max-w-xs truncate">
                        {inv.party?.name || "Cash Customer"}
                      </td>
                      <td>
                        <span className="text-[11px] text-slate-600">
                          {inv.is_interstate ? "Inter-State (IGST)" : "Intra-State (CGST+SGST)"}
                        </span>
                      </td>
                      <td className="text-right font-mono text-slate-700">
                        ₹{Number(inv.total_taxable_amount || 0).toFixed(2)}
                      </td>
                      <td className="text-right font-mono text-blue-700 font-semibold">
                        ₹{Number(inv.gst_amount || 0).toFixed(2)}
                      </td>
                      <td className="text-right font-mono font-bold text-slate-900">
                        ₹{Number(inv.total_amount).toFixed(2)}
                      </td>
                      <td className="text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            inv.status === "confirmed"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
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
                              onClick={() => handleConfirmInvoice(inv.id)}
                              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => handleCancelInvoice(inv.id)}
                              className="text-xs font-semibold text-red-600 hover:text-red-800 hover:underline cursor-pointer"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Create Sales Invoice Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                New Sales Bill / Tax Invoice
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateSales} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer Party <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 bg-white font-medium"
                  >
                    {customers.length === 0 && <option value="">No customers available</option>}
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Invoice Number <span className="text-red-500">*</span>
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
                    Invoice Date
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

              {/* GST Tax Preview Banner */}
              <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded text-xs flex items-center justify-between">
                <span className="text-blue-900 font-medium">
                  Tax Scheme: <strong>{isInterState ? "Inter-State (100% IGST)" : "Intra-State (50% CGST + 50% SGST)"}</strong>
                </span>
                <span className="text-slate-600 text-[11px]">
                  Shop: {compState || "MH"} &bull; Customer: {custState || "MH"}
                </span>
              </div>

              {/* Line Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Medicine Line Items
                  </h4>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                  >
                    + Add Item Line
                  </button>
                </div>

                <div className="space-y-2">
                  {lines.map((line, idx) => {
                    const selectedItem = items.find((i) => i.id === line.item_id);
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
                            required
                            value={line.item_id}
                            onChange={(e) => handleLineItemChange(idx, "item_id", e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 bg-white"
                          >
                            {items.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.name} (Stock: {it.current_stock} {it.unit})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="col-span-2">
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            placeholder="Qty"
                            required
                            value={line.quantity}
                            onChange={(e) => handleLineItemChange(idx, "quantity", e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs font-mono text-right"
                          />
                        </div>

                        <div className="col-span-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Rate"
                            required
                            value={line.rate}
                            onChange={(e) => handleLineItemChange(idx, "rate", e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs font-mono text-right"
                          />
                        </div>

                        <div className="col-span-2 text-right font-mono font-bold text-slate-900 truncate">
                          ₹{lineTot.toFixed(2)}
                        </div>

                        <div className="col-span-1 text-center">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="text-red-500 hover:text-red-700 font-bold text-sm"
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

              {/* Total Summary Footer */}
              <div className="flex justify-end pt-3 border-t border-slate-200">
                <div className="w-64 space-y-1 text-right text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Taxable Subtotal:</span>
                    <span className="font-mono">₹{computedSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Total GST:</span>
                    <span className="font-mono text-blue-700">₹{computedGst.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-200">
                    <span>Invoice Total:</span>
                    <span className="font-mono text-emerald-700">₹{computedTotal.toFixed(2)}</span>
                  </div>
                </div>
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
                  disabled={formSubmitting}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-2xs transition-colors"
                >
                  {formSubmitting ? "Generating..." : "Save Draft Invoice"}
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
                  Sales Invoice: {selectedInvoice.invoice_number}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    selectedInvoice.status === "confirmed"
                      ? "bg-emerald-100 text-emerald-800"
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
                    Customer
                  </span>
                  <span className="font-bold text-slate-900 text-sm">
                    {selectedInvoice.party?.name || "Cash Customer"}
                  </span>
                  {selectedInvoice.party?.gst_number && (
                    <div className="text-slate-500 font-mono text-[11px]">
                      GSTIN: {selectedInvoice.party.gst_number}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    Invoice Date
                  </span>
                  <span className="font-semibold text-slate-900">
                    {selectedInvoice.invoice_date}
                  </span>
                  <div className="text-slate-500 text-[11px] mt-0.5">
                    {selectedInvoice.is_interstate ? "Inter-State (IGST)" : "Intra-State (CGST + SGST)"}
                  </div>
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
                      ₹{Number(selectedInvoice.total_taxable_amount || 0).toFixed(2)}
                    </span>
                  </div>
                  {selectedInvoice.is_interstate ? (
                    <div className="flex justify-between text-slate-600">
                      <span>IGST (100%):</span>
                      <span className="font-mono text-blue-700">
                        ₹{Number(selectedInvoice.igst_amount || 0).toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-slate-600">
                        <span>CGST (50%):</span>
                        <span className="font-mono text-blue-700">
                          ₹{Number(selectedInvoice.cgst_amount || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>SGST (50%):</span>
                        <span className="font-mono text-blue-700">
                          ₹{Number(selectedInvoice.sgst_amount || 0).toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
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
                    onClick={() => handleConfirmInvoice(selectedInvoice.id)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  >
                    Confirm & Deduct Stock
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
