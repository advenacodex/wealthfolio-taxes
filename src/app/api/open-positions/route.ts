import { getDb, Activity } from '@/lib/db';
import { calculateOpenPositions } from '@/lib/fifo';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year      = searchParams.get('year');
  const accountId = searchParams.get('accountId');
  const assetId   = searchParams.get('assetId');

  try {
    const db = getDb();

    // For open positions we always need the full history so the FIFO engine
    // can correctly determine which lots are still open.  Only account/asset
    // filters are applied at the SQL level; year is applied post-FIFO on the
    // individual lot buy dates (so you can ask "what did I buy in 2023 that I
    // still hold today?").
    let query = `SELECT * FROM activities WHERE (status = 'POSTED' OR activity_type = 'SPLIT')`;
    const params: any[] = [];

    if (accountId) {
      query += ' AND account_id = ?';
      params.push(accountId);
    }

    if (assetId) {
      query += ' AND asset_id = ?';
      params.push(assetId);
    }

    const activities = db.prepare(query).all(...params) as Activity[];
    let positions = calculateOpenPositions(activities);

    // Filter by buy year when requested: keep only lots bought in that year.
    // Positions with no remaining lots after filtering are dropped entirely.
    if (year) {
      const targetYear = parseInt(year, 10);
      positions = positions
        .map(p => ({
          ...p,
          lots: p.lots.filter(
            l => new Date(l.buyDate).getFullYear() === targetYear
          ),
        }))
        .filter(p => p.lots.length > 0)
        // Recompute aggregates for the filtered lots
        .map(p => {
          const totalQuantity  = p.lots.reduce((s, l) => s + l.quantity, 0);
          const totalCostEUR   = p.lots.reduce((s, l) => s + l.costEUR, 0);
          const totalFeesEUR   = p.lots.reduce((s, l) => s + l.feeEUR, 0);
          const avgUnitPriceEUR = totalQuantity > 0 ? totalCostEUR / totalQuantity : 0;
          return { ...p, totalQuantity, totalCostEUR, totalFeesEUR, avgUnitPriceEUR };
        });
    }

    return NextResponse.json(positions);
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to calculate open positions',
      details: error.diagnosticInfo || null,
    }, { status: 500 });
  }
}
