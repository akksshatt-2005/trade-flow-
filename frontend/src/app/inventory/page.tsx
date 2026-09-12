"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import AppLayout from "../../components/AppLayout";

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
  const { user, token, activeCompany, loading: authLoading, apiFetch } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Selected item for adjust / ledger / edit
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<StockLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Form states - Add Item
  const [newName, setNewName] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newHsn, setNewHsn] = useState("");
  const [newGstRate, setNewGstRate] = useState<number>(12);
  const [newUnit, setNewUnit] = useState("strip");
  const [newOpeningStock, setNewOpeningStock] = useState<number>(0);
  const [newReorderThreshold, setNewReorderThreshold] = useState<number>(10);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Form states - Adjust Stock
  const [adjustType, setAdjustType] = useState<"adjustment_in" | "adjustment_out">("adjustment_in");
  const [adjustQuantity, setAdjustQuantity] = useState<number>(1);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Form states - Edit Item
  const [editName, setEditName] = useState("");
  const [editHsn, setEditHsn] = useState("");
  const [editGstRate, setEditGstRate] = useState<number>(12);
  const [editUnit, setEditUnit] = useState("strip");
  const [editReorderThreshold, setEditReorderThreshold] = useState<number>(10);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // 1. Fetch Items
  const fetchItems = useCallback(async () => {
    if (!token || !activeCompany?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/items");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Failed to load medicine catalog.");
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
      fetchItems();
    }
  }, [authLoading, user, activeCompany?.id, fetchItems, router]);

  // 2. Add New Item
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setAddError("Medicine name is required.");
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await apiFetch("/items", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          sku: newSku.trim() || undefined,
          hsn_code: newHsn.trim() || undefined,
          gst_rate: Number(newGstRate),
          unit: newUnit.trim(),
          opening_stock: Number(newOpeningStock),
          reorder_threshold: Number(newReorderThreshold),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowAddModal(false);
        setNewName("");
        setNewSku("");
        setNewHsn("");
        setNewOpeningStock(0);
        setNewReorderThreshold(10);
        fetchItems();
      } else {
        setAddError(data.message || "Failed to add item.");
      }
    } catch (err: any) {
      setAddError(err.message || "Network error adding item.");
    } finally {
      setAddLoading(false);
    }
  };

  // 3. Adjust Stock
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (adjustQuantity <= 0) {
      setAdjustError("Adjustment quantity must be greater than zero.");
      return;
    }
    setAdjustLoading(true);
    setAdjustError(null);
    try {
      const res = await apiFetch(`/items/${selectedItem.id}/adjust-stock`, {
        method: "POST",
        body: JSON.stringify({
          movement_type: adjustType,
          quantity: Number(adjustQuantity),
          reason: adjustReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowAdjustModal(false);
        setAdjustQuantity(1);
        setAdjustReason("");
        setSelectedItem(null);
        fetchItems();
      } else {
        setAdjustError(data.message || "Failed to adjust stock.");
      }
    } catch (err: any) {
      setAdjustError(err.message || "Network error adjusting stock.");
    } finally {
      setAdjustLoading(false);
    }
  };

  // 4. View Stock Ledger Drawer
  const handleViewLedger = async (item: Item) => {
    setSelectedItem(item);
    setShowLedgerModal(true);
    setLedgerLoading(true);
    try {
      const res = await apiFetch(`/items/${item.id}/ledger`);
      if (res.ok) {
        const data = await res.json();
        setLedgerEntries(data.ledger || []);
      }
    } catch {
      // Ignore
    } finally {
      setLedgerLoading(false);
    }
  };

  // 5. Open Edit Modal
  const handleOpenEdit = (item: Item) => {
    setSelectedItem(item);
    setEditName(item.name);
    setEditHsn(item.hsn_code || "");
    setEditGstRate(item.gst_rate);
    setEditUnit(item.unit);
    setEditReorderThreshold(item.reorder_threshold);
    setShowEditModal(true);
  };

  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await apiFetch(`/items/${selectedItem.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          hsn_code: editHsn.trim() || undefined,
          gst_rate: Number(editGstRate),
          unit: editUnit.trim(),
          reorder_threshold: Number(editReorderThreshold),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowEditModal(false);
        setSelectedItem(null);
        fetchItems();
      } else {
        setEditError(data.message || "Failed to update item.");
      }
    } catch (err: any) {
      setEditError(err.message || "Network error updating item.");
    } finally {
      setEditLoading(false);
    }
  };

  // Filter items based on search and low-stock toggle
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      searchTerm.trim() === "" ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.hsn_code && item.hsn_code.toLowerCase().includes(searchTerm.toLowerCase()));

    const isLow =
      item.reorder_threshold > 0 &&
      Number(item.current_stock) <= Number(item.reorder_threshold);

    if (filterLowStockOnly) {
      return matchesSearch && isLow;
    }
    return matchesSearch;
  });

  const lowStockCount = items.filter(
    (i) => i.reorder_threshold > 0 && Number(i.current_stock) <= Number(i.reorder_threshold),
  ).length;

  return (
    <AppLayout
      pageTitle="Medicine & Inventory Catalog"
      pageSubtitle={`Manage items, track live stock ledger, and monitor reorder levels for ${activeCompany?.name || "your shop"}`}
      headerActions={
        <div className="flex items-center gap-2">
          <Link
            href="/import?type=items"
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
            <span>+ Add New Medicine</span>
          </button>
        </div>
      }
    >
      <div className="space-y-4 max-w-7xl mx-auto">
        {/* Search & Filter Toolbar */}
        <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="Search by Medicine Name, SKU, or HSN Code..."
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
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Low Stock Toggle Button */}
            <button
              type="button"
              onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
              className={`px-3 py-1.5 rounded text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                filterLowStockOnly
                  ? "bg-red-50 border-red-300 text-red-700"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${lowStockCount > 0 ? "bg-red-600" : "bg-slate-400"}`}></span>
              <span>Low Stock Alerts ({lowStockCount})</span>
            </button>

            <span className="text-xs text-slate-500">
              Showing <strong>{filteredItems.length}</strong> of {items.length} items
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-xs font-medium">
            {error}
          </div>
        )}

        {/* Main Dense Items Table */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="overflow-x-auto min-h-[350px]">
            {loading ? (
              <div className="p-12 text-center text-xs text-slate-500">
                <div className="inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                <div>Loading catalog...</div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">
                {searchTerm || filterLowStockOnly
                  ? "No medicines match your search / filter."
                  : "No medicines in catalog yet. Click '+ Add New Medicine' above."}
              </div>
            ) : (
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>SKU Code</th>
                    <th>Medicine / Item Name</th>
                    <th>HSN</th>
                    <th>GST %</th>
                    <th>Unit</th>
                    <th className="text-right">Opening</th>
                    <th className="text-right">Current Stock</th>
                    <th className="text-right">Reorder Level</th>
                    <th className="text-center">Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const isLow =
                      item.reorder_threshold > 0 &&
                      Number(item.current_stock) <= Number(item.reorder_threshold);
                    return (
                      <tr key={item.id} className={isLow ? "bg-red-50/30" : ""}>
                        <td className="font-mono text-slate-500 font-medium">
                          {item.sku || "—"}
                        </td>
                        <td className="font-bold text-slate-900 max-w-xs truncate">
                          {item.name}
                        </td>
                        <td className="font-mono text-slate-600">{item.hsn_code || "—"}</td>
                        <td className="text-slate-700">{item.gst_rate}%</td>
                        <td className="text-slate-600 uppercase text-[11px] font-semibold">
                          {item.unit}
                        </td>
                        <td className="text-right text-slate-500 font-mono">
                          {Number(item.opening_stock)}
                        </td>
                        <td className="text-right font-mono font-bold">
                          <span
                            className={
                              isLow
                                ? "text-red-700 bg-red-100 px-2 py-0.5 rounded border border-red-200"
                                : "text-slate-900"
                            }
                          >
                            {Number(item.current_stock)}
                          </span>
                        </td>
                        <td className="text-right text-slate-600 font-mono">
                          {Number(item.reorder_threshold)}
                        </td>
                        <td className="text-center">
                          {isLow ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 uppercase tracking-wider">
                              Low Stock
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
                              In Stock
                            </span>
                          )}
                        </td>
                        <td className="text-right whitespace-nowrap space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedItem(item);
                              setShowAdjustModal(true);
                            }}
                            className="text-xs font-semibold text-slate-700 hover:text-blue-700 hover:underline cursor-pointer"
                          >
                            Adjust
                          </button>
                          <button
                            type="button"
                            onClick={() => handleViewLedger(item)}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                          >
                            Ledger
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                          >
                            Edit
                          </button>
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

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Add New Medicine / Product Item
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAddItem} className="p-5 space-y-4">
              {addError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {addError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Medicine / Item Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amoxicillin 500mg Capsules"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 font-semibold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    SKU Code (Unique per shop)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AMX-500"
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    HSN Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 30041010"
                    value={newHsn}
                    onChange={(e) => setNewHsn(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GST Rate (%)
                  </label>
                  <select
                    value={newGstRate}
                    onChange={(e) => setNewGstRate(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 bg-white"
                  >
                    <option value={0}>0% (Exempt)</option>
                    <option value={5}>5%</option>
                    <option value={12}>12% (Standard Pharma)</option>
                    <option value={18}>18%</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Unit
                  </label>
                  <select
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 bg-white"
                  >
                    <option value="strip">Strip</option>
                    <option value="box">Box</option>
                    <option value="bottle">Bottle</option>
                    <option value="vial">Vial</option>
                    <option value="pcs">Pieces</option>
                    <option value="tablet">Tablet</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Opening Stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={newOpeningStock}
                    onChange={(e) => setNewOpeningStock(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reorder Threshold Level (for Low Stock alerts)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={newReorderThreshold}
                  onChange={(e) => setNewReorderThreshold(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
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
                  {addLoading ? "Saving..." : "Save to Catalog"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {showAdjustModal && selectedItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Manual Stock Adjustment
                </h3>
                <p className="text-[11px] text-slate-500">
                  {selectedItem.name} (Current: <strong>{selectedItem.current_stock} {selectedItem.unit}</strong>)
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAdjustModal(false);
                  setSelectedItem(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAdjustStock} className="p-5 space-y-4">
              {adjustError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {adjustError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Adjustment Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType("adjustment_in")}
                    className={`py-2 px-3 rounded border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      adjustType === "adjustment_in"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-800 font-bold"
                        : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>+ Add Stock In</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType("adjustment_out")}
                    className={`py-2 px-3 rounded border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      adjustType === "adjustment_out"
                        ? "bg-red-50 border-red-500 text-red-800 font-bold"
                        : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>- Reduce Stock Out</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantity ({selectedItem.unit}) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={adjustQuantity}
                  onChange={(e) => setAdjustQuantity(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono font-bold focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Adjustment Reason / Notes (e.g. Damaged, Physical Audit Correction)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Expired batch removal / Physical audit count"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdjustModal(false);
                    setSelectedItem(null);
                  }}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustLoading}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-2xs transition-colors"
                >
                  {adjustLoading ? "Recording..." : "Post Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Ledger History Drawer / Modal */}
      {showLedgerModal && selectedItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Stock Movement Audit Ledger
                </h3>
                <p className="text-[11px] text-slate-500">
                  {selectedItem.name} &bull; SKU: {selectedItem.sku || "—"} &bull; Balance: <strong>{selectedItem.current_stock} {selectedItem.unit}</strong>
                </p>
              </div>
              <button
                onClick={() => {
                  setShowLedgerModal(false);
                  setSelectedItem(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-5 max-h-[70vh] overflow-y-auto">
              {ledgerLoading ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Loading ledger audit trail...
                </div>
              ) : ledgerEntries.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No stock transactions found for this item.
                </div>
              ) : (
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Date / Time</th>
                      <th>Movement Type</th>
                      <th>Reference Type</th>
                      <th className="text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map((entry) => {
                      const isInward =
                        entry.movement_type === "purchase_in" ||
                        entry.movement_type === "adjustment_in";
                      return (
                        <tr key={entry.id}>
                          <td className="text-slate-500 text-[11px] whitespace-nowrap">
                            {new Date(entry.created_at).toLocaleString("en-IN")}
                          </td>
                          <td>
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                isInward
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-red-50 text-red-700 border border-red-200"
                              }`}
                            >
                              {entry.movement_type.replace("_", " ")}
                            </span>
                          </td>
                          <td className="font-mono text-[11px] text-slate-600">
                            {entry.reference_type}
                          </td>
                          <td
                            className={`text-right font-mono font-bold ${
                              isInward ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {isInward ? "+" : "-"}
                            {Number(entry.quantity)} {selectedItem.unit}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowLedgerModal(false);
                  setSelectedItem(null);
                }}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold"
              >
                Close Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showEditModal && selectedItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Edit Medicine Details
              </h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedItem(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleEditItem} className="p-5 space-y-4">
              {editError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {editError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Medicine Name <span className="text-red-500">*</span>
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
                    HSN Code
                  </label>
                  <input
                    type="text"
                    value={editHsn}
                    onChange={(e) => setEditHsn(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GST Rate (%)
                  </label>
                  <select
                    value={editGstRate}
                    onChange={(e) => setEditGstRate(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 bg-white"
                  >
                    <option value={0}>0% (Exempt)</option>
                    <option value={5}>5%</option>
                    <option value={12}>12% (Standard Pharma)</option>
                    <option value={18}>18%</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reorder Threshold
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editReorderThreshold}
                    onChange={(e) => setEditReorderThreshold(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedItem(null);
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
    </AppLayout>
  );
}
