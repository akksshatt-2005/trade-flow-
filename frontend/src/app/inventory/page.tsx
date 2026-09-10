"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, Company } from "../../context/AuthContext";

export interface Item {
  id: string;
  company_id: string;
  name: string;
  sku?: string | null;
  hsn_code?: string | null;
  gst_rate: number;
  unit: string;
  opening_stock: number;
  reorder_threshold: number;
  current_stock: number;
  is_low_stock: boolean;
  created_at: string;
}

export interface StockLedgerEntry {
  id: string;
  company_id: string;
  item_id: string;
  movement_type: "purchase_in" | "sale_out" | "adjustment_in" | "adjustment_out";
  quantity: number;
  reference_type: string;
  reference_id?: string | null;
  created_at: string;
}

export default function InventoryPage() {
  const {
    user,
    companies,
    activeCompany,
    selectCompany,
    loading: authLoading,
    logout,
    apiFetch,
  } = useAuth();

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showLedgerModal, setShowLedgerModal] = useState(false);

  // Selected item for adjust / ledger
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<StockLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Add item form state
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [gstRate, setGstRate] = useState("12");
  const [unit, setUnit] = useState("strip");
  const [openingStock, setOpeningStock] = useState("0");
  const [reorderThreshold, setReorderThreshold] = useState("10");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Adjust stock form state
  const [adjustType, setAdjustType] = useState<"adjustment_in" | "adjustment_out">("adjustment_in");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

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

  // Fetch Items list for active company
  const loadItems = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/items");
      const data = await res.json();
      if (res.ok) {
        setItems(data.items || []);
      } else {
        setError(data.message || "Failed to load inventory items.");
      }
    } catch {
      setError("Network error loading inventory items.");
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
      loadItems();
    }
  }, [user, activeCompany, authLoading, router, loadItems]);

  // Handle Add Item Submit
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Item name is required.");
      return;
    }

    setFormError(null);
    setFormSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        sku: sku.trim() || undefined,
        hsn_code: hsnCode.trim() || undefined,
        gst_rate: Number(gstRate) || 0,
        unit: unit.trim() || "pcs",
        opening_stock: Number(openingStock) || 0,
        reorder_threshold: Number(reorderThreshold) || 0,
      };

      const res = await apiFetch("/items", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        setName("");
        setSku("");
        setHsnCode("");
        setOpeningStock("0");
        setReorderThreshold("10");
        setShowAddModal(false);
        loadItems();
      } else {
        setFormError(data.message || "Failed to create item.");
      }
    } catch {
      setFormError("Unexpected error creating item.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Stock Adjustment Submit
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    const qty = Number(adjustQty);
    if (isNaN(qty) || qty <= 0) {
      setAdjustError("Please enter a valid quantity greater than zero.");
      return;
    }

    if (!adjustReason.trim()) {
      setAdjustError("A reason is required for manual stock adjustments.");
      return;
    }

    if (adjustType === "adjustment_out" && selectedItem.current_stock - qty < 0) {
      setAdjustError(
        `Cannot reduce stock below zero. Current stock is ${selectedItem.current_stock} ${selectedItem.unit}.`,
      );
      return;
    }

    setAdjustError(null);
    setAdjustSubmitting(true);

    try {
      const res = await apiFetch(`/items/${selectedItem.id}/adjust-stock`, {
        method: "POST",
        body: JSON.stringify({
          adjustment_type: adjustType,
          quantity: qty,
          reason: adjustReason.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setAdjustQty("");
        setAdjustReason("");
        setShowAdjustModal(false);
        loadItems();
      } else {
        setAdjustError(data.message || "Stock adjustment failed.");
      }
    } catch {
      setAdjustError("Network error while adjusting stock.");
    } finally {
      setAdjustSubmitting(false);
    }
  };

  // Open Ledger History Modal
  const openLedgerModal = async (item: Item) => {
    setSelectedItem(item);
    setShowLedgerModal(true);
    setLedgerLoading(true);
    try {
      const res = await apiFetch(`/items/${item.id}/ledger`);
      const data = await res.json();
      if (res.ok) {
        setLedgerEntries(data.ledger || []);
      } else {
        setLedgerEntries([]);
      }
    } catch {
      setLedgerEntries([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.hsn_code && item.hsn_code.includes(searchTerm));

    const matchesLowStock = filterLowStockOnly ? item.is_low_stock : true;
    return matchesSearch && matchesLowStock;
  });

  const totalItemsCount = items.length;
  const lowStockCount = items.filter((i) => i.is_low_stock).length;
  const totalStockUnits = items.reduce((acc, curr) => acc + curr.current_stock, 0);

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
                className="px-3 py-1.5 rounded-lg bg-cyan-950/80 text-cyan-300 font-medium border border-cyan-800/60"
              >
                📦 Items & Catalog
              </Link>
              <Link
                href="/parties"
                className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                👥 Parties Directory
              </Link>
            </nav>
          </div>

          {/* User & Company Control */}
          <div className="flex items-center gap-3">
            {/* Switch Company Control Dropdown */}
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
              <span>💊</span>
              <span>Stock Ledger-Grounded Inventory</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Medicine & Item Catalog
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1">
              Active Store: <span className="text-white font-semibold">{activeCompany?.name}</span>
            </p>
          </div>

          {/* Quick KPI stats */}
          <div className="flex items-center gap-3">
            <div className="bg-slate-900/80 border border-slate-800 px-4 py-2.5 rounded-2xl">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block">
                Total SKUs
              </span>
              <span className="text-lg font-extrabold text-white font-mono">
                {totalItemsCount}
              </span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 px-4 py-2.5 rounded-2xl">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block">
                Total Stock
              </span>
              <span className="text-lg font-extrabold text-cyan-300 font-mono">
                {totalStockUnits.toLocaleString()}
              </span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 px-4 py-2.5 rounded-2xl">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block">
                Low Stock Alerts
              </span>
              <span
                className={`text-lg font-extrabold font-mono ${
                  lowStockCount > 0 ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {lowStockCount}
              </span>
            </div>

            <button
              id="add-item-btn"
              onClick={() => setShowAddModal(true)}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-xs transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-2 cursor-pointer ml-2"
            >
              <span>+ Add Medicine / Item</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 mb-6 backdrop-blur-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-96">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, SKU, or HSN code..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
            <span className="absolute left-3 top-2.5 text-slate-500 text-xs">🔍</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <button
              onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                filterLowStockOnly
                  ? "bg-rose-950/60 border-rose-800/80 text-rose-300 shadow-md shadow-rose-950/30"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              🚨 Low Stock Filter {lowStockCount > 0 && `(${lowStockCount})`}
            </button>

            <button
              onClick={loadItems}
              disabled={loading}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white text-xs transition-colors cursor-pointer"
            >
              {loading ? "Refreshing..." : "🔄 Refresh"}
            </button>
          </div>
        </div>

        {/* Items Table */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-sm">
          {loading ? (
            <div className="py-20 text-center text-cyan-400 flex items-center justify-center gap-3">
              <span className="h-5 w-5 border-2 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin" />
              <span className="text-xs font-medium">Calculating stock from ledger...</span>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-rose-400 text-xs">{error}</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center">
              <div className="h-12 w-12 rounded-2xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-xl mx-auto mb-3">
                💊
              </div>
              <h3 className="text-sm font-semibold text-white">No Medicines or Items Found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {searchTerm
                  ? "No products match your search query."
                  : "Get started by adding your first medicine or product to this company catalog."}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20"
                >
                  + Add First Item
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-950/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="py-3.5 px-6">Product / Medicine</th>
                    <th className="py-3.5 px-4">SKU / Code</th>
                    <th className="py-3.5 px-4">HSN</th>
                    <th className="py-3.5 px-4">GST Rate</th>
                    <th className="py-3.5 px-4">Current Stock</th>
                    <th className="py-3.5 px-4">Stock Status</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="py-4 px-6">
                        <div className="font-semibold text-white group-hover:text-cyan-300 transition-colors">
                          {item.name}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Unit: {item.unit} &bull; Initial: {item.opening_stock} {item.unit}
                        </div>
                      </td>

                      <td className="py-4 px-4 font-mono text-slate-300">
                        {item.sku ? (
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px]">
                            {item.sku}
                          </span>
                        ) : (
                          <span className="text-slate-600 italic">None</span>
                        )}
                      </td>

                      <td className="py-4 px-4 font-mono text-slate-400">
                        {item.hsn_code || <span className="text-slate-600">-</span>}
                      </td>

                      <td className="py-4 px-4 font-mono text-slate-300">
                        {item.gst_rate}%
                      </td>

                      <td className="py-4 px-4 font-mono font-bold">
                        <span
                          className={`text-sm ${
                            item.current_stock <= 0
                              ? "text-rose-400"
                              : item.is_low_stock
                              ? "text-amber-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {item.current_stock.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-slate-500 ml-1 font-normal">
                          {item.unit}
                        </span>
                      </td>

                      <td className="py-4 px-4">
                        {item.current_stock <= 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-950/60 border border-rose-800/80 text-rose-300 text-[10px] font-semibold uppercase">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                            Out of Stock
                          </span>
                        ) : item.is_low_stock ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-950/60 border border-amber-800/80 text-amber-300 text-[10px] font-semibold uppercase">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                            Low Stock (&le;{item.reorder_threshold})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-[10px] font-semibold uppercase">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                            Adequate
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-right space-x-2">
                        <button
                          onClick={() => {
                            setSelectedItem(item);
                            setAdjustQty("");
                            setAdjustReason("");
                            setAdjustError(null);
                            setShowAdjustModal(true);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-medium border border-slate-700 transition-colors cursor-pointer"
                        >
                          ⚡ Adjust Stock
                        </button>
                        <button
                          onClick={() => openLedgerModal(item)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white text-[11px] font-medium border border-slate-800 transition-colors cursor-pointer"
                        >
                          📜 Ledger
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

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-white">Add New Medicine / Product</h3>
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

            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Medicine / Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Paracetamol 650mg Tablets"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    SKU Code (Unique per Store)
                  </label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="e.g. PARA-650"
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    HSN Code
                  </label>
                  <input
                    type="text"
                    value={hsnCode}
                    onChange={(e) => setHsnCode(e.target.value)}
                    placeholder="e.g. 3004"
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Unit Type
                  </label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  >
                    <option value="strip">Strip</option>
                    <option value="bottle">Bottle</option>
                    <option value="vial">Vial</option>
                    <option value="pcs">Pieces (Pcs)</option>
                    <option value="box">Box</option>
                    <option value="tube">Tube</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    GST Rate (%)
                  </label>
                  <select
                    value={gstRate}
                    onChange={(e) => setGstRate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  >
                    <option value="0">0% (Exempt)</option>
                    <option value="5">5% (Essential Medicines)</option>
                    <option value="12">12% (Standard Formulations)</option>
                    <option value="18">18% (Cosmetics / General)</option>
                    <option value="28">28%</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Opening Stock Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={openingStock}
                    onChange={(e) => setOpeningStock(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Writes initial adjustment_in to stock_ledger.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Low Stock Reorder Alert (&le;)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={reorderThreshold}
                    onChange={(e) => setReorderThreshold(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Triggers warning badge when stock drops to or below this.
                  </p>
                </div>
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
                  {formSubmitting ? "Saving..." : "Add to Catalog"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {showAdjustModal && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Manual Stock Adjustment</h3>
                <p className="text-xs text-slate-400">{selectedItem.name}</p>
              </div>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="text-slate-400 hover:text-white text-sm p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Current Stock Banner */}
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 mb-4 flex items-center justify-between text-xs">
              <span className="text-slate-400">Current Grounded Stock:</span>
              <span className="font-mono font-bold text-cyan-300 text-sm">
                {selectedItem.current_stock} {selectedItem.unit}
              </span>
            </div>

            {adjustError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs">
                ⚠️ {adjustError}
              </div>
            )}

            <form onSubmit={handleAdjustStock} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Adjustment Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType("adjustment_in")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      adjustType === "adjustment_in"
                        ? "bg-emerald-950/80 border-emerald-600 text-emerald-300 ring-1 ring-emerald-500/50"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    + Add Stock (In)
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdjustType("adjustment_out")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      adjustType === "adjustment_out"
                        ? "bg-rose-950/80 border-rose-600 text-rose-300 ring-1 ring-rose-500/50"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    - Reduce Stock (Out)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Quantity ({selectedItem.unit}) *
                </label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  placeholder="e.g. 20"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Adjustment Reason *
                </label>
                <textarea
                  rows={2}
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Physical inventory recount / Expiry write-off"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              {/* Live Preview */}
              {adjustQty && !isNaN(Number(adjustQty)) && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] flex items-center justify-between font-mono">
                  <span className="text-slate-400">Projected Balance:</span>
                  <span
                    className={`font-bold ${
                      adjustType === "adjustment_out" &&
                      selectedItem.current_stock - Number(adjustQty) < 0
                        ? "text-rose-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {adjustType === "adjustment_in"
                      ? selectedItem.current_stock + Number(adjustQty)
                      : selectedItem.current_stock - Number(adjustQty)}{" "}
                    {selectedItem.unit}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustSubmitting || !adjustQty || !adjustReason.trim()}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-lg shadow-cyan-600/20 disabled:opacity-50"
                >
                  {adjustSubmitting ? "Writing Ledger..." : "Apply Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Movement Ledger Audit Modal */}
      {showLedgerModal && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800">
              <div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-950/60 border border-purple-800/80 text-purple-300 text-[10px] font-mono mb-1">
                  Append-Only Audit Log
                </div>
                <h3 className="text-base font-bold text-white">{selectedItem.name}</h3>
                <p className="text-xs text-slate-400 font-mono">
                  SKU: {selectedItem.sku || "N/A"} &bull; Current Stock:{" "}
                  <span className="text-emerald-400 font-bold">
                    {selectedItem.current_stock} {selectedItem.unit}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setShowLedgerModal(false)}
                className="text-slate-400 hover:text-white text-sm p-1.5 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Ledger List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {ledgerLoading ? (
                <div className="py-12 text-center text-cyan-400 text-xs">
                  Loading movement transactions...
                </div>
              ) : ledgerEntries.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No stock movements recorded yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {ledgerEntries.map((entry, idx) => {
                    const isPositive =
                      entry.movement_type === "purchase_in" ||
                      entry.movement_type === "adjustment_in";
                    return (
                      <div
                        key={entry.id}
                        className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-slate-600 font-mono text-[10px]">
                            #{idx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] uppercase font-mono px-2 py-0.2 rounded-full font-semibold ${
                                  entry.movement_type === "purchase_in"
                                    ? "bg-blue-950 text-blue-300 border border-blue-800/60"
                                    : entry.movement_type === "adjustment_in"
                                    ? "bg-emerald-950 text-emerald-300 border border-emerald-800/60"
                                    : entry.movement_type === "sale_out"
                                    ? "bg-amber-950 text-amber-300 border border-amber-800/60"
                                    : "bg-rose-950 text-rose-300 border border-rose-800/60"
                                }`}
                              >
                                {entry.movement_type.replace("_", " ")}
                              </span>
                              <span className="text-slate-300 font-medium text-[11px]">
                                {entry.reference_type}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-1 font-mono">
                              {new Date(entry.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div className="font-mono font-bold text-sm">
                          <span className={isPositive ? "text-emerald-400" : "text-rose-400"}>
                            {isPositive ? `+${entry.quantity}` : `-${entry.quantity}`}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-1 font-normal">
                            {selectedItem.unit}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 mt-4 text-center">
              <p className="text-[10px] text-slate-500">
                🛡️ Enforced by PostgreSQL trigger: UPDATE and DELETE are strictly forbidden.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-600">
        Trade Flow Medicine Inventory Engine &bull; Phase 3 Active
      </footer>
    </div>
  );
}
