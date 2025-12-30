/**
 * GET /api/test/whoami
 * Get current user info from Firebase ID token
 * Pass Authorization header with Firebase ID token
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        {
          error: 'Missing or invalid Authorization header',
          hint: 'Please login to the dashboard first, then copy the token from browser DevTools → Application → Local Storage → idToken'
        },
        { status: 401 }
      );
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    return NextResponse.json({
      success: true,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
      },
      message: `Use this URL to test Volume Profile: http://localhost:3000/api/test/volume-profile-reliance?userId=${decodedToken.uid}`
    });
  } catch (error: any) {
    console.error('[WHOAMI] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to verify token' },
      { status: 500 }
    );
  }
}
