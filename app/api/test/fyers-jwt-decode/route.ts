import { NextRequest, NextResponse } from 'next/server';
import { getCachedBrokerConfig } from '@/lib/brokerConfigUtils';
import { decryptData } from '@/lib/encryptionUtils';

/**
 * POST /api/test/fyers-jwt-decode
 * Decode the JWT token and extract app_id
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Get broker config
    const configData = await getCachedBrokerConfig(userId, 'fyers');
    if (!configData) {
      return NextResponse.json({ error: 'Broker not configured' }, { status: 404 });
    }

    // Decrypt access token
    let accessToken: string;
    try {
      accessToken = decryptData(configData.accessToken);
    } catch (error) {
      return NextResponse.json({ error: 'Failed to decrypt' }, { status: 400 });
    }

    // Decode JWT (format: header.payload.signature)
    const parts = accessToken.split('.');
    if (parts.length !== 3) {
      return NextResponse.json({ error: 'Invalid JWT format' }, { status: 400 });
    }

    // Decode payload (base64 URL encoded)
    const payload = parts[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));

    console.log('[JWT-DECODE] Decoded JWT payload:', decoded);

    // Extract app_id
    const appId = decoded.app_id;
    const uuid = decoded.uuid;
    const hsmKey = decoded.hsm_key;

    return NextResponse.json(
      {
        jwt: {
          app_id: appId,
          uuid: uuid,
          hsm_key: hsmKey,
          full_payload: decoded,
        },
        accessToken: accessToken.substring(0, 50) + '...',
        suggestion: `Try using app_id:accessToken format: ${appId}:{accessToken}`,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error decoding JWT:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to decode JWT' },
      { status: 500 }
    );
  }
}
