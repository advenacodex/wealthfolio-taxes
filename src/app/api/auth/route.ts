import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'wt_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  const appUser = process.env.APP_USERNAME || 'admin';
  const appPass = process.env.APP_PASSWORD || 'taxfolio';
  // AUTH_SECRET defaults to the password — fine for a single-user internal tool
  const secret  = process.env.AUTH_SECRET  || appPass;

  if (username !== appUser || password !== appPass) {
    // Small delay to slow down brute-force
    await new Promise(r => setTimeout(r, 400));
    return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, secret, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
  return response;
}
