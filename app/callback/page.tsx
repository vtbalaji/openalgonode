'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

function CallbackPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Authenticating with broker...');

  useEffect(() => {
    const handleCallback = async () => {
      // Get broker from URL parameter OR sessionStorage (fallback if broker parameter is lost)
      let broker = searchParams.get('broker');
      if (!broker) {
        // Try to get broker from sessionStorage (set before redirect to broker login)
        broker = typeof window !== 'undefined' ? sessionStorage.getItem('authenticatingBroker') : null;
      }

      // Get request token from URL (Zerodha returns as request_token parameter)
      const requestToken = searchParams.get('request_token');

      // Get Angel-specific parameters if present (Angel returns these directly after OAuth)
      const authToken = searchParams.get('auth_token');
      const feedToken = searchParams.get('feed_token');
      const refreshToken = searchParams.get('refresh_token');

      // Get Fyers-specific parameters (Fyers returns authCode after OAuth)
      // Fyers returns: code=200 (HTTP status), auth_code=<JWT>, and s=ok (status)
      // We use the auth_code JWT directly as the access token
      const authCode = searchParams.get('auth_code') || searchParams.get('code');

      // Log all query parameters for debugging
      const allParams: Record<string, string> = {};
      searchParams.forEach((value, key) => {
        allParams[key] = value;
      });
      console.log('[CALLBACK] All search params:', allParams);
      console.log('[CALLBACK] Extracted params:', {
        code: authCode,
        code_length: authCode?.length,
        request_token: searchParams.get('request_token'),
        auth_token: searchParams.get('auth_token'),
        state: searchParams.get('state'),
        error: searchParams.get('error'),
      });
      console.log('[CALLBACK] Current URL:', typeof window !== 'undefined' ? window.location.href : 'N/A');
      console.log('[CALLBACK] All URL params (full):', typeof window !== 'undefined' ? window.location.search : 'N/A');

      // Validate we have a broker
      if (!broker) {
        setStatus('error');
        setMessage('Invalid callback. Missing broker parameter. Please try again.');
        sessionStorage.removeItem('authenticatingBroker');
        setTimeout(() => router.push('/broker/config'), 3000);
        return;
      }

      // Check if we have appropriate parameters for the broker
      if (broker === 'zerodha' && !requestToken) {
        setStatus('error');
        setMessage('Invalid Zerodha callback. Missing request token.');
        sessionStorage.removeItem('authenticatingBroker');
        setTimeout(() => router.push('/broker/config'), 3000);
        return;
      }

      if (broker === 'angel' && !authToken) {
        setStatus('error');
        setMessage('Invalid Angel callback. Missing authentication token from Angel Broker.');
        sessionStorage.removeItem('authenticatingBroker');
        setTimeout(() => router.push('/broker/config'), 3000);
        return;
      }

      if (broker === 'fyers') {
        const fyersError = searchParams.get('error');
        if (fyersError) {
          setStatus('error');
          setMessage(`Fyers authorization failed: ${fyersError}`);
          sessionStorage.removeItem('authenticatingBroker');
          setTimeout(() => router.push('/broker/config'), 3000);
          return;
        }

        // Fyers returns auth_code (JWT) directly or code parameter
        const fyersAuthCode = searchParams.get('auth_code');
        const fyersCode = searchParams.get('code');
        const fyersStatus = searchParams.get('s');

        console.log('[CALLBACK-FYERS] Received parameters:', {
          auth_code: fyersAuthCode ? fyersAuthCode.substring(0, 50) + '...' : 'missing',
          code: fyersCode,
          s: fyersStatus,
          auth_code_length: fyersAuthCode?.length || 0,
        });

        if (!fyersAuthCode) {
          setStatus('error');
          setMessage('Invalid Fyers callback. Missing auth_code parameter.');
          sessionStorage.removeItem('authenticatingBroker');
          setTimeout(() => router.push('/broker/config'), 3000);
          return;
        }

        // auth_code should be a JWT (contains dots)
        if (!fyersAuthCode.includes('.')) {
          console.error('[CALLBACK-FYERS] auth_code is not a JWT:', fyersAuthCode);
          setStatus('error');
          setMessage('Invalid Fyers auth_code format. Expected JWT token.');
          sessionStorage.removeItem('authenticatingBroker');
          setTimeout(() => router.push('/broker/config'), 3000);
          return;
        }
      }

      // Wait for user to be authenticated
      if (!user) {
        // User not logged in, wait a bit
        setTimeout(() => {
          if (!user) {
            setStatus('error');
            setMessage('Please log in first.');
            sessionStorage.removeItem('authenticatingBroker');
            setTimeout(() => router.push('/login'), 3000);
          }
        }, 2000);
        return;
      }

      try {
        setMessage(`Authenticating with ${broker}...`);

        const idToken = await user.getIdToken();

        // Build request body based on broker type
        const body: any = { broker };

        if (broker === 'zerodha') {
          body.requestToken = requestToken;
        } else if (broker === 'angel') {
          // Angel returns tokens directly after OAuth - use them directly
          body.accessToken = authToken;
          body.feedToken = feedToken;
          body.refreshToken = refreshToken;
        } else if (broker === 'fyers') {
          // Fyers returns authCode after OAuth - exchange it for access token
          body.authCode = authCode;
        }

        const response = await fetch('/api/broker/authenticate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify(body),
        });

        if (response.ok) {
          setStatus('success');
          setMessage('Authentication successful! Redirecting to broker config...');

          // Clear sessionStorage since authentication is complete
          sessionStorage.removeItem('authenticatingBroker');

          // Redirect back to broker config page after 2 seconds
          setTimeout(() => {
            router.push('/broker/config');
          }, 2000);
        } else {
          const data = await response.json();
          setStatus('error');
          setMessage(data.error || 'Authentication failed. Please try again.');
          sessionStorage.removeItem('authenticatingBroker');
          setTimeout(() => router.push('/broker/config'), 3000);
        }
      } catch (err: any) {
        setStatus('error');
        setMessage(err.message || 'An error occurred during authentication.');
        sessionStorage.removeItem('authenticatingBroker');
        setTimeout(() => router.push('/broker/config'), 3000);
      }
    };

    handleCallback();
  }, [user, searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        {status === 'processing' && (
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"></div>
            <h2 className="mb-2 text-xl font-semibold text-gray-900">Processing...</h2>
            <p className="text-gray-600">{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="mb-2 text-xl font-semibold text-green-900">Success!</h2>
            <p className="text-gray-600">{message}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="mb-2 text-xl font-semibold text-red-900">Authentication Failed</h2>
            <p className="mb-4 text-gray-600">{message}</p>
            <p className="text-sm text-gray-500">Redirecting to broker config in 3 seconds...</p>
            <button
              onClick={() => router.push('/broker/config')}
              className="mt-4 rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700"
            >
              Go to Broker Config Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CallbackPageContent />
    </Suspense>
  );
}
