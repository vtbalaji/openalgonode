/**
 * POST /api/broker/zerodha/funds
 * Get Zerodha account funds/margins
 * Internal endpoint - called by /api/v1/funds and /api/ui/
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { status: 'error', message: 'Missing userId' },
        { status: 400 }
      );
    }

    // Get Zerodha broker config
    const configData = await getCachedBrokerConfig(userId, 'zerodha');

    if (!configData) {
      return NextResponse.json(
        { status: 'error', message: 'Zerodha not configured' },
        { status: 404 }
      );
    }

    if (!configData?.accessToken || configData.status !== 'active') {
      return NextResponse.json(
        { status: 'error', message: 'Zerodha not authenticated' },
        { status: 401 }
      );
    }

    // Decrypt access token with error handling
    let accessToken: string;
    try {
      accessToken = decryptData(configData.accessToken);
    } catch (error) {
      console.error('Failed to decrypt access token:', error);
      return NextResponse.json(
        { status: 'error', message: 'Failed to decrypt credentials. Please re-authenticate.' },
        { status: 401 }
      );
    }

    // Import Zerodha client
    const { getMargins } = await import('@/lib/zerodhaClient');

    try {
      const funds = await getMargins(accessToken);

      return NextResponse.json(
        {
          status: 'success',
          data: funds || {},
        },
        { status: 200 }
      );
    } catch (error: any) {
      return NextResponse.json(
        { status: 'error', message: error.message || 'Failed to fetch funds' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in Zerodha funds:', error);
    return NextResponse.json(
      { status: 'error', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
