import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, requirePermission } from '@/lib/apiKeyAuth';
import { ClosePositionRequest, OrderResponse } from '@/lib/types/openalgo';
import { adminDb } from '@/lib/firebaseAdmin';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * POST /api/v1/closeposition
 * OpenAlgo-compatible close position endpoint
 * Authentication: API key in request body
 */
export async function POST(request: NextRequest) {
  try {
    const body: ClosePositionRequest = await request.json();

    const authResult = await authenticateApiKey(body.apikey);
    if (!authResult.success) {
      return authResult.response;
    }

    const { userId, broker, permissions } = authResult.context;
    const permissionError = requirePermission(permissions, 'closeposition');
    if (permissionError) {
      return permissionError;
    }

    // Validate required fields
    if (!body.symbol || !body.exchange || !body.product) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Missing required fields: symbol, exchange, product',
        },
        { status: 400 }
      );
    }

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

    // Close position based on broker
    if (broker === 'zerodha') {
      const { closePosition } = await import('@/lib/zerodhaClient');

      try {
        const result = await closePosition(
          accessToken,
          body.symbol,
          body.exchange,
          body.product as 'MIS' | 'CNC' | 'NRML'
        );

        const response: OrderResponse = {
          status: 'success',
          orderid: result.order_id,
          message: 'Position closed successfully',
        };

        return NextResponse.json(response, { status: 200 });
      } catch (error: any) {
        const response: OrderResponse = {
          status: 'error',
          message: error.message || 'Failed to close position',
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
    console.error('Error in closeposition API:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
