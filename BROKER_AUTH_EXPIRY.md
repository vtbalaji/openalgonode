# Broker Authentication Expiry Guide

## The Problem: Broker Tokens Expire

### What is Broker Token Expiry?

When you authenticate with Zerodha (or any broker), they give you an **access token** that is valid for a limited time.

```
Zerodha OAuth Flow:
1. You login → Zerodha gives you a REQUEST TOKEN (valid 2 minutes)
2. You exchange it → Zerodha gives you an ACCESS TOKEN (valid until market close OR session expires)
3. Access Token expires → You can't make API calls anymore
```

**Typical Expiry Times:**
- **REQUEST TOKEN:** 2 minutes
- **ACCESS TOKEN:** Until market close (3:30 PM IST) OR overnight
- **During Holiday:** Tokens expire at end of day
- **Next Day:** Tokens are invalid - need to re-authenticate

---

## How OpenAlgo Handles This

### OpenAlgo's Approach (Python):

```python
# 1. Check Token Validity (Before Making API Calls)
def validate_token(access_token):
    try:
        # Try to fetch order book - if it fails, token is expired
        kite.orders()
        return True
    except:
        return False  # Token expired

# 2. Auto-Refresh Strategy (Not implemented in OpenAlgo)
# OpenAlgo expects user to re-authenticate manually

# 3. User Notification
# Show UI message: "Broker not authenticated. Please authenticate first."
```

**OpenAlgo's Philosophy:**
- ✅ Simple: User authenticates once per day/session
- ✅ Explicit: No hidden token refresh
- ❌ Limited: Requires manual re-auth when expires

---

## How We Should Handle It (Best Practices)

### 1. **Token Expiry Detection**

**Check expiry in two ways:**

```typescript
// Method 1: Check token timestamp
const isTokenExpired = (createdAt: Date, expiryHours: number = 6) => {
  const now = new Date();
  const hoursPassed = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
  return hoursPassed > expiryHours;
};

// Method 2: Try API call and catch error
const validateTokenWithAPI = async (accessToken) => {
  try {
    await kite.getOrderBook();  // If succeeds, token is valid
    return { valid: true };
  } catch (error) {
    if (error.message.includes("401") || error.message.includes("Unauthorized")) {
      return { valid: false, reason: "Token expired" };
    }
  }
};
```

### 2. **When to Check?**

```
✅ Check On:
- Page load (whenever user visits dashboard)
- Before making API calls (place order, cancel order, etc.)
- Periodically (every 30 minutes)
- When API call fails with 401 error

✅ What to Do:
- Show warning: "Broker session expiring soon"
- Show error: "Broker session expired. Please re-authenticate"
- Redirect user to re-authenticate
```

### 3. **User Communication**

```
🟢 VALID (Fresh Token):
"✅ Broker authenticated and ready to use"
Subtitle: "Session valid until market close"

🟡 WARNING (Expiring Soon):
"⚠️ Broker session expiring soon"
Subtitle: "Please re-authenticate to continue trading"
Button: [Re-authenticate with Zerodha]

🔴 EXPIRED (Token Invalid):
"❌ Broker session expired"
Subtitle: "Your trading session has ended. Please authenticate again"
Button: [Authenticate with Zerodha]
```

---

## Implementation Strategy

### Phase 1: Status Indicator (Simple)
```typescript
// Show current broker status with expiry time
<BrokerAuthStatus
  status="valid"  // or "warning" or "expired"
  expiresAt={new Date()}
/>
```

### Phase 2: Auto-Expiry Check (Intermediate)
```typescript
// Check every 30 minutes
setInterval(() => {
  const isExpired = checkBrokerTokenExpiry();
  if (isExpired) {
    showWarning("Please re-authenticate");
  }
}, 30 * 60 * 1000);
```

### Phase 3: Token Refresh (Advanced)
```typescript
// For this: Zerodha doesn't support token refresh
// Solution: Store login flow and auto-re-auth?
// (Not recommended - security risk)
```

---

## Best Practice Approach (Recommended)

### **What We Should Implement:**

```
1. ✅ Show Auth Status Clearly
   - Dashboard card showing "Broker Authenticated ✅"
   - Display expiry time (when it expires)
   - Color indicator (green = valid, orange = expiring soon, red = expired)

2. ✅ Warn Before Expiry
   - When <1 hour left: Show orange warning
   - Prompt user to re-authenticate before it expires
   - Don't force re-auth (let them continue if they want)

3. ✅ Handle Expiry Gracefully
   - When API call fails (401 error): Show error message
   - Suggest: "Your session expired. Click here to re-authenticate"
   - Redirect to OAuth flow
   - No data loss, user can retry after auth

4. ✅ Periodic Validation
   - Check token validity when user opens dashboard
   - Don't check too often (every 5-10 minutes max)
   - Graceful degradation on check failure
```

---

## Implementation: Status Component

```typescript
// components/BrokerAuthStatus.tsx
interface BrokerAuthStatusProps {
  status: 'valid' | 'expiring' | 'expired';
  expiresAt?: Date;
  onReAuth?: () => void;
}

export function BrokerAuthStatus({ status, expiresAt, onReAuth }: BrokerAuthStatusProps) {
  return (
    <div className={`
      p-4 rounded-lg flex justify-between items-center
      ${status === 'valid' ? 'bg-green-50 border border-green-200' : ''}
      ${status === 'expiring' ? 'bg-yellow-50 border border-yellow-200' : ''}
      ${status === 'expired' ? 'bg-red-50 border border-red-200' : ''}
    `}>
      <div>
        <h3 className="font-semibold">
          {status === 'valid' && '✅ Broker Authenticated'}
          {status === 'expiring' && '⚠️ Session Expiring Soon'}
          {status === 'expired' && '❌ Session Expired'}
        </h3>
        <p className="text-sm text-gray-600">
          {status === 'valid' && `Valid until ${expiresAt?.toLocaleTimeString()}`}
          {status === 'expiring' && `Expires in ${getTimeRemaining(expiresAt)} minutes`}
          {status === 'expired' && 'Please re-authenticate to continue'}
        </p>
      </div>

      {(status === 'expiring' || status === 'expired') && (
        <button
          onClick={onReAuth}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Re-authenticate
        </button>
      )}
    </div>
  );
}
```

---

## How to Get Expiry Time

### Zerodha Specifics:

```typescript
// When you authenticate, you get:
{
  "access_token": "rkm814502vz6x5jk:xxxx...",
  "user": {
    "user_id": "ZW1234",
    "login_time": "2024-01-15T09:30:00",
    // Zerodha does NOT return expiry_time!
    // You must calculate it yourself
  }
}

// Strategy: Store auth timestamp
const brokerConfig = {
  accessToken: "rkm814502vz6x5jk:xxxx...",
  authenticatedAt: new Date(),  // Store this!
  expiresIn: 6 * 60 * 60 * 1000, // 6 hours (estimate)
  expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000)
};
```

---

## API Response Handling

### When Token Expires (API Error):

```typescript
// Every API call should handle 401 errors
try {
  const orders = await fetch('/api/v1/orderbook', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
} catch (error) {
  if (error.status === 401) {
    // Token expired!
    showError("Your broker session has expired");
    redirectToAuth();
  }
}
```

---

## User Experience Flow

```
┌─────────────────────────────────────────────┐
│  User Opens Dashboard                       │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│  Check: Is broker token expired?            │
└────────────────┬────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
    ✅ VALID         ❌ EXPIRED
        │                 │
        ▼                 ▼
   Show: "✅ Ready"  Show: "❌ Expired"
        │                 │
        ▼                 ▼
   Can Trade      Can't Trade
                      │
                      ▼
                  [Re-authenticate]
                      │
                      ▼
                  Redirects to Zerodha
                      │
                      ▼
                  Returns with new token
                      │
                      ▼
                  Back to Dashboard ✅
```

---

## Summary: What to Say

### **When Authenticated & Valid:**
```
"✅ Your broker is authenticated and ready to use"
Subtitle: "Session valid until [TIME]"
```

### **When Expiring Soon:**
```
"⚠️ Your broker session is expiring soon"
Subtitle: "Re-authenticate to continue trading"
Action: [Re-authenticate with Zerodha]
```

### **When Expired:**
```
"❌ Your broker session has expired"
Subtitle: "Please authenticate again to resume trading"
Action: [Authenticate with Zerodha]
```

---

## Next Steps

### To Implement This:

1. **Create `BrokerAuthStatus` component** (displays current status)
2. **Add expiry check function** (validates token)
3. **Store auth timestamp** (track when authenticated)
4. **Show status on dashboard** (alerts user to expiry)
5. **Handle 401 errors** (gracefully handle expired tokens)

Would you like me to implement this now?
