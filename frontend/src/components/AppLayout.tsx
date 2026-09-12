"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, Company } from "../context/AuthContext";

interface AppLayoutProps {
  children: React.ReactNode;
  pageTitle?: string;
  pageSubtitle?: string;
  headerActions?: React.ReactNode;
}

export default function AppLayout({
  children,
  pageTitle,
  pageSubtitle,
  headerActions,
}: AppLayoutProps) {
  const {
    user,
    companies,
    activeCompany,
    selectCompany,
    createCompany,
    logout,
  } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyGst, setNewCompanyGst] = useState("");
  const [newCompanyAddress, setNewCompanyAddress] = useState("");
  const [newCompanyState, setNewCompanyState] = useState("Maharashtra");
  const [createCompanyLoading, setCreateCompanyLoading] = useState(false);
  const [companyModalError, setCompanyModalError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setCompanyDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navItems = [
    {
      label: "Dashboard",
      href: "/",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      label: "Items & Catalog",
      href: "/inventory",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      label: "Parties Directory",
      href: "/parties",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: "Purchase Bills",
      href: "/purchases",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      ),
    },
    {
      label: "Sales Invoices",
      href: "/sales",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      label: "Cash Ledger",
      href: "/cash-ledger",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
  ];

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) {
      setCompanyModalError("Company name is required.");
      return;
    }
    setCreateCompanyLoading(true);
    setCompanyModalError(null);
    try {
      const fullAddress = newCompanyAddress
        ? `${newCompanyAddress}, ${newCompanyState}`
        : newCompanyState;
      const res = await createCompany(newCompanyName, newCompanyGst, fullAddress);
      if (res.success && res.company) {
        selectCompany(res.company);
        setShowAddCompanyModal(false);
        setNewCompanyName("");
        setNewCompanyGst("");
        setNewCompanyAddress("");
      } else {
        setCompanyModalError(res.error || "Failed to create company.");
      }
    } catch (err: any) {
      setCompanyModalError(err.message || "Failed to create company.");
    } finally {
      setCreateCompanyLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* 1. Persistent Left Sidebar */}
      <aside className="w-60 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 select-none z-30">
        <div>
          {/* Brand Header */}
          <div className="h-14 px-4 border-b border-slate-200 flex items-center gap-2.5 bg-slate-900 text-white">
            <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center font-bold text-sm tracking-wider text-white shadow-sm">
              TF
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm leading-tight tracking-tight text-white">
                Trade Flow
              </span>
              <span className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">
                Pharmacy ERP
              </span>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="p-3 space-y-1">
            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Main Menu
            </div>
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700 font-semibold border-l-4 border-blue-600 pl-2 shadow-xs"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span
                    className={`${
                      isActive ? "text-blue-600" : "text-slate-400"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: Active Company Summary */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/80">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Current Business
          </div>
          {activeCompany ? (
            <div className="bg-white border border-slate-200 rounded p-2 text-xs shadow-2xs">
              <div className="font-bold text-slate-900 truncate" title={activeCompany.name}>
                {activeCompany.name}
              </div>
              <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                <span className="truncate">{activeCompany.gst_number || "No GSTIN"}</span>
                <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold text-[10px] uppercase">
                  {activeCompany.role}
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded p-2 text-[11px] text-amber-800">
              No shop selected. Click above to pick.
            </div>
          )}
        </div>
      </aside>

      {/* 2. Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Utility Header Bar */}
        <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 z-20 shadow-2xs">
          {/* Page Title / Breadcrumb */}
          <div className="flex items-center gap-3">
            {pageTitle && (
              <div>
                <h1 className="text-base font-bold text-slate-900 leading-tight">
                  {pageTitle}
                </h1>
                {pageSubtitle && (
                  <p className="text-xs text-slate-500 hidden sm:block">
                    {pageSubtitle}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right Top Actions */}
          <div className="flex items-center gap-3">
            {/* Quick Action Buttons */}
            <div className="hidden md:flex items-center gap-2 mr-2">
              <Link
                href="/sales"
                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                <span>New Sale (F8)</span>
              </Link>
              <Link
                href="/purchases"
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                <span>New Purchase (F9)</span>
              </Link>
            </div>

            {/* Custom page header actions */}
            {headerActions && <div>{headerActions}</div>}

            {/* Company Switcher Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
                className="h-8 px-3 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span className="font-semibold max-w-[140px] truncate text-slate-900">
                  {activeCompany ? activeCompany.name : "Select Company"}
                </span>
                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {companyDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-md shadow-lg py-1.5 z-50 text-xs">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Switch Shop / Branch
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {companies.map((comp) => {
                      const isSelected = activeCompany?.id === comp.id;
                      return (
                        <button
                          key={comp.id}
                          type="button"
                          onClick={() => {
                            selectCompany(comp);
                            setCompanyDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-blue-50 transition-colors ${
                            isSelected ? "bg-blue-50/70 font-bold text-blue-900" : "text-slate-800"
                          }`}
                        >
                          <div className="truncate mr-2">
                            <div className="truncate font-semibold">{comp.name}</div>
                            <div className="text-[10px] text-slate-400 font-normal truncate">
                              {comp.gst_number || "Unregistered GST"}
                            </div>
                          </div>
                          {isSelected && (
                            <span className="text-blue-600 font-bold text-sm">✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="border-t border-slate-200 mt-1 pt-1 px-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCompanyDropdownOpen(false);
                        setShowAddCompanyModal(true);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 text-blue-600 font-semibold flex items-center gap-1.5 text-xs transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>+ Add New Shop / Branch</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Logged in User Pill & Sign Out */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="font-semibold text-slate-900">
                  {user?.username || "Account"}
                </span>
              </div>
              <button
                type="button"
                onClick={logout}
                title="Sign Out"
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Main View Area */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>

      {/* Quick Add Company Modal */}
      {showAddCompanyModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Register New Shop / Branch
              </h3>
              <button
                onClick={() => setShowAddCompanyModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateCompany} className="p-5 space-y-4">
              {companyModalError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {companyModalError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Shop / Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apollo Medical Store"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GSTIN Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 27AABCS1234F1Z1"
                    value={newCompanyGst}
                    onChange={(e) => setNewCompanyGst(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs uppercase focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Operating State
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Maharashtra"
                    value={newCompanyState}
                    onChange={(e) => setNewCompanyState(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Address (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Shop number, street, area, city"
                  value={newCompanyAddress}
                  onChange={(e) => setNewCompanyAddress(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900 resize-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddCompanyModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createCompanyLoading}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-2xs transition-colors"
                >
                  {createCompanyLoading ? "Creating..." : "Save Shop"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
