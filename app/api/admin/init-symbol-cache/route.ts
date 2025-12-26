/**
 * POST /api/admin/init-symbol-cache
 * Initialize in-memory symbol cache from Zerodha API
 * Can be called:
 * 1. On server startup (via deployment script)
 * 2. Manually to refresh symbols
 * 3. After broker authentication changes
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSymbolCache } from '@/lib/symbolCache';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let accessToken = body.accessToken;
    let apiKey = body.apiKey;
    let userId = body.userId;

    // If email provided, find the user and get their credentials
    if (!apiKey && !accessToken && body.email) {
      try {
        const userRecord = await adminAuth.getUserByEmail(body.email);
        userId = userRecord.uid;
        console.log(`Found user ${body.email} with ID: ${userId}`);
      } catch (error: any) {
        return NextResponse.json(
          { error: `User not found with email: ${body.email}` },
          { status: 404 }
        );
      }
    }

    // If not provided directly, try to get from Firebase using userId
    if (!apiKey && !accessToken && userId) {
      const brokerConfigRef = adminDb
        .collection('users')
        .doc(userId)
        .collection('brokerConfig')
        .doc('zerodha');

      const docSnap = await brokerConfigRef.get();

      if (!docSnap.exists) {
        return NextResponse.json(
          { error: 'Broker configuration not found for user' },
          { status: 404 }
        );
      }

      const configData = docSnap.data();

      if (!configData?.apiKey || !configData?.accessToken || configData.status !== 'active') {
        return NextResponse.json(
          { error: 'Broker not fully authenticated' },
          { status: 401 }
        );
      }

      // Decrypt credentials
      apiKey = decryptData(configData.apiKey);
      accessToken = decryptData(configData.accessToken);
    }

    if (!apiKey || !accessToken) {
      return NextResponse.json(
        { error: 'Missing API key or access token' },
        { status: 400 }
      );
    }

    // Load symbols into memory cache
    const cache = getSymbolCache();
    const success = await cache.load(apiKey, accessToken);

    if (!success) {
      const status = cache.getStatus();
      return NextResponse.json(
        {
          error: status.loadError || 'Failed to load symbols',
          status
        },
        { status: 500 }
      );
    }

    const status = cache.getStatus();
    return NextResponse.json(
      {
        success: true,
        message: `Symbol cache initialized with ${status.symbolCount} symbols`,
        status,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error initializing symbol cache:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initialize symbol cache' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/init-symbol-cache
 * Check symbol cache status
 */
export async function GET() {
  try {
    const cache = getSymbolCache();
    const status = cache.getStatus();

    return NextResponse.json(
      {
        success: true,
        status,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error getting symbol cache status:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get cache status' },
      { status: 500 }
    );
  }
}
