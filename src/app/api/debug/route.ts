import { getDb, Activity } from '@/lib/db';
import { NextResponse } from 'next/server';

/**
 * Debug endpoint — returns raw activities for a given asset symbol
 * so we can verify what the database actually contains.
 *
 * Usage: /api/debug?symbol=AAPL
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || '';

  try {
    const db = getDb();

    // Get assets matching the symbol
    const assets = db.prepare(
      `SELECT id, name, instrument_symbol, display_code FROM assets
       WHERE instrument_symbol = ? OR display_code = ? OR name = ?`
    ).all(symbol, symbol, symbol) as { id: string; name: string; instrument_symbol: string; display_code: string }[];

    if (assets.length === 0) {
      return NextResponse.json({ error: `No asset found for symbol: ${symbol}` }, { status: 404 });
    }

    const assetId = assets[0].id;

    // All activities for this asset (no status filter)
    const allActivities = db.prepare(
      `SELECT * FROM activities WHERE asset_id = ? ORDER BY activity_date`
    ).all(assetId) as Activity[];

    // SPLIT activities specifically
    const splits = allActivities.filter(a => a.activity_type?.toUpperCase() === 'SPLIT');

    // Summary of what FIFO would detect as split ratios
    const splitSummary = splits.map(s => ({
      date: s.activity_date,
      status: (s as any).status,
      quantity_field: s.quantity,
      unit_price_field: s.unit_price,
      amount_field: s.amount,
      currency: s.currency,
      detected_ratio_unit_price: parseFloat(s.unit_price || '0'),
      detected_ratio_quantity: parseFloat(s.quantity || '0'),
    }));

    return NextResponse.json({
      asset: assets[0],
      total_activities: allActivities.length,
      splits: splitSummary,
      all_activities: allActivities.map(a => ({
        type: a.activity_type,
        date: a.activity_date,
        status: (a as any).status,
        quantity: a.quantity,
        unit_price: a.unit_price,
        amount: a.amount,
        fee: a.fee,
        currency: a.currency,
        fx_rate: a.fx_rate,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
