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
      // Get request token from URL (Zerodha returns as request_token parameter)
      const requestToken = searchParams.get('request_token');

      // Check if we have a request token
      if (!requestToken) {
        setStatus('error');
        setMessage('Invalid callback. Missing request token from broker.');
        setTimeout(() => router.push('/broker/config'), 3000);
        return;
      }

      // Wait for user to be authenticated
      if (!user) {
        // User not logged in, wait a bit
        setTimeout(() => {
          if (!user) {
            setStatus('error');
            setMessage('Please log in first.');
            setTimeout(() => router.push('/login'), 3000);
          }
        }, 2000);
        return;
      }

      try {
        setMessage('Authenticating with broker...');

        const idToken = await user.getIdToken();
        const response = await fetch('/api/broker/authenticate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            broker: 'zerodha', // TODO: Get broker from session/state
            requestToken,
          }),
        });

        if (response.ok) {
          setStatus('success');
          setMessage('Authentication successful! Redirecting to broker config...');

          // Redirect back to broker config page after 2 seconds
          setTimeout(() => {
            router.push('/broker/config');
          }, 2000);
        } else {
          const data = await response.json();
          setStatus('error');
          setMessage(data.error || 'Authentication failed. Please try again.');
          setTimeout(() => router.push('/broker/config'), 3000);
        }
      } catch (err: any) {
        setStatus('error');
        setMessage(err.message || 'An error occurred during authentication.');
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
