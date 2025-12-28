import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import { invalidateBrokerConfig } from '@/lib/brokerConfigUtils';

/**
 * DELETE /api/broker/config/delete
 * Delete broker configuration (for testing purposes)
 * Requires: Authorization header with Firebase ID token
 */
export async function DELETE(request: NextRequest) {
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
    const broker = request.nextUrl.searchParams.get('broker');

    if (!broker) {
      return NextResponse.json(
        { error: 'Missing required parameter: broker' },
        { status: 400 }
      );
    }

    console.log(`[DELETE-CONFIG] Deleting broker config for user=${userId}, broker=${broker}`);

    // Delete the broker config document
    const userRef = adminDb.collection('users').doc(userId);
    const brokerConfigRef = userRef.collection('brokerConfig').doc(broker);

    await brokerConfigRef.delete();

    console.log(`[DELETE-CONFIG] Successfully deleted broker config for ${broker}`);

    // Invalidate cache
    invalidateBrokerConfig(userId, broker);

    return NextResponse.json(
      {
        success: true,
        message: `${broker} broker configuration deleted`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting broker config:', error);
    return NextResponse.json(
      { error: 'Failed to delete broker configuration' },
      { status: 500 }
    );
  }
}
