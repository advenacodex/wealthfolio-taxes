import { getDb, Asset } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const db = getDb();
    const assets = db.prepare('SELECT id, name, display_code, instrument_symbol FROM assets WHERE is_active = 1').all() as Asset[];
    return NextResponse.json(assets);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
  }
}
