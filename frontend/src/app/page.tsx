"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import AppLayout from "../components/AppLayout";

interface DashboardSale {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  gst_amount: number;
  status: "draft" | "confirmed" | "cancelled";
  party?: { name: string; phone?: string | null };
}

interface DashboardPurchase {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  gst_amount: number;
  status: "draft" | "confirmed" | "cancelled";
  party?: { name: string; phone?: string | null };
}

interface LowStockItem {
  id: string;
  name: string;
  sku?: string | null;
  unit: string;
  current_stock: number;
  reorder_threshold: number;
  gst_rate: number;
}

export default function DashboardPage() {
  const { user, token, activeCompany, loading: authLoading, apiFetch } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<DashboardSale[]>([]);
  const [purchases, setPurchases] = useState<DashboardPurchase[]>([]);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [totalItemsCount, setTotalItemsCount] = useState(0);
  const [totalPartiesCount, setTotalPartiesCount] = useState(0);

  // Selected Invoice for Quick View
  const [viewInvoice, setViewInvoice] = useState<any>(null);
  const [viewInvoiceType, setViewInvoiceType] = useState<"sale" | "purchase">("sale");
  const [viewModalLoading, setViewModalLoading] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    if (!token || !activeCompany?.id) return;
    setLoading(true);
    try {
      // 1. Fetch Sales
      const salesRes = await apiFetch("/sales");
      let salesList: DashboardSale[] = [];
      if (salesRes.ok) {
        const data = await salesRes.json();
        salesList = data.invoices || [];
        setSales(salesList);
      }

      // 2. Fetch Purchases
      const purchRes = await apiFetch("/purchases");
      let purchList: DashboardPurchase[] = [];
      if (purchRes.ok) {
        const data = await purchRes.json();
        purchList = data.invoices || [];
        setPurchases(purchList);
      }

      // 3. Fetch Items for stock health
      const itemsRes = await apiFetch("/items");
      if (itemsRes.ok) {
        const data = await itemsRes.json();
        const allItems = data.items || [];
        setTotalItemsCount(allItems.length);
        const lowStock = allItems.filter(
          (i: any) =>
            i.reorder_threshold > 0 &&
            Number(i.current_stock) <= Number(i.reorder_threshold),
        );
        setLowStockItems(lowStock);
      }

      // 4. Fetch Parties count
      const partiesRes = await apiFetch("/parties");
      if (partiesRes.ok) {
        const data = await partiesRes.json();
        setTotalPartiesCount(data.parties?.length || 0);
      }
    } catch {
      // Gracefully handle network issues
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
      fetchDashboardData();
    }
  }, [authLoading, user, activeCompany?.id, fetchDashboardData, router]);

  // Today's Date String in YYYY-MM-DD
  const todayStr = new Date().toISOString().split("T")[0];

  // Calculate Today's Confirmed Sales
  const todaySales = sales.filter(
    (s) => s.invoice_date === todayStr && s.status === "confirmed",
  );
  const todaySalesTotal = todaySales.reduce(
    (acc, s) => acc + Number(s.total_amount),
    0,
  );

  // Calculate Today's Confirmed Purchases
  const todayPurchases = purchases.filter(
    (p) => p.invoice_date === todayStr && p.status === "confirmed",
  );
  const todayPurchasesTotal = todayPurchases.reduce(
    (acc, p) => acc + Number(p.total_amount),
    0,
  );

  // Overall Total Confirmed Sales
  const totalSalesRevenue = sales
    .filter((s) => s.status === "confirmed")
    .reduce((acc, s) => acc + Number(s.total_amount), 0);

  // Quick View Invoice Handler
  const handleOpenQuickView = async (id: string, type: "sale" | "purchase") => {
    setViewInvoiceType(type);
    setViewModalLoading(true);
    try {
      const res = await apiFetch(`/${type === "sale" ? "sales" : "purchases"}/${id}`);
      if (res.ok) {
        const data = await res.json();
        setViewInvoice(data.invoice);
      }
    } catch {
      // Ignore
    } finally {
      setViewModalLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs text-slate-500">
        Loading Trade Flow ERP...
      </div>
    );
  }

  return (
    <AppLayout
      pageTitle="Business Overview"
      pageSubtitle={`Real-time dashboard for ${activeCompany?.name || "your pharmacy"}`}
      headerActions={
        <button
          onClick={fetchDashboardData}
          title="Refresh Data"
          className="h-8 px-2.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-600" : "text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="hidden sm:inline">Refresh</span>
        </button>
      }
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* 1. Key Business Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Today's Sales */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Today's Sales
              </span>
              <span className="w-6 h-6 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs">
                ₹
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                ₹{todaySalesTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span>{todaySales.length} bill(s) confirmed today</span>
              <Link href="/sales" className="text-blue-600 font-semibold hover:underline">
                View bills &rarr;
              </Link>
            </div>
          </div>

          {/* Card 2: Today's Purchases */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Today's Purchases
              </span>
              <span className="w-6 h-6 rounded bg-blue-50 text-blue-600 flex items-center justify-center text-xs">
                📦
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                ₹{todayPurchasesTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span>{todayPurchases.length} bill(s) received today</span>
              <Link href="/purchases" className="text-blue-600 font-semibold hover:underline">
                View bills &rarr;
              </Link>
            </div>
          </div>

          {/* Card 3: Total Sales Revenue */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Revenue
              </span>
              <span className="w-6 h-6 rounded bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs">
                📈
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                ₹{totalSalesRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span>{sales.length} total invoice(s)</span>
              <span>{totalPartiesCount} active parties</span>
            </div>
          </div>

          {/* Card 4: Inventory & Low Stock Health */}
          <div className={`bg-white border rounded-lg p-4 shadow-2xs ${lowStockItems.length > 0 ? "border-red-200 bg-red-50/20" : "border-slate-200"}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Stock Status
              </span>
              <span className={`w-6 h-6 rounded flex items-center justify-center text-xs ${lowStockItems.length > 0 ? "bg-red-100 text-red-700 font-bold" : "bg-slate-100 text-slate-600"}`}>
                ⚠️
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                {totalItemsCount}
              </span>
              <span className="text-xs text-slate-500 font-medium">medicines listed</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              {lowStockItems.length > 0 ? (
                <span className="text-red-700 font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                  {lowStockItems.length} item(s) below reorder level
                </span>
              ) : (
                <span className="text-emerald-700 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  All stocks healthy
                </span>
              )}
              <Link href="/inventory" className="text-blue-600 font-semibold hover:underline">
                Catalog &rarr;
              </Link>
            </div>
          </div>
        </div>

        {/* 2. Low Stock Alerts Banner (Shown if low stock exists) */}
        {lowStockItems.length > 0 && (
          <div className="bg-white border border-red-200 rounded-lg overflow-hidden shadow-2xs">
            <div className="px-4 py-3 bg-red-50 border-b border-red-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></span>
                <h2 className="text-xs font-bold text-red-900 uppercase tracking-wider">
                  Critical Low Stock Alert ({lowStockItems.length} items require replenishment)
                </h2>
              </div>
              <Link
                href="/purchases"
                className="text-xs bg-red-600 hover:bg-red-700 text-white font-semibold px-2.5 py-1 rounded shadow-2xs transition-colors"
              >
                + Create Purchase Order
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Medicine / Item Name</th>
                    <th className="text-right">Current Stock</th>
                    <th className="text-right">Reorder Threshold</th>
                    <th className="text-right">Shortage</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockItems.slice(0, 5).map((item) => {
                    const shortage = Math.max(0, item.reorder_threshold - item.current_stock);
                    return (
                      <tr key={item.id} className="hover:bg-red-50/40">
                        <td className="font-mono text-slate-500">{item.sku || "—"}</td>
                        <td className="font-semibold text-slate-900">{item.name}</td>
                        <td className="text-right font-bold text-red-600">
                          {item.current_stock} {item.unit}
                        </td>
                        <td className="text-right text-slate-600">
                          {item.reorder_threshold} {item.unit}
                        </td>
                        <td className="text-right font-bold text-red-700">
                          -{shortage} {item.unit}
                        </td>
                        <td className="text-right">
                          <Link
                            href="/purchases"
                            className="inline-block text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            + Order Stock
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. Side-by-Side Recent Activity Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Sales Invoices */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="text-blue-600 font-bold text-xs">📤</span>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Recent Sales Invoices
                </h2>
              </div>
              <Link href="/sales" className="text-xs font-semibold text-blue-600 hover:underline">
                View All &rarr;
              </Link>
            </div>

            <div className="overflow-x-auto min-h-[220px]">
              {sales.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No sales invoices generated yet.
                  <div className="mt-2">
                    <Link
                      href="/sales"
                      className="inline-block px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700"
                    >
                      + Create First Invoice
                    </Link>
                  </div>
                </div>
              ) : (
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Inv #</th>
                      <th>Customer</th>
                      <th className="text-right">Amount (₹)</th>
                      <th className="text-center">Status</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.slice(0, 6).map((inv) => (
                      <tr key={inv.id}>
                        <td className="text-slate-500 whitespace-nowrap">{inv.invoice_date}</td>
                        <td className="font-mono font-semibold text-slate-900">{inv.invoice_number}</td>
                        <td className="font-medium text-slate-800 max-w-[140px] truncate">
                          {inv.party?.name || "Cash Customer"}
                        </td>
                        <td className="text-right font-bold text-slate-900 whitespace-nowrap">
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
                        <td className="text-right">
                          <button
                            onClick={() => handleOpenQuickView(inv.id, "sale")}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Recent Purchase Bills */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="text-blue-600 font-bold text-xs">📥</span>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Recent Purchase Bills
                </h2>
              </div>
              <Link href="/purchases" className="text-xs font-semibold text-blue-600 hover:underline">
                View All &rarr;
              </Link>
            </div>

            <div className="overflow-x-auto min-h-[220px]">
              {purchases.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No inward purchase bills recorded yet.
                  <div className="mt-2">
                    <Link
                      href="/purchases"
                      className="inline-block px-3 py-1.5 bg-slate-800 text-white rounded text-xs font-semibold hover:bg-slate-900"
                    >
                      + Record Purchase Bill
                    </Link>
                  </div>
                </div>
              ) : (
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Bill #</th>
                      <th>Vendor</th>
                      <th className="text-right">Amount (₹)</th>
                      <th className="text-center">Status</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.slice(0, 6).map((bill) => (
                      <tr key={bill.id}>
                        <td className="text-slate-500 whitespace-nowrap">{bill.invoice_date}</td>
                        <td className="font-mono font-semibold text-slate-900">{bill.invoice_number}</td>
                        <td className="font-medium text-slate-800 max-w-[140px] truncate">
                          {bill.party?.name || "Direct Supplier"}
                        </td>
                        <td className="text-right font-bold text-slate-900 whitespace-nowrap">
                          ₹{Number(bill.total_amount).toFixed(2)}
                        </td>
                        <td className="text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              bill.status === "confirmed"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : bill.status === "draft"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                          >
                            {bill.status}
                          </span>
                        </td>
                        <td className="text-right">
                          <button
                            onClick={() => handleOpenQuickView(bill.id, "purchase")}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* 4. Fast Operation Shortcuts Footer */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
            <span className="font-bold text-slate-900">⚡ Quick Actions:</span>
            <span>Fast navigation for counter billing and stock entry</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/sales"
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-semibold transition-colors"
            >
              + Create Sales Bill
            </Link>
            <Link
              href="/purchases"
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs font-semibold transition-colors"
            >
              + Inward Purchase
            </Link>
            <Link
              href="/inventory"
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs font-semibold transition-colors"
            >
              + Add Medicine
            </Link>
            <Link
              href="/parties"
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs font-semibold transition-colors"
            >
              + Add Customer / Vendor
            </Link>
          </div>
        </div>
      </div>

      {/* Invoice / Bill Quick View Modal */}
      {viewInvoice && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900">
                  {viewInvoiceType === "sale" ? "Sales Invoice" : "Purchase Bill"}: {viewInvoice.invoice_number}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    viewInvoice.status === "confirmed"
                      ? "bg-emerald-100 text-emerald-800"
                      : viewInvoice.status === "draft"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {viewInvoice.status}
                </span>
              </div>
              <button
                onClick={() => setViewInvoice(null)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    {viewInvoiceType === "sale" ? "Customer" : "Supplier / Vendor"}
                  </span>
                  <span className="font-bold text-slate-900 text-sm">
                    {viewInvoice.party?.name || "Cash Customer"}
                  </span>
                  {viewInvoice.party?.gst_number && (
                    <div className="text-slate-500 font-mono text-[11px]">
                      GSTIN: {viewInvoice.party.gst_number}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    Invoice Date
                  </span>
                  <span className="font-semibold text-slate-900">
                    {viewInvoice.invoice_date}
                  </span>
                  <div className="text-slate-500 text-[11px] mt-0.5">
                    GST Scheme: {viewInvoice.is_interstate ? "Inter-State (IGST)" : "Intra-State (CGST + SGST)"}
                  </div>
                </div>
              </div>

              {/* Line items table */}
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
                  {viewInvoice.lines?.map((line: any) => (
                    <tr key={line.id}>
                      <td className="font-semibold text-slate-900">
                        {line.item?.name || "Medicine Item"}
                      </td>
                      <td className="text-right font-mono">
                        {line.quantity} {line.item?.unit || "pcs"}
                      </td>
                      <td className="text-right font-mono">₹{Number(line.rate).toFixed(2)}</td>
                      <td className="text-right">{line.gst_rate}%</td>
                      <td className="text-right font-bold text-slate-900">
                        ₹{Number(line.line_total).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary Totals */}
              <div className="flex justify-end pt-3 border-t border-slate-200">
                <div className="w-64 space-y-1.5 text-right text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Taxable Amount:</span>
                    <span className="font-mono">
                      ₹{(Number(viewInvoice.total_amount) - Number(viewInvoice.gst_amount)).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Total GST Amount:</span>
                    <span className="font-mono text-blue-700">
                      ₹{Number(viewInvoice.gst_amount).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-slate-900 pt-1.5 border-t border-slate-200">
                    <span>Grand Total:</span>
                    <span className="font-mono text-emerald-700">
                      ₹{Number(viewInvoice.total_amount).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setViewInvoice(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
