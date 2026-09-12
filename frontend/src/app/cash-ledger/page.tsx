"use client";

import React, { useState, useEffect, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/context/AuthContext";

interface CashLedgerEntry {
  id: string;
  date: string;
  type: "cash_in" | "cash_out";
  invoice_number: string;
  walkin_name: string | null;
  walkin_phone: string | null;
  amount: number;
  running_balance: number;
  reference_type: "sales_invoice" | "purchase_invoice";
  reference_id: string;
  created_at: string;
}

interface CashLedgerReport {
  opening_balance: number;
  closing_balance: number;
  total_cash_in: number;
  total_cash_out: number;
  from_date: string | null;
  to_date: string | null;
  entries_count: number;
  entries: CashLedgerEntry[];
}

export default function CashLedgerPage() {
  const { activeCompany, token } = useAuth();

  const [report, setReport] = useState<CashLedgerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date filters
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Opening Balance Modal State
  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [newOpeningBalance, setNewOpeningBalance] = useState("");
  const [openingSaving, setOpeningSaving] = useState(false);
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [openingSuccess, setOpeningSuccess] = useState<string | null>(null);

  const fetchCashLedger = useCallback(async () => {
    if (!activeCompany || !token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let url = `/api/reports/cash-ledger`;
      const params = new URLSearchParams();
      if (fromDate) params.append("from_date", fromDate);
      if (toDate) params.append("to_date", toDate);

      const qs = params.toString();
      if (qs) url += `?${qs}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-company-id": activeCompany.id,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to load Cash Ledger.");
      }

      const data: CashLedgerReport = await res.json();
      setReport(data);
    } catch (err: any) {
      setError(err.message || "Failed to load Cash Ledger.");
    } finally {
      setLoading(false);
    }
  }, [activeCompany, token, fromDate, toDate]);

  useEffect(() => {
    fetchCashLedger();
  }, [fetchCashLedger]);

  const handleSetToday = () => {
    const today = new Date().toISOString().split("T")[0];
    setFromDate(today);
    setToDate(today);
  };

  const handleSetThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const today = now.toISOString().split("T")[0];
    setFromDate(firstDay);
    setToDate(today);
  };

  const handleClearFilter = () => {
    setFromDate("");
    setToDate("");
  };

  const handleSaveOpeningBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany || !token) return;

    const val = Number(newOpeningBalance);
    if (isNaN(val) || val < 0) {
      setOpeningError("Opening balance must be a non-negative number.");
      return;
    }

    setOpeningSaving(true);
    setOpeningError(null);
    setOpeningSuccess(null);

    try {
      const res = await fetch(`/api/companies/current/cash-opening-balance`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-company-id": activeCompany.id,
        },
        body: JSON.stringify({ cash_opening_balance: val }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to update cash opening balance.");
      }

      setOpeningSuccess("Opening balance saved successfully!");
      setTimeout(() => {
        setShowOpeningModal(false);
        setOpeningSuccess(null);
        fetchCashLedger();
      }, 1000);
    } catch (err: any) {
      setOpeningError(err.message || "Failed to update cash opening balance.");
    } finally {
      setOpeningSaving(false);
    }
  };

  const formatCurrency = (val?: number) => {
    const num = Number(val) || 0;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(num);
  };

  return (
    <AppLayout
      pageTitle="Cash Account & Ledger"
      pageSubtitle="Track all over-the-counter walk-in sales, one-off cash purchases, and cash in hand"
      headerActions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setNewOpeningBalance(String(report?.opening_balance || "0"));
              setOpeningError(null);
              setOpeningSuccess(null);
              setShowOpeningModal(true);
            }}
            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>Set Opening Balance</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded text-xs font-medium shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Print Ledger</span>
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchCashLedger} className="font-semibold underline cursor-pointer">
              Retry
            </button>
          </div>
        )}

        {/* 1. Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Opening Balance */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Opening Balance
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                {fromDate ? `As of ${fromDate}` : "Initial"}
              </span>
            </div>
            <div className="mt-2 text-xl font-bold text-slate-900 tracking-tight">
              {formatCurrency(report?.opening_balance)}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Cash balance at the start of period
            </p>
          </div>

          {/* Card 2: Total Cash In */}
          <div className="bg-white border border-emerald-200/80 rounded-lg p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                Total Cash In (+)
              </span>
              <span className="p-1 bg-emerald-50 text-emerald-600 rounded">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </span>
            </div>
            <div className="mt-2 text-xl font-bold text-emerald-700 tracking-tight">
              {formatCurrency(report?.total_cash_in)}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Walk-in sales & inward receipts
            </p>
          </div>

          {/* Card 3: Total Cash Out */}
          <div className="bg-white border border-rose-200/80 rounded-lg p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-800 uppercase tracking-wider">
                Total Cash Out (-)
              </span>
              <span className="p-1 bg-rose-50 text-rose-600 rounded">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </span>
            </div>
            <div className="mt-2 text-xl font-bold text-rose-700 tracking-tight">
              {formatCurrency(report?.total_cash_out)}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Cash vendor payments & purchases
            </p>
          </div>

          {/* Card 4: Closing Balance */}
          <div className="bg-slate-900 text-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Net Cash In Hand
              </span>
              <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-bold uppercase">
                Closing
              </span>
            </div>
            <div className="mt-2 text-xl font-bold text-white tracking-tight">
              {formatCurrency(report?.closing_balance)}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {report?.entries_count || 0} transaction(s) recorded
            </p>
          </div>
        </div>

        {/* 2. Filter Bar */}
        <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-700">From:</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 px-2.5 border border-slate-300 rounded text-xs text-slate-900 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-700">To:</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 px-2.5 border border-slate-300 rounded text-xs text-slate-900 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSetToday}
                className="h-8 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={handleSetThisMonth}
                className="h-8 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors cursor-pointer"
              >
                This Month
              </button>
              {(fromDate || toDate) && (
                <button
                  type="button"
                  onClick={handleClearFilter}
                  className="h-8 px-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded text-xs font-semibold transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Showing <strong className="text-slate-900">{report?.entries.length || 0}</strong> transactions
          </div>
        </div>

        {/* 3. High-Density Cash Ledger Table */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Cash Movements & Running Balance
            </h2>
            <span className="text-[11px] text-slate-500 font-medium">
              Chronological Audit Trail
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th className="w-24">Date</th>
                  <th className="w-24">Type</th>
                  <th className="w-32">Voucher / Bill #</th>
                  <th>Walk-in Party / Details</th>
                  <th className="text-right w-28">Cash In (₹)</th>
                  <th className="text-right w-28">Cash Out (₹)</th>
                  <th className="text-right w-32">Running Balance (₹)</th>
                </tr>
              </thead>
              <tbody>
                {/* Initial Row: Opening Balance */}
                <tr className="bg-slate-50/70 font-semibold text-slate-700">
                  <td>{fromDate || "Beginning"}</td>
                  <td>
                    <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 text-[10px] font-bold uppercase">
                      Opening
                    </span>
                  </td>
                  <td className="text-slate-400 font-mono">—</td>
                  <td className="text-slate-600">Balance brought forward</td>
                  <td className="text-right font-mono text-slate-400">—</td>
                  <td className="text-right font-mono text-slate-400">—</td>
                  <td className="text-right font-mono font-bold text-slate-900">
                    {formatCurrency(report?.opening_balance)}
                  </td>
                </tr>

                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      Loading cash ledger records...
                    </td>
                  </tr>
                ) : !report?.entries || report.entries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-500 text-xs">
                      No cash transactions found for the selected period.
                    </td>
                  </tr>
                ) : (
                  report.entries.map((entry) => {
                    const isCashIn = entry.type === "cash_in";
                    return (
                      <tr key={entry.id} className="hover:bg-blue-50/40 transition-colors">
                        <td className="font-mono text-xs text-slate-700">{entry.date}</td>
                        <td>
                          {isCashIn ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Cash Sale
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold uppercase">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                              Cash Purchase
                            </span>
                          )}
                        </td>
                        <td className="font-mono font-medium text-slate-900">
                          {entry.invoice_number}
                        </td>
                        <td>
                          {entry.walkin_name ? (
                            <div>
                              <span className="font-semibold text-slate-900">{entry.walkin_name}</span>
                              {entry.walkin_phone && (
                                <span className="text-[11px] text-slate-400 ml-1.5 font-mono">
                                  ({entry.walkin_phone})
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Walk-in Counterparty</span>
                          )}
                        </td>
                        <td className="text-right font-mono font-semibold text-emerald-700">
                          {isCashIn ? formatCurrency(entry.amount) : "—"}
                        </td>
                        <td className="text-right font-mono font-semibold text-rose-700">
                          {!isCashIn ? formatCurrency(entry.amount) : "—"}
                        </td>
                        <td className="text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                          {formatCurrency(entry.running_balance)}
                        </td>
                      </tr>
                    );
                  })
                )}

                {/* Final Closing Summary Row */}
                {report && report.entries.length > 0 && (
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                    <td colSpan={4} className="text-right uppercase tracking-wider text-xs">
                      Period Closing Balance:
                    </td>
                    <td className="text-right font-mono text-emerald-800">
                      {formatCurrency(report.total_cash_in)}
                    </td>
                    <td className="text-right font-mono text-rose-800">
                      {formatCurrency(report.total_cash_out)}
                    </td>
                    <td className="text-right font-mono text-base text-blue-900">
                      {formatCurrency(report.closing_balance)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Set Opening Balance Modal */}
      {showOpeningModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Set Cash Opening Balance
              </h3>
              <button
                onClick={() => setShowOpeningModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveOpeningBalance} className="p-5 space-y-4">
              {openingError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {openingError}
                </div>
              )}
              {openingSuccess && (
                <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                  {openingSuccess}
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-900 leading-relaxed">
                <strong>Accounting Note:</strong> This establishes the initial base cash balance before any sales or purchases were recorded. Changing this value is restricted if confirmed cash invoices already exist in order to maintain historical ledger accuracy.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Cash in Hand (₹) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-bold text-slate-500">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={newOpeningBalance}
                    onChange={(e) => setNewOpeningBalance(e.target.value)}
                    className="w-full pl-7 pr-3 py-1.5 border border-slate-300 rounded text-xs font-mono font-bold focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowOpeningModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={openingSaving}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  {openingSaving ? "Saving..." : "Save Opening Balance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
