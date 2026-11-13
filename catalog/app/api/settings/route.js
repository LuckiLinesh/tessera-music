import { NextResponse } from 'next/server';
import { applyKeys, hasJamendo, hasYouTube } from '@/lib/keys';

export const dynamic = 'force-dynamic';

/* Read the live key state. The desktop app calls this after saving a key so the
   settings screen can confirm the source actually switched on. */
export async function GET() {
  return NextResponse.json(
    { youtube: hasYouTube(), jamendo: hasJamendo() },
    { headers: { 'cache-control': 'no-store' } },
  );
}

/* Set a key for the running server. Only the desktop shell may call this: the
   Electron preload attaches the header, and a browser cannot forge it without
   CORS permission. Keys are never returned by this route. */
export async function POST(request) {
  if (request.headers.get('x-tessera-desktop') !== '1') {
    return NextResponse.json({ error: 'settings are managed by the desktop app' }, { status: 403 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const state = applyKeys(body || {});
  return NextResponse.json({ ok: true, ...state }, { headers: { 'cache-control': 'no-store' } });
}
