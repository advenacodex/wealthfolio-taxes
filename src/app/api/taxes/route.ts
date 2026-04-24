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

    // Include all POSTED activities plus any SPLIT activities regardless of status
    // (splits may have a different status in wealthfolio but are needed for correct FIFO)
    let query = `SELECT * FROM activities WHERE status = 'POSTED' OR activity_type = 'SPLIT'`;
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

    const gains = calculateFIFO(activities);

    const filteredGains = year
      ? gains.filter(g => new Date(g.sellDate).getFullYear() === parseInt(year))
      : gains;

    return NextResponse.json(filteredGains);
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to calculate FIFO gains',
      details: error.diagnosticInfo || null
    }, { status: 500 });
  }
}
