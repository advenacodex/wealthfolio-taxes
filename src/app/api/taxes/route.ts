import { getDb, Activity } from '@/lib/db';
import { calculateFIFO } from '@/lib/fifo';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year');
  const accountId = searchParams.get('accountId');
  const assetId = searchParams.get('assetId');

  try {
    const db = getDb();

    // JOIN with accounts to get the group, enabling group-level FIFO pooling.
    // "group" is a reserved SQL keyword — must be quoted.
    let query = `
      SELECT a.*, acc."group" AS account_group
      FROM activities a
      LEFT JOIN accounts acc ON acc.id = a.account_id
      WHERE (a.status = 'POSTED' OR a.activity_type = 'SPLIT')
    `;
    const params: any[] = [];

    if (accountId) {
      // Expand the filter to all accounts sharing the same group so the FIFO
      // engine sees the full group pool. Accounts with no group are treated as
      // their own single-account pool.
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
    const gains = calculateFIFO(activities);

    // When filtered by account, show only sales that happened in that account.
    // (Matched lots may come from other accounts in the group — that's correct.)
    let filteredGains = accountId
      ? gains.filter(g => g.accountId === accountId)
      : gains;

    if (year) {
      filteredGains = filteredGains.filter(
        g => new Date(g.sellDate).getFullYear() === parseInt(year)
      );
    }

    return NextResponse.json(filteredGains);
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to calculate FIFO gains',
      details: error.diagnosticInfo || null
    }, { status: 500 });
  }
}
