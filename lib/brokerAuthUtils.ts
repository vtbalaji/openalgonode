/**
 * Broker Authentication Utilities
 * Handle broker token expiry checks and status calculation
 */

export interface BrokerAuthStatus {
  status: 'valid' | 'expiring' | 'expired';
  expiresAt: Date | null;
  timeRemaining: {
    hours: number;
    minutes: number;
    seconds: number;
  } | null;
  message: string;
}

/**
 * Calculate milliseconds until next midnight (IST)
 * Tokens are valid till end of trading day (12:00 AM midnight)
 */
export function calculateMsUntilMidnight(fromDate: Date = new Date()): number {
  // Create a date for next midnight in IST timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

  // Get today's date in IST
  const istDateString = formatter.format(fromDate);
  const [month, day, year] = istDateString.split('/');

  // Create midnight of next day IST
  const nextDayIST = new Date(`${year}-${month}-${day}T23:59:59+05:30`);
  nextDayIST.setDate(nextDayIST.getDate() + 1);
  nextDayIST.setHours(0, 0, 0, 0);

  // Convert to milliseconds from now
  const msUntilMidnight = nextDayIST.getTime() - fromDate.getTime();
  return Math.max(msUntilMidnight, 0); // Ensure non-negative
}

/**
 * Calculate broker auth status based on lastAuthenticated timestamp
 *
 * Fyers/NSE tokens expire at end of trading day (midnight 12:00 AM IST)
 * They are valid for the entire trading day they are issued
 *
 * Status:
 * - valid: Token has >1 hour remaining
 * - expiring: Token has 30 min - 1 hour remaining
 * - expired: Token has <30 min remaining or is past expiry
 */
export function calculateBrokerAuthStatus(lastAuthenticatedAt: Date | null): BrokerAuthStatus {
  if (!lastAuthenticatedAt) {
    return {
      status: 'expired',
      expiresAt: null,
      timeRemaining: null,
      message: 'Broker not authenticated. Please authenticate first.',
    };
  }

  // Tokens expire at end of current trading day (midnight IST)
  const EXPIRY_THRESHOLD_MINUTES = 30; // Show warning when <30 min left

  const lastAuthDate = new Date(lastAuthenticatedAt);
  const msUntilMidnight = calculateMsUntilMidnight(lastAuthDate);
  const expiresAt = new Date(lastAuthDate.getTime() + msUntilMidnight);
  const now = new Date();

  const timeDiffMs = expiresAt.getTime() - now.getTime();
  const totalMinutesRemaining = timeDiffMs / (1000 * 60);

  let status: 'valid' | 'expiring' | 'expired';

  // Check if token is still valid based on time remaining
  if (totalMinutesRemaining < 0) {
    status = 'expired';
  } else if (totalMinutesRemaining < EXPIRY_THRESHOLD_MINUTES) {
    status = 'expiring';
  } else {
    status = 'valid';
  }

  // Calculate time remaining
  const hours = Math.floor(Math.abs(totalMinutesRemaining) / 60);
  const minutes = Math.floor(Math.abs(totalMinutesRemaining) % 60);
  const seconds = Math.floor((Math.abs(totalMinutesRemaining) * 60) % 60);

  let message = '';
  switch (status) {
    case 'valid':
      message = `Session valid for ${hours}h ${minutes}m`;
      break;
    case 'expiring':
      message = `Session expiring in ${minutes}m`;
      break;
    case 'expired':
      message = 'Session expired. Please re-authenticate.';
      break;
  }

  return {
    status,
    expiresAt,
    timeRemaining: totalMinutesRemaining >= 0
      ? { hours, minutes, seconds }
      : null,
    message,
  };
}

/**
 * Format a date for display
 */
export function formatAuthTime(date: Date | string | null): string {
  if (!date) {
    return 'Not available';
  }

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : new Date(date);

    // Validate that the date is valid
    if (isNaN(dateObj.getTime())) {
      return 'Invalid date';
    }

    return new Intl.DateTimeFormat('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata'
    }).format(dateObj);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
}

/**
 * Get a human-readable status label with emoji
 */
export function getStatusLabel(status: 'valid' | 'expiring' | 'expired'): string {
  switch (status) {
    case 'valid':
      return '✅ Authenticated';
    case 'expiring':
      return '⚠️ Expiring Soon';
    case 'expired':
      return '❌ Expired';
  }
}

/**
 * Get background color class for status
 */
export function getStatusBgClass(status: 'valid' | 'expiring' | 'expired'): string {
  switch (status) {
    case 'valid':
      return 'bg-green-50 border-green-200';
    case 'expiring':
      return 'bg-yellow-50 border-yellow-200';
    case 'expired':
      return 'bg-red-50 border-red-200';
  }
}

/**
 * Get text color class for status
 */
export function getStatusTextClass(status: 'valid' | 'expiring' | 'expired'): string {
  switch (status) {
    case 'valid':
      return 'text-green-800';
    case 'expiring':
      return 'text-yellow-800';
    case 'expired':
      return 'text-red-800';
  }
}

/**
 * Get button class for status (for Re-authenticate button)
 */
export function getStatusButtonClass(status: 'valid' | 'expiring' | 'expired'): string {
  switch (status) {
    case 'valid':
      return 'bg-blue-600 hover:bg-blue-700 text-white';
    case 'expiring':
      return 'bg-orange-600 hover:bg-orange-700 text-white';
    case 'expired':
      return 'bg-red-600 hover:bg-red-700 text-white';
  }
}
