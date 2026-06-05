"use client";

import { useEffect, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Calendar,
  Wallet,
  Tag,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ChevronRight,
  LogOut,
  LockOpen,
  Lock,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Domain interfaces ─────────────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
}

interface Asset {
  id: string;
  name: string;
  display_code?: string;
  instrument_symbol?: string;
}

interface RealizedGain {
  assetId: string;
  accountId: string;
  sellDate: string;
  quantity: number;
  sellPrice: number;
  sellFee: number;
  sellPriceOriginal: number;
  sellFeeOriginal: number;
  sellFxRate: number;
  sellCurrency: string;
  costBasis: number;
  gain: number;
  matchedLots: {
    buyDate: string;
    quantity: number;
    buyPrice: number;
    buyPriceOriginal: number;
    buyFeeOriginal: number;
    buyFxRate: number;
    currency: string;
    splitFactor: number;
  }[];
}

interface OpenPositionLot {
  buyDate: string;
  quantity: number;
  unitPriceOriginal: number;
  fxRate: number;
  currency: string;
  splitFactor: number;
  feeOriginal: number;
  feeEUR: number;
  costEUR: number;
}

interface OpenPosition {
  assetId: string;
  accountId: string;
  totalQuantity: number;
  avgUnitPriceEUR: number;
  totalCostEUR: number;
  totalFeesEUR: number;
  lots: OpenPositionLot[];
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return dateStr.slice(0, 10);
}

function fmtOrig(value: number, currency: string) {
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${currency}`;
}

function fmtEUR(value: number) {
  return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function fmtFX(rate: number, currency: string) {
  if (currency === 'EUR') return '—';
  return rate.toLocaleString('es-ES', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

// Renders value in original currency with EUR equivalent below (when currency ≠ EUR)
function WithEur({
  value,
  currency,
  fxRate,
  zero = '—',
}: {
  value: number;
  currency: string;
  fxRate: number;
  zero?: string;
}) {
  if (value === 0 && zero === '—') return <span className="text-muted-foreground">{zero}</span>;
  if (currency === 'EUR') return <span>{fmtEUR(value)}</span>;
  return (
    <span className="flex flex-col items-end leading-tight gap-0.5">
      <span>{fmtOrig(value, currency)}</span>
      <span className="text-[10px] text-muted-foreground/70">{fmtEUR(value * fxRate)}</span>
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type ActiveView = 'closed' | 'open';

export default function TaxesDashboard() {
  const router = useRouter();

  // Filter state
  const [accounts, setAccounts]           = useState<Account[]>([]);
  const [accountGroups, setAccountGroups] = useState<string[]>([]);
  const [assets, setAssets]               = useState<Asset[]>([]);
  const [selectedYear, setSelectedYear]   = useState<string>("");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [selectedAsset, setSelectedAsset] = useState<string>("");

  // View state
  const [activeView, setActiveView]       = useState<ActiveView>('closed');

  // Data state
  const [results, setResults]             = useState<RealizedGain[]>([]);
  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [isLoading, setIsLoading]         = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  // Hydration guard
  const [isMounted, setIsMounted]         = useState(false);

  // Expand/collapse state (keyed by view so switching views resets expansion)
  const [expandedRows, setExpandedRows]   = useState<Set<number>>(new Set());

  const toggleRow = (i: number) =>
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  // Reset expanded rows whenever the view or filters change
  const resetExpanded = () => setExpandedRows(new Set());

  useEffect(() => {
    setIsMounted(true);
    setSelectedYear(new Date().getFullYear().toString());
  }, []);

  const years = Array.from({ length: 11 }, (_, i) => {
    const currentYear = isMounted ? new Date().getFullYear() : 2026;
    return (currentYear - 5 + i).toString();
  });

  // Load accounts & assets once on mount
  useEffect(() => {
    if (!isMounted) return;

    fetch("/api/accounts")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data))
          setAccounts([...data].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      })
      .catch(err => console.error("Fetch error:", err));

    fetch("/api/account-groups")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setAccountGroups(data);
      })
      .catch(err => console.error("Fetch error:", err));

    fetch("/api/assets")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data))
          setAssets([...data].sort((a, b) => {
            const la = (a.instrument_symbol || a.display_code || a.name || '').toUpperCase();
            const lb = (b.instrument_symbol || b.display_code || b.name || '').toUpperCase();
            return la.localeCompare(lb, 'es');
          }));
      })
      .catch(err => console.error("Fetch error:", err));
  }, [isMounted]);

  // Fetch data whenever filters or view change
  useEffect(() => {
    if (!isMounted) return;
    resetExpanded();
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (selectedYear)    params.append("year",      selectedYear);
    if (selectedGroup)   params.append("group",     selectedGroup);
    if (selectedAccount) params.append("accountId", selectedAccount);
    if (selectedAsset)   params.append("assetId",   selectedAsset);

    const endpoint = activeView === 'closed'
      ? `/api/taxes?${params}`
      : `/api/open-positions?${params}`;

    fetch(endpoint)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) {
          const techMsg = data.details
            ? `\n\nRuta: ${data.details.path}\nError: ${data.details.error}`
            : "";
          throw new Error(`${data.error || `HTTP ${res.status}`}${techMsg}`);
        }
        return data;
      })
      .then(data => {
        if (activeView === 'closed') {
          setResults(Array.isArray(data) ? data : []);
          setOpenPositions([]);
        } else {
          setOpenPositions(Array.isArray(data) ? data : []);
          setResults([]);
        }
        setError(null);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Fetch error:", err);
        setError(`Error al conectar con el servidor: ${err.message}`);
        setIsLoading(false);
        setResults([]);
        setOpenPositions([]);
      });
  }, [isMounted, activeView, selectedYear, selectedGroup, selectedAccount, selectedAsset]);

  // ── Derived totals ──────────────────────────────────────────────────────────

  const safeResults      = Array.isArray(results) ? results : [];
  const safeOpenPos      = Array.isArray(openPositions) ? openPositions : [];

  // Closed positions summary
  const totalGain        = safeResults.reduce((s, r) => s + (r.gain || 0), 0);
  const totalProceeds    = safeResults.reduce((s, r) => s + ((r.quantity || 0) * (r.sellPrice || 0)), 0);
  const totalCostBasis   = safeResults.reduce((s, r) => s + (r.costBasis || 0), 0);

  // Open positions summary
  const totalOpenQty     = safeOpenPos.reduce((s, p) => s + p.totalQuantity, 0);
  const totalOpenCost    = safeOpenPos.reduce((s, p) => s + p.totalCostEUR, 0);
  const totalOpenFees    = safeOpenPos.reduce((s, p) => s + p.totalFeesEUR, 0);

  // Helper: resolve symbol for an assetId
  const symbolFor = (assetId: string) => {
    const a = assets.find(x => x.id === assetId);
    return a?.instrument_symbol || a?.display_code || a?.name || assetId;
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-64 border-r border-border flex flex-col bg-card">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-primary-foreground">
            <BarChart3 size={20} />
          </div>
          <h1 className="font-bold text-lg tracking-tight">WealthTax</h1>
        </div>

        <nav className="flex-1 px-4 space-y-6 overflow-y-auto pt-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2 block">
              Filtros
            </label>
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-2 text-sm font-medium">
                  <Calendar size={14} /> Año
                </div>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full bg-background border border-border rounded-md p-2 text-sm outline-none focus:ring-1 focus:ring-primary/20"
                >
                  <option value="">Todos los años</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              {accountGroups.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 px-2 text-sm font-medium">
                    <Wallet size={14} /> Grupo
                  </div>
                  <select
                    value={selectedGroup}
                    onChange={(e) => {
                      setSelectedGroup(e.target.value);
                      if (e.target.value) setSelectedAccount("");
                    }}
                    className="w-full bg-background border border-border rounded-md p-2 text-sm outline-none focus:ring-1 focus:ring-primary/20"
                  >
                    <option value="">Todos los grupos</option>
                    {accountGroups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center gap-2 px-2 text-sm font-medium">
                  <Wallet size={14} /> Cuenta
                </div>
                <select
                  value={selectedAccount}
                  onChange={(e) => {
                    setSelectedAccount(e.target.value);
                    if (e.target.value) setSelectedGroup("");
                  }}
                  className="w-full bg-background border border-border rounded-md p-2 text-sm outline-none focus:ring-1 focus:ring-primary/20"
                >
                  <option value="">Todas las cuentas</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 px-2 text-sm font-medium">
                  <Tag size={14} /> Activo
                </div>
                <select
                  value={selectedAsset}
                  onChange={(e) => setSelectedAsset(e.target.value)}
                  className="w-full bg-background border border-border rounded-md p-2 text-sm outline-none focus:ring-1 focus:ring-primary/20"
                >
                  <option value="">Todos los activos</option>
                  {assets.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.instrument_symbol || a.display_code || a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-border mt-auto space-y-3">
          <p className="text-[10px] text-muted-foreground text-center">
            Calculado usando el método FIFO
          </p>
          <button
            onClick={async () => {
              await fetch('/api/auth', { method: 'DELETE' });
              router.push('/login');
            }}
            className="w-full flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition"
          >
            <LogOut size={13} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-background p-8">

        {/* Header + view toggle */}
        <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold mb-1">
              {activeView === 'closed' ? 'Posiciones Cerradas' : 'Posiciones Abiertas'}
            </h2>
            <p className="text-muted-foreground">
              {activeView === 'closed'
                ? 'Informe de plusvalías y base de costes para efectos fiscales.'
                : 'Lotes de compra activos (no vendidos), incluyendo splits y ampliaciones.'}
            </p>
          </div>

          {/* View toggle buttons */}
          <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
            <button
              onClick={() => setActiveView('closed')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors",
                activeView === 'closed'
                  ? "bg-black text-white"
                  : "bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Lock size={14} />
              Posiciones cerradas
            </button>
            <button
              onClick={() => setActiveView('open')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-l border-border",
                activeView === 'open'
                  ? "bg-black text-white"
                  : "bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <LockOpen size={14} />
              Posiciones abiertas
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm font-sans">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* ── Summary cards ─────────────────────────────────────────────────── */}
        {activeView === 'closed' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <span className="text-sm font-medium text-muted-foreground">Resultado Total</span>
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center",
                  totalGain >= 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                )}>
                  {totalGain >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                </div>
              </div>
              <div className="text-2xl font-bold">{fmtEUR(totalGain)}</div>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <span className="text-sm font-medium text-muted-foreground">Total Ventas (Ingresos)</span>
                <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <ArrowUpRight size={16} />
                </div>
              </div>
              <div className="text-2xl font-bold">{fmtEUR(totalProceeds)}</div>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <span className="text-sm font-medium text-muted-foreground">Base de Coste Total</span>
                <div className="w-8 h-8 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center">
                  <Wallet size={16} />
                </div>
              </div>
              <div className="text-2xl font-bold">{fmtEUR(totalCostBasis)}</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <span className="text-sm font-medium text-muted-foreground">Posiciones abiertas</span>
                <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <LockOpen size={16} />
                </div>
              </div>
              <div className="text-2xl font-bold">{safeOpenPos.length}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {safeOpenPos.reduce((s, p) => s + p.lots.length, 0)} lotes activos
              </div>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <span className="text-sm font-medium text-muted-foreground">Coste total (incl. com.)</span>
                <div className="w-8 h-8 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center">
                  <Wallet size={16} />
                </div>
              </div>
              <div className="text-2xl font-bold">{fmtEUR(totalOpenCost)}</div>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <span className="text-sm font-medium text-muted-foreground">Comisiones totales</span>
                <div className="w-8 h-8 rounded-full bg-yellow-500/10 text-yellow-600 flex items-center justify-center">
                  <Tag size={16} />
                </div>
              </div>
              <div className="text-2xl font-bold">{fmtEUR(totalOpenFees)}</div>
            </div>
          </div>
        )}

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex justify-between items-center">
            <h3 className="font-semibold">
              {activeView === 'closed' ? 'Desglose de Operaciones' : 'Lotes de Compra Activos'}
            </h3>
            {isLoading && <span className="text-xs text-muted-foreground animate-pulse">Cargando...</span>}
          </div>

          <div className="overflow-x-auto">
            {activeView === 'closed'
              ? <ClosedPositionsTable
                  results={safeResults}
                  assets={assets}
                  isLoading={isLoading}
                  expandedRows={expandedRows}
                  toggleRow={toggleRow}
                />
              : <OpenPositionsTable
                  positions={safeOpenPos}
                  assets={assets}
                  isLoading={isLoading}
                  expandedRows={expandedRows}
                  toggleRow={toggleRow}
                  symbolFor={symbolFor}
                />
            }
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Closed Positions Table ────────────────────────────────────────────────────

function ClosedPositionsTable({
  results,
  assets,
  isLoading,
  expandedRows,
  toggleRow,
}: {
  results: RealizedGain[];
  assets: Asset[];
  isLoading: boolean;
  expandedRows: Set<number>;
  toggleRow: (i: number) => void;
}) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="bg-black text-white">
          <th className="px-4 py-3 font-medium whitespace-nowrap">Fecha</th>
          <th className="px-4 py-3 font-medium">Activo</th>
          <th className="px-4 py-3 font-medium text-right">Cant.</th>
          <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Precio</th>
          <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Tasa FX</th>
          <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Total</th>
          <th className="px-4 py-3 font-medium text-right">Comisiones</th>
          <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Total − com.</th>
          <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Coste orig. (c/com.)</th>
          <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Benef./Pérd. (€)</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {results.length === 0 ? (
          <tr>
            <td colSpan={10} className="px-6 py-12 text-center text-muted-foreground italic">
              {isLoading ? "Buscando operaciones..." : "No hay operaciones realizadas para estos filtros."}
            </td>
          </tr>
        ) : (
          results.map((r, i) => {
            const asset = assets.find(a => a.id === r.assetId);
            const symbol = asset?.instrument_symbol || asset?.display_code || r.assetId;
            const totalVenta = r.quantity * r.sellPriceOriginal;
            const netoVenta  = totalVenta - r.sellFeeOriginal;

            const lotCurrency    = r.matchedLots[0]?.currency ?? r.sellCurrency;
            const allSameCurrency = r.matchedLots.every(l => l.currency === lotCurrency);
            const totalCosteOrig = allSameCurrency
              ? r.matchedLots.reduce((s, l) => {
                  const origQty = l.splitFactor > 0 ? l.quantity / l.splitFactor : l.quantity;
                  return s + origQty * l.buyPriceOriginal + l.buyFeeOriginal;
                }, 0)
              : null;

            const isExpanded = expandedRows.has(i);
            const hasLots    = r.matchedLots.length > 0;

            return (
              <Fragment key={i}>
                {/* Sale row */}
                <tr
                  className={cn(
                    "bg-blue-50/60 transition-colors",
                    hasLots && "cursor-pointer hover:bg-blue-100/60"
                  )}
                  onClick={() => hasLots && toggleRow(i)}
                >
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                    <span className="inline-flex items-center gap-1">
                      {hasLots && (
                        <ChevronRight
                          size={12}
                          className={cn(
                            "text-muted-foreground transition-transform duration-150 shrink-0",
                            isExpanded && "rotate-90"
                          )}
                        />
                      )}
                      {formatDate(r.sellDate)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{symbol}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.quantity.toLocaleString('es-ES', { maximumFractionDigits: 4 })}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    <WithEur value={r.sellPriceOriginal} currency={r.sellCurrency} fxRate={r.sellFxRate} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                    {fmtFX(r.sellFxRate, r.sellCurrency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    <WithEur value={totalVenta} currency={r.sellCurrency} fxRate={r.sellFxRate} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                    <WithEur value={r.sellFeeOriginal} currency={r.sellCurrency} fxRate={r.sellFxRate} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    <WithEur value={netoVenta} currency={r.sellCurrency} fxRate={r.sellFxRate} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                    {totalCosteOrig !== null
                      ? <WithEur value={totalCosteOrig} currency={lotCurrency} fxRate={r.matchedLots[0]?.buyFxRate ?? 1} />
                      : fmtEUR(r.costBasis)}
                  </td>
                  <td className={cn(
                    "px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap",
                    r.gain >= 0 ? "text-green-600" : "text-red-500"
                  )}>
                    {r.gain >= 0 ? '+' : ''}{fmtEUR(r.gain)}
                  </td>
                </tr>

                {/* Matched lot rows */}
                {isExpanded && r.matchedLots.map((lot, j) => {
                  const origQty     = lot.splitFactor > 0 ? lot.quantity / lot.splitFactor : lot.quantity;
                  const lotTotal    = origQty * lot.buyPriceOriginal;
                  const lotTotalConCom = lotTotal + lot.buyFeeOriginal;
                  return (
                    <tr key={`${i}-${j}`} className="bg-muted/20 text-xs">
                      <td className="pl-8 pr-3 py-1.5 whitespace-nowrap text-muted-foreground font-mono">
                        ↳ {formatDate(lot.buyDate)}
                      </td>
                      <td className="px-3 py-1.5" />
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {origQty.toLocaleString('es-ES', { maximumFractionDigits: 6 })}
                        {lot.splitFactor !== 1 && (
                          <span className="ml-1 opacity-50 text-[10px]">×{lot.splitFactor}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        <WithEur value={lot.buyPriceOriginal} currency={lot.currency} fxRate={lot.buyFxRate} />
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        {fmtFX(lot.buyFxRate, lot.currency)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        <WithEur value={lotTotal} currency={lot.currency} fxRate={lot.buyFxRate} />
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        <WithEur value={lot.buyFeeOriginal} currency={lot.currency} fxRate={lot.buyFxRate} />
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        <WithEur value={lotTotalConCom} currency={lot.currency} fxRate={lot.buyFxRate} />
                      </td>
                      <td colSpan={2} />
                    </tr>
                  );
                })}
              </Fragment>
            );
          })
        )}
      </tbody>
    </table>
  );
}

// ── Open Positions Table ──────────────────────────────────────────────────────

function OpenPositionsTable({
  positions,
  assets,
  isLoading,
  expandedRows,
  toggleRow,
  symbolFor,
}: {
  positions: OpenPosition[];
  assets: Asset[];
  isLoading: boolean;
  expandedRows: Set<number>;
  toggleRow: (i: number) => void;
  symbolFor: (assetId: string) => string;
}) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="bg-black text-white">
          <th className="px-4 py-3 font-medium whitespace-nowrap">Fecha / Activo</th>
          <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Acciones</th>
          <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Precio compra</th>
          <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Tasa FX</th>
          <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Total orig.</th>
          <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Comisiones</th>
          <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Coste base (€)</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {positions.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground italic">
              {isLoading ? "Buscando posiciones..." : "No hay posiciones abiertas para estos filtros."}
            </td>
          </tr>
        ) : (
          positions.map((p, i) => {
            const symbol     = symbolFor(p.assetId);
            const isExpanded = expandedRows.has(i);
            const hasLots    = p.lots.length > 0;

            return (
              <Fragment key={i}>
                {/* Aggregate row (per asset) */}
                <tr
                  className={cn(
                    "bg-emerald-50/60 transition-colors",
                    hasLots && "cursor-pointer hover:bg-emerald-100/60"
                  )}
                  onClick={() => hasLots && toggleRow(i)}
                >
                  {/* Symbol */}
                  <td className="px-4 py-3 font-medium">
                    <span className="inline-flex items-center gap-1">
                      {hasLots && (
                        <ChevronRight
                          size={12}
                          className={cn(
                            "text-muted-foreground transition-transform duration-150 shrink-0",
                            isExpanded && "rotate-90"
                          )}
                        />
                      )}
                      {symbol}
                    </span>
                  </td>
                  {/* Total shares */}
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">
                    {p.totalQuantity.toLocaleString('es-ES', { maximumFractionDigits: 4 })}
                  </td>
                  {/* Average price */}
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    <span className="flex flex-col items-end leading-tight gap-0.5">
                      <span>{fmtEUR(p.avgUnitPriceEUR)}<span className="text-[10px] text-muted-foreground ml-1">/acc.</span></span>
                      <span className="text-[10px] text-muted-foreground/70">precio medio</span>
                    </span>
                  </td>
                  {/* FX — not meaningful for aggregate */}
                  <td className="px-4 py-3 text-right text-muted-foreground">—</td>
                  {/* Total — not shown at aggregate level (redundant with Coste) */}
                  <td className="px-4 py-3 text-right text-muted-foreground">—</td>
                  {/* Total fees */}
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                    {fmtEUR(p.totalFeesEUR)}
                  </td>
                  {/* Total cost EUR */}
                  <td className="px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap">
                    {fmtEUR(p.totalCostEUR)}
                  </td>
                </tr>

                {/* Individual lot rows */}
                {isExpanded && p.lots.map((lot, j) => {
                  // Original-currency total (no fee): origQty × unitPriceOriginal
                  // origQty = post-split qty / splitFactor → pre-split equivalent shares
                  const origQty       = lot.splitFactor > 0 ? lot.quantity / lot.splitFactor : lot.quantity;
                  const lotOrigTotal  = origQty * lot.unitPriceOriginal;

                  return (
                    <tr key={`${i}-${j}`} className="bg-muted/20 text-xs">
                      {/* Buy date */}
                      <td className="pl-8 pr-3 py-1.5 whitespace-nowrap text-muted-foreground font-mono">
                        ↳ {formatDate(lot.buyDate)}
                      </td>
                      {/* Quantity + split indicator */}
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {lot.quantity.toLocaleString('es-ES', { maximumFractionDigits: 6 })}
                        {lot.splitFactor !== 1 && (
                          <span
                            className="ml-1.5 text-[10px] font-semibold px-1 py-0.5 rounded"
                            style={{
                              background: lot.splitFactor > 1 ? '#dcfce7' : '#fef9c3',
                              color:      lot.splitFactor > 1 ? '#15803d' : '#854d0e',
                            }}
                            title={lot.splitFactor > 1
                              ? `Split aplicado ×${lot.splitFactor}`
                              : `Contrasplit aplicado ×${lot.splitFactor}`}
                          >
                            ×{lot.splitFactor}
                          </span>
                        )}
                      </td>
                      {/* Buy price original */}
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        <WithEur
                          value={lot.unitPriceOriginal}
                          currency={lot.currency}
                          fxRate={lot.fxRate}
                        />
                      </td>
                      {/* FX rate */}
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        {fmtFX(lot.fxRate, lot.currency)}
                      </td>
                      {/* Total original (no fee) */}
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        <WithEur
                          value={lotOrigTotal}
                          currency={lot.currency}
                          fxRate={lot.fxRate}
                        />
                      </td>
                      {/* Proportional fee */}
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        <WithEur
                          value={lot.feeOriginal}
                          currency={lot.currency}
                          fxRate={lot.fxRate}
                        />
                      </td>
                      {/* Cost basis EUR (includes fee) */}
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        {fmtEUR(lot.costEUR)}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })
        )}
      </tbody>
    </table>
  );
}
