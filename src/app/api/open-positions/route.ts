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
    // can correctly determine which lots are still open.  The account filter is
    // expanded to the full account group so FIFO pooling works correctly.
    // "group" is a reserved SQL keyword — must be quoted.
    let query = `
      SELECT a.*, acc."group" AS account_group
      FROM activities a
      LEFT JOIN accounts acc ON acc.id = a.account_id
      WHERE (a.status = 'POSTED' OR a.activity_type = 'SPLIT')
    `;
    const params: any[] = [];

    if (accountId) {
      // Expand to all accounts sharing the same group for correct FIFO pooling.
      const acct = db.prepare('SELECT "group" FROM accounts WHERE id = ?').get(accountId) as { group: string | null } | undefined;
      const grp = acct?.group;
      if (grp) {
        query += ` AND a.account_id IN (SELECT id FROM accounts WHERE "group" = ?)`;
        params.push(grp);
      } else {
        query += ` AND a.account_id = ?`;
        params.push(accountId);
      }
    }

    if (assetId) {
      query += ` AND a.asset_id = ?`;
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
          const totalQuantity   = p.lots.reduce((s, l) => s + l.quantity, 0);
          const totalCostEUR    = p.lots.reduce((s, l) => s + l.costEUR, 0);
          const totalFeesEUR    = p.lots.reduce((s, l) => s + l.feeEUR, 0);
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
