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
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
    quantity: number;      // post-split shares consumed
    buyPrice: number;
    buyPriceOriginal: number; // TRUE original pre-split price
    buyFeeOriginal: number;
    buyFxRate: number;
    currency: string;
    splitFactor: number;   // 1 = no split affected this lot
  }[];
}

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
function WithEur({ value, currency, fxRate, zero = '—' }: { value: number; currency: string; fxRate: number; zero?: string }) {
  if (value === 0 && zero === '—') return <span className="text-muted-foreground">{zero}</span>;
  if (currency === 'EUR') return <span>{fmtEUR(value)}</span>;
  return (
    <span className="flex flex-col items-end leading-tight gap-0.5">
      <span>{fmtOrig(value, currency)}</span>
      <span className="text-[10px] text-muted-foreground/70">{fmtEUR(value * fxRate)}</span>
    </span>
  );
}

export default function TaxesDashboard() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [results, setResults] = useState<RealizedGain[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (i: number) =>
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  useEffect(() => {
    setIsMounted(true);
    setSelectedYear(new Date().getFullYear().toString());
  }, []);

  const years = Array.from({ length: 11 }, (_, i) => {
    const currentYear = isMounted ? new Date().getFullYear() : 2026;
    return (currentYear - 5 + i).toString();
  });

  useEffect(() => {
    if (!isMounted) return;

    fetch("/api/accounts")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data))
          setAccounts([...data].sort((a, b) => a.name.localeCompare(b.name, 'es')));
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

  const fetchData = () => {
    if (!isMounted) return;
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (selectedYear) params.append("year", selectedYear);
    if (selectedAccount) params.append("accountId", selectedAccount);
    if (selectedAsset) params.append("assetId", selectedAsset);

    fetch(`/api/taxes?${params.toString()}`)
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
        setResults(data);
        setError(null);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Fetch error:", err);
        setError(`Error al conectar con el servidor: ${err.message}`);
        setIsLoading(false);
        setResults([]);
      });
  };

  useEffect(() => {
    if (isMounted) fetchData();
  }, [isMounted, selectedYear, selectedAccount, selectedAsset]);

  const safeResults = Array.isArray(results) ? results : [];
  const totalGain = safeResults.reduce((sum, r) => sum + (r.gain || 0), 0);
  const totalProceeds = safeResults.reduce((sum, r) => sum + ((r.quantity || 0) * (r.sellPrice || 0)), 0);
  const totalCostBasis = safeResults.reduce((sum, r) => sum + (r.costBasis || 0), 0);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
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

              <div className="space-y-1">
                <div className="flex items-center gap-2 px-2 text-sm font-medium">
                  <Wallet size={14} /> Cuenta
                </div>
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-background p-8">
        <header className="mb-8">
          <h2 className="text-2xl font-bold mb-1">Ganancias Realizadas</h2>
          <p className="text-muted-foreground">Informe de plusvalías y base de costes para efectos fiscales.</p>
        </header>

        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm font-sans">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Global Summary */}
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

        {/* Details Table */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex justify-between items-center">
            <h3 className="font-semibold">Desglose de Operaciones</h3>
            {isLoading && <span className="text-xs text-muted-foreground animate-pulse">Cargando...</span>}
          </div>
          <div className="overflow-x-auto">
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
                {safeResults.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-muted-foreground italic">
                      {isLoading ? "Buscando operaciones..." : "No hay operaciones realizadas para estos filtros."}
                    </td>
                  </tr>
                ) : (
                  safeResults.map((r, i) => {
                    const asset = assets.find(a => a.id === r.assetId);
                    const symbol = asset?.instrument_symbol || asset?.display_code || r.assetId;
                    const totalVenta = r.quantity * r.sellPriceOriginal;
                    const netoVenta = totalVenta - r.sellFeeOriginal;

                    // Total acquisition cost in original currency (if all lots share same currency).
                    // Uses original pre-split equivalent shares: quantity / splitFactor × buyPriceOriginal
                    const lotCurrency = r.matchedLots[0]?.currency ?? r.sellCurrency;
                    const allSameCurrency = r.matchedLots.every(l => l.currency === lotCurrency);
                    const totalCosteOrig = allSameCurrency
                      ? r.matchedLots.reduce((s, l) => {
                          const origQty = l.splitFactor > 0 ? l.quantity / l.splitFactor : l.quantity;
                          return s + origQty * l.buyPriceOriginal + l.buyFeeOriginal;
                        }, 0)
                      : null;

                    const isExpanded = expandedRows.has(i);
                    const hasLots = r.matchedLots.length > 0;

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

                        {/* Matched lot rows — collapsed by default */}
                        {isExpanded && r.matchedLots.map((lot, j) => {
                          // Use original pre-split equivalent shares for display:
                          //   origQty = postSplitQty / splitFactor  (e.g. 10/4 = 2.5 original shares)
                          //   buyPriceOriginal already holds the TRUE pre-split price (e.g. 100 USD)
                          //   total = 2.5 × 100 = 250 USD  (same as 10 × 25, but shown as original)
                          const origQty = lot.splitFactor > 0 ? lot.quantity / lot.splitFactor : lot.quantity;
                          const lotTotal = origQty * lot.buyPriceOriginal;
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
          </div>
        </div>
      </main>
    </div>
  );
}
