import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, requirePermission } from '@/lib/apiKeyAuth';
import { TradeBookRequest, ApiResponse, TradeBookItem } from '@/lib/types/openalgo';
import { adminDb } from '@/lib/firebaseAdmin';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * POST /api/v1/tradebook
 * OpenAlgo-compatible trade book endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const body: TradeBookRequest = await request.json();
    const authResult = await authenticateApiKey(body.apikey);
    if (!authResult.success) return authResult.response;

    const { userId, broker, permissions } = authResult.context;
    const permissionError = requirePermission(permissions, 'vieworders');
    if (permissionError) return permissionError;

    // Get broker auth token from Firestore
    const brokerConfigRef = adminDb
      .collection('users')
      .doc(userId)
      .collection('brokerConfig')
      .doc(broker);

    const docSnap = await brokerConfigRef.get();

    if (!docSnap.exists) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Broker configuration not found',
        },
        { status: 404 }
      );
    }

    const configData = docSnap.data();

    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Broker not authenticated. Please authenticate first.',
        },
        { status: 401 }
      );
    }

    const accessToken = decryptData(configData.accessToken);

    // Fetch trade book based on broker
    if (broker === 'zerodha') {
      const { getTradeBook } = await import('@/lib/zerodhaClient');

      try {
        const trades = await getTradeBook(accessToken);

        const response: ApiResponse<TradeBookItem[]> = {
          status: 'success',
          data: trades,
        };

        return NextResponse.json(response, { status: 200 });
      } catch (error: any) {
        const response: ApiResponse<TradeBookItem[]> = {
          status: 'error',
          message: error.message || 'Failed to fetch trade book',
          data: [],
        };
        return NextResponse.json(response, { status: 400 });
      }
    } else {
      return NextResponse.json(
        {
          status: 'error',
          message: `Broker '${broker}' is not yet supported`,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error in tradebook API:', error);
    return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
  }
}
