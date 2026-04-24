import { Activity } from './db';

// Internal type that carries the cumulative split factor through the pipeline
// so the FIFO loop can reconstruct the original (pre-split) price for display.
type AdjustedActivity = Activity & { _splitFactor: number };

export interface Lot {
  buyDate: string;
  quantity: number;          // post-split adjusted shares (used for FIFO accounting)
  unitPrice: number;         // EUR per post-split share (includes apportioned fee)
  fee: number;               // total EUR fee for this lot
  originalQuantity: number;  // post-split qty when lot was created (for fee apportionment)
  unitPriceOriginal: number; // TRUE original pre-split price in original currency
  feeOriginal: number;       // total fee in original currency
  fxRate: number;
  currency: string;
  splitFactor: number;       // cumulative split factor applied to this lot (1 = no split)
}

export interface RealizedGain {
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
    quantity: number;        // post-split shares consumed from this lot
    buyPrice: number;        // EUR per post-split share
    buyPriceOriginal: number;// TRUE original pre-split price in original currency
    buyFeeOriginal: number;  // proportional fee in original currency
    buyFxRate: number;
    currency: string;
    splitFactor: number;     // same as the lot's splitFactor
  }[];
}

export function calculateFIFO(activities: Activity[]): RealizedGain[] {
  const sortedActivities = [...activities].sort(
    (a, b) => new Date(a.activity_date).getTime() - new Date(b.activity_date).getTime()
  );

  // ── 1. Collect splits ────────────────────────────────────────────────────────
  //
  // Convention assumed for wealthfolio SPLIT activities:
  //   act.quantity = new_shares / old_shares  (ratio > 1 = forward, < 1 = reverse)
  //
  //   Forward split 4:1  →  quantity = 4   (each share → 4 shares)
  //   Reverse split 1:4  →  quantity = 0.25 (every 4 shares → 1 share)
  //
  // Retrospective adjustment for a past buy before a future split:
  //   adj_qty   = qty   × ratio   (more shares after forward split)
  //   adj_price = price / ratio   (lower price per share after forward split)
  //
  // The original price is PRESERVED in unitPriceOriginal = adj_price × ratio = original price.
  //
  // Example: buy 10 @ 100 USD, then 4:1 split
  //   adj_qty = 40, adj_price = 25 USD, splitFactor = 4
  //   unitPriceOriginal = 25 × 4 = 100 USD  ← original price
  //   When selling 10 post-split shares: origEquiv = 10/4 = 2.5 original shares
  //   Cost = 2.5 × 100 = 250 USD  ✓
  const splitFactors: Record<string, { date: string; ratio: number }[]> = {};
  for (const act of sortedActivities) {
    if (act.activity_type.toUpperCase() === 'SPLIT') {
      // In wealthfolio, the split ratio is stored in unit_price (the "Price" column),
      // NOT in quantity (which is left blank for split activities).
      // e.g. a 4-for-1 forward split has unit_price = 4.
      const ratio = parseFloat(act.amount || act.unit_price || act.quantity || '0');
      if (ratio > 0) {
        if (!splitFactors[act.asset_id]) splitFactors[act.asset_id] = [];
        splitFactors[act.asset_id].push({ date: act.activity_date, ratio });
      }
    }
  }

  // ── 2. Adjust past activities retrospectively, carrying the split factor ─────
  const adjustedActivities: AdjustedActivity[] = [];
  for (const act of sortedActivities) {
    if (act.activity_type.toUpperCase() === 'SPLIT') continue;

    let cumulativeFactor = 1;
    const splits = splitFactors[act.asset_id];
    if (splits) {
      for (const split of splits) {
        if (new Date(split.date).getTime() > new Date(act.activity_date).getTime()) {
          cumulativeFactor *= split.ratio;
        }
      }
    }

    const adjAct: AdjustedActivity = { ...act, _splitFactor: cumulativeFactor };
    if (cumulativeFactor !== 1) {
      const qty = parseFloat(adjAct.quantity || '0');
      const price = parseFloat(adjAct.unit_price || '0');
      adjAct.quantity = (qty * cumulativeFactor).toString();
      if (price !== 0) {
        adjAct.unit_price = (price / cumulativeFactor).toString();
      }
    }
    adjustedActivities.push(adjAct);
  }

  // ── 3. FIFO processing ───────────────────────────────────────────────────────
  const openLots: Record<string, Lot[]> = {};
  const realizedGains: RealizedGain[] = [];

  for (const act of adjustedActivities) {
    const key = `${act.asset_id}_${act.account_id}`;
    const qty = Math.abs(parseFloat(act.quantity || '0'));
    const actType = (act.activity_type || '').toUpperCase();
    const splitFactor = act._splitFactor;  // 1 if no split affected this activity

    const fxRate = parseFloat(act.fx_rate || '1');
    const validFxRate = fxRate > 0 ? fxRate : 1;
    const rawPrice = parseFloat(act.unit_price || '0');   // post-split adjusted price
    const rawFee = parseFloat(act.fee || '0');
    const price = rawPrice * validFxRate;
    const fee = rawFee * validFxRate;

    if (actType === 'TRANSFER_IN') {
      // ── Scrip dividend / bonus share ─────────────────────────────────────────
      // No acquisition cost. Redistribute total cost over the expanded lot quantity.
      // Each existing lot absorbs a proportional share of the incoming shares.
      //
      //   expansionRatio = (totalExistingQty + incomingQty) / totalExistingQty
      //   new qty             = old qty × expansionRatio
      //   new originalQty     = old originalQty × expansionRatio
      //   new unitPrice       = old unitPrice / expansionRatio   (EUR cost preserved)
      //   new unitPriceOriginal= old unitPriceOriginal / expansionRatio (orig cost preserved)
      //   feeOriginal stays the same (same fee was paid at purchase)
      //   splitFactor stays the same (scrip is not a split)
      const lots = openLots[key];
      if (!lots || lots.length === 0) {
        if (!openLots[key]) openLots[key] = [];
        openLots[key].push({
          buyDate: act.activity_date,
          quantity: qty,
          unitPrice: 0,
          fee: 0,
          originalQuantity: qty,
          unitPriceOriginal: 0,
          feeOriginal: 0,
          fxRate: validFxRate,
          currency: act.currency || 'EUR',
          splitFactor: 1,
        });
      } else {
        const totalExistingQty = lots.reduce((s, l) => s + l.quantity, 0);
        if (totalExistingQty > 0) {
          const expansionRatio = (totalExistingQty + qty) / totalExistingQty;
          for (const lot of lots) {
            lot.quantity         *= expansionRatio;
            lot.originalQuantity *= expansionRatio;
            lot.unitPrice        /= expansionRatio;
            lot.unitPriceOriginal /= expansionRatio;
            // splitFactor is unchanged — scrip expansion is separate from stock splits
          }
        }
      }
    } else if (['BUY', 'RECEIVE'].includes(actType)) {
      if (!openLots[key]) openLots[key] = [];
      const unitCostWithFee = qty > 0 ? price + (fee / qty) : price;
      openLots[key].push({
        buyDate: act.activity_date,
        quantity: qty,                           // post-split adjusted shares
        unitPrice: unitCostWithFee,              // EUR per post-split share
        fee: fee,
        originalQuantity: qty,
        unitPriceOriginal: rawPrice * splitFactor, // TRUE original pre-split price
        feeOriginal: rawFee,
        fxRate: validFxRate,
        currency: act.currency || 'EUR',
        splitFactor,
      });
    } else if (['SELL', 'SEND', 'TRANSFER_OUT'].includes(actType)) {
      if (!openLots[key] || openLots[key].length === 0) continue;

      let remainingToSell = qty;
      let totalCostBasis = 0;
      const matchedLots: RealizedGain['matchedLots'] = [];

      while (remainingToSell > 0 && openLots[key].length > 0) {
        const lot = openLots[key][0];
        const consumeQty = Math.min(remainingToSell, lot.quantity);

        totalCostBasis += consumeQty * lot.unitPrice;

        const proportionalFeeOrig = lot.originalQuantity > 0
          ? (consumeQty / lot.originalQuantity) * lot.feeOriginal
          : 0;

        matchedLots.push({
          buyDate: lot.buyDate,
          quantity: consumeQty,                  // post-split shares sold from this lot
          buyPrice: lot.unitPrice,               // EUR per post-split share
          buyPriceOriginal: lot.unitPriceOriginal, // original pre-split price
          buyFeeOriginal: proportionalFeeOrig,
          buyFxRate: lot.fxRate,
          currency: lot.currency,
          splitFactor: lot.splitFactor,
        });

        lot.quantity -= consumeQty;
        remainingToSell -= consumeQty;

        if (lot.quantity < 1e-9) {
          openLots[key].shift();
        }
      }

      const saleProceeds = (qty * price) - fee;
      const gain = saleProceeds - totalCostBasis;

      realizedGains.push({
        assetId: act.asset_id,
        accountId: act.account_id,
        sellDate: act.activity_date,
        quantity: qty,
        sellPrice: price,
        sellFee: fee,
        sellPriceOriginal: rawPrice,
        sellFeeOriginal: rawFee,
        sellFxRate: validFxRate,
        sellCurrency: act.currency || 'EUR',
        costBasis: totalCostBasis,
        gain: gain,
        matchedLots,
      });
    }
  }

  return realizedGains;
}
