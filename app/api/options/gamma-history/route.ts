import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';
import { historyPoints, historySession, istDate, niftyCandles, type GammaHistoryResponse } from '@/lib/marketData/gammaHistoryView';

export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  let uid: string;
  try { uid = (await adminAuth.verifyIdToken(token)).uid; }
  catch { return NextResponse.json({ error: 'Your session expired. Please sign in again.' }, { status: 401 }); }

  const date = request.nextUrl.searchParams.get('date') ?? istDate();
  const requestedExpiry = request.nextUrl.searchParams.get('expiry') ?? '';
  let session: ReturnType<typeof historySession>;
  try { session = historySession(date); }
  catch { return NextResponse.json({ error: 'Invalid session date.' }, { status: 400 }); }
  if (date > istDate() || (requestedExpiry && !/^\d{10}$/.test(requestedExpiry))) {
    return NextResponse.json({ error: 'Choose a valid expiry and a date up to today.' }, { status: 400 });
  }

  try {
    const collection = adminDb.collection('marketData').doc('NIFTY').collection('expiries');
    // Existing snapshots have no parent document; listDocuments includes those parent references.
    const refs = await collection.listDocuments();
    const expiries = refs.filter(ref => /^\d{10}$/.test(ref.id)).sort((a, b) => Number(a.id) - Number(b.id))
      .map(ref => ({ value: ref.id, label: new Date(Number(ref.id) * 1000).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
      }) }));
    const expiry = requestedExpiry || expiries.find(e => istDate(Number(e.value) * 1000) >= date)?.value || expiries.at(-1)?.value || '';
    const docs = expiry ? await collection.doc(expiry).collection('snapshots')
      .where('minute', '>=', new Date(session.open * 1000).toISOString())
      .where('minute', '<', new Date(session.close * 1000).toISOString())
      .orderBy('minute').limit(375).get() : null;
    const snapshots = historyPoints(docs?.docs.map(doc => doc.data()) ?? [], date);
    const result: GammaHistoryResponse = { date, expiry, expiries, snapshots, candles: [], candleMessage: null };
    try {
      const config = await getCachedBrokerConfig(uid, 'fyers');
      if (!config?.accessToken || !config.apiKey) {
        result.candleMessage = 'Connect FYERS for minute candles. Saved NIFTY spot observations are shown.';
      } else {
        const params = new URLSearchParams({ symbol: 'NSE:NIFTY50-INDEX', resolution: '1', date_format: '1', range_from: date, range_to: date, cont_flag: '1' });
        const response = await fetch(`https://api-t1.fyers.in/data/history?${params}`, {
          headers: { Authorization: `${decryptData(config.apiKey)}:${decryptData(config.accessToken)}` },
          cache: 'no-store', signal: AbortSignal.timeout(15000),
        });
        const body = await response.json();
        if (!response.ok || body.s !== 'ok') throw new Error('Candle request failed.');
        result.candles = niftyCandles(body.candles, date);
        if (!result.candles.length) result.candleMessage = 'No minute candles returned for this session. Saved spot observations are shown.';
      }
    } catch {
      result.candleMessage = 'FYERS minute candles are unavailable. Saved NIFTY spot observations are shown.';
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to read saved gamma history. Please retry.' }, { status: 502 });
  }
}
