import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';
import { fetchFyersGammaChain } from '@/lib/marketData/fyersGammaChain';
import { fetchParticipantPositioning } from '@/lib/marketData/nseParticipantOi';
import { calculateGammaExposure, type GammaSnapshot } from '@/lib/gammaExposure';
import { storeGammaHistory } from '@/lib/marketData/gammaHistory';

const cache = new Map<string, { until: number; value: GammaSnapshot }>();
export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  let uid: string;
  try { uid = (await adminAuth.verifyIdToken(token)).uid; }
  catch { return NextResponse.json({ error: 'Your session expired. Please sign in again.' }, { status: 401 }); }
  const expiry = request.nextUrl.searchParams.get('expiry') ?? '';
  if (expiry && !/^\d{10}$/.test(expiry)) return NextResponse.json({ error: 'Invalid expiry.' }, { status: 400 });
  const valuation = request.nextUrl.searchParams.get('valuation');
  const valuationMs = valuation ? Date.parse(valuation) : null;
  if (valuation && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(valuation) || !Number.isFinite(valuationMs) || new Date(valuationMs!).toISOString() !== valuation)) {
    return NextResponse.json({ error: 'Invalid valuation date/time.' }, { status: 400 });
  }
  const key = `${uid}:${expiry}:${valuation ?? 'snapshot'}`;
  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) return NextResponse.json(cached.value, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const config = await getCachedBrokerConfig(uid, 'fyers');
    if (!config?.accessToken) return NextResponse.json({ error: 'Connect FYERS in Broker Settings to load NIFTY gamma exposure.' }, { status: 409 });
    const [chain, positioning] = await Promise.all([
      fetchFyersGammaChain(`${decryptData(config.apiKey)}:${decryptData(config.accessToken)}`, expiry),
      fetchParticipantPositioning(),
    ]);
    if (valuationMs !== null && valuationMs >= chain.expiryMs) return NextResponse.json({ error: 'Valuation time must be before expiry at 15:30 IST.' }, { status: 400 });
    const value: GammaSnapshot = { ...calculateGammaExposure(chain.legs, chain.spot, chain.expiryMs, valuationMs, positioning), spot: chain.spot, expiry: chain.expiry, expiries: chain.expiries, fetchedAt: new Date().toISOString() };
    await storeGammaHistory(value);
    for (const [k, v] of cache) if (v.until <= Date.now()) cache.delete(k);
    cache.set(key, { until: Date.now() + 60000, value });
    return NextResponse.json(value, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load gamma exposure.' }, { status: 502 });
  }
}
