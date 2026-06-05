import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT DISTINCT "group" AS name
       FROM accounts
       WHERE "group" IS NOT NULL AND is_active = 1 AND is_archived = 0
       ORDER BY "group"`
    ).all() as { name: string }[];
    return NextResponse.json(rows.map(r => r.name));
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch account groups' }, { status: 500 });
  }
}
