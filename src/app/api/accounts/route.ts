import { getDb, Account } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const db = getDb();
    const accounts = db.prepare('SELECT id, name, currency FROM accounts WHERE is_active = 1 AND is_archived = 0').all() as Account[];
    return NextResponse.json(accounts);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}
