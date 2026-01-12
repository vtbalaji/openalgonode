'use client';

import React, { useState, useEffect } from 'react';
import {
  calculateBrokerAuthStatus,
  formatAuthTime,
  getStatusLabel,
  getStatusBgClass,
  getStatusTextClass,
  getStatusButtonClass,
  type BrokerAuthStatus as IBrokerAuthStatus,
} from '@/lib/brokerAuthUtils';

interface BrokerAuthStatusProps {
  lastAuthenticatedAt: Date | null;
  broker: string;
  onReAuth?: () => void;
  onRefreshToken?: () => void;
  isRefreshingToken?: boolean;
  showDetails?: boolean;
  compact?: boolean;
  pin?: string;
  onPinChange?: (pin: string) => void;
}

export function BrokerAuthStatus({
  lastAuthenticatedAt,
  broker,
  onReAuth,
  onRefreshToken,
  isRefreshingToken = false,
  showDetails = true,
  compact = false,
  pin = '',
  onPinChange,
}: BrokerAuthStatusProps) {
  const [authStatus, setAuthStatus] = useState<IBrokerAuthStatus | null>(null);
  const [, setUpdateTrigger] = useState(0);

  // Recalculate status periodically (every 30 seconds)
  useEffect(() => {
    // Initial calculation
    const status = calculateBrokerAuthStatus(lastAuthenticatedAt);
    setAuthStatus(status);

    // Update every 30 seconds to show countdown
    const interval = setInterval(() => {
      const updatedStatus = calculateBrokerAuthStatus(lastAuthenticatedAt);
      setAuthStatus(updatedStatus);
      setUpdateTrigger((prev) => prev + 1);
    }, 30 * 1000);

    return () => clearInterval(interval);
  }, [lastAuthenticatedAt]);

  if (!authStatus) {
    return null;
  }

  const statusLabel = getStatusLabel(authStatus.status);
  const bgClass = getStatusBgClass(authStatus.status);
  const textClass = getStatusTextClass(authStatus.status);
  const buttonClass = getStatusButtonClass(authStatus.status);

  // Compact view
  if (compact) {
    return (
      <div className={`px-3 py-2 rounded-lg border flex items-center justify-between ${bgClass}`}>
        <div className={`text-sm font-medium ${textClass}`}>
          {statusLabel} {broker}
        </div>
        {(authStatus.status === 'expiring' || authStatus.status === 'expired') && onReAuth && (
          <button
            onClick={onReAuth}
            className={`ml-3 px-2 py-1 rounded text-xs font-medium ${buttonClass} transition-colors`}
          >
            Re-auth
          </button>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className={`rounded-lg border-2 p-6 ${bgClass}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className={`text-lg font-semibold ${textClass}`}>
            {statusLabel}
          </h3>
          <p className={`text-sm mt-2 ${textClass} opacity-90`}>
            {authStatus.message}
          </p>

          {showDetails && (
            <div className={`text-xs mt-4 ${textClass} opacity-75 space-y-1`}>
              {lastAuthenticatedAt && !isNaN(lastAuthenticatedAt.getTime()) ? (
                <>
                  <div>
                    <span className="font-medium">Authenticated:</span> {formatAuthTime(lastAuthenticatedAt)}
                  </div>
                  {authStatus.expiresAt && !isNaN(authStatus.expiresAt.getTime()) && (
                    <div>
                      <span className="font-medium">Expires at:</span> {formatAuthTime(authStatus.expiresAt)}
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <span className="font-medium">Status:</span> Not authenticated
                </div>
              )}
              <div>
                <span className="font-medium">Broker:</span> {broker}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PIN input for Fyers token refresh */}
      {broker === 'fyers' && onRefreshToken && (
        <div className="mt-4 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Fyers PIN (4-digit)
          </label>
          <input
            type="password"
            value={pin}
            onChange={(e) => onPinChange?.(e.target.value)}
            placeholder="Enter 4-digit PIN"
            maxLength={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Buttons section */}
      <div className="mt-4 flex flex-col gap-2">
        {(authStatus.status === 'expiring' || authStatus.status === 'expired') && onReAuth && (
          <button
            onClick={onReAuth}
            className={`px-4 py-2 rounded font-medium transition-colors ${buttonClass}`}
          >
            {authStatus.status === 'expired' ? 'Authenticate' : 'Re-authenticate'}
          </button>
        )}

        {authStatus.status === 'valid' && onReAuth && (
          <button
            onClick={onReAuth}
            className={`px-4 py-2 rounded font-medium transition-colors ${buttonClass} opacity-75 hover:opacity-100`}
          >
            Refresh (Auth)
          </button>
        )}

        {onRefreshToken && (
          <button
            onClick={onRefreshToken}
            disabled={isRefreshingToken}
            className={`px-4 py-2 rounded font-medium transition-colors bg-green-600 hover:bg-green-700 text-white ${
              isRefreshingToken ? 'opacity-50 cursor-not-allowed' : 'opacity-75 hover:opacity-100'
            }`}
          >
            {isRefreshingToken ? '⏳ Refreshing Token...' : 'Refresh (Token)'}
          </button>
        )}
      </div>

      {/* Status indicator dot */}
      <div className="mt-4 flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full ${
            authStatus.status === 'valid'
              ? 'bg-green-500'
              : authStatus.status === 'expiring'
                ? 'bg-yellow-500'
                : 'bg-red-500'
          } ${authStatus.status === 'valid' ? 'animate-pulse' : ''}`}
        />
        <span className={`text-xs font-medium ${textClass}`}>
          {authStatus.status === 'valid' && 'Ready to trade'}
          {authStatus.status === 'expiring' && 'Action required soon'}
          {authStatus.status === 'expired' && 'Action required immediately'}
        </span>
      </div>
    </div>
  );
}
