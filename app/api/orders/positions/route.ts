import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { getPositions } from '@/lib/zerodhaClient';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * GET /api/orders/positions
 * Get open positions from broker
 * Requires: Authorization header with Firebase ID token
 * Query params: broker (optional, defaults to 'zerodha')
 */
export async function GET(request: NextRequest) {
  try {
    // Get the Firebase ID token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const idToken = authHeader.substring(7);

    // Verify the token
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const userId = decodedToken.uid;
    const broker = request.nextUrl.searchParams.get('broker') || 'zerodha';

    // Retrieve broker config from cache
    const configData = await getCachedBrokerConfig(userId, broker);

    if (!configData) {
      return NextResponse.json(
        { error: 'Broker configuration not found' },
        { status: 404 }
      );
    }

    // Check if broker is authenticated
    if (!configData.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        { error: 'Broker not authenticated. Please authenticate first.' },
        { status: 401 }
      );
    }

    const accessToken = decryptData(configData.accessToken);

    // Get positions from Zerodha
    let positions;
    try {
      const positionsData = await getPositions(accessToken);

      // Combine both net and day positions
      const allPositions = [...(positionsData.net || []), ...(positionsData.day || [])];

      positions = allPositions;
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Failed to fetch positions' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        positions: positions || [],
        count: positions?.length || 0,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching positions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}
