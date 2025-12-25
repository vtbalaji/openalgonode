# WebSocket Troubleshooting Guide

## Issue Fixed: API Key Not Decrypted

**Problem:** WebSocket was failing to connect because the API key was encrypted when passed to KiteTicker.

**Solution:** Updated `/app/api/stream/prices/route.ts` to decrypt both `accessToken` AND `apiKey`.

---

## Steps to Test the Fix:

### 1. Restart Dev Server (if needed)
```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

### 2. Clear Browser Cache
- Open DevTools (F12)
- Go to Network tab
- Check "Disable cache"
- Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### 3. Navigate to Live Prices
```
http://localhost:3001/live-prices
```

### 4. Add RELIANCE Symbol
- Type "RELIANCE" in the input box
- Click "Add" or press Enter
- Symbol should appear in watchlist

### 5. Check Connection Indicator
- Look for green pulsing dot next to "LIVE"
- If green = Connected ✅
- If red/gray = Disconnected ❌

### 6. Watch for Price Updates
- Prices should start updating within 5-10 seconds
- Look for green/red flash animations
- OHLC values should populate

---

## Debugging Steps:

### Check Server Console
Look for these messages:
```
✅ Good signs:
🔌 Client connected for symbols: RELIANCE
📊 Instrument tokens: 738561
🚀 Initializing WebSocket connection to Zerodha...
📍 API Key (first 10 chars): xxx...
🔑 Access Token (first 10 chars): xxx...
✅ WebSocket connected to Zerodha
```

```
❌ Bad signs:
Error: Invalid API credentials
WebSocket error: ...
Connection refused
```

### Check Browser Console (F12)
Look for:
```
✅ Good:
EventSource connected
Real-time connection established
Received tick for RELIANCE

❌ Bad:
EventSource error
Connection failed
401 Unauthorized
```

### Check Network Tab
1. Open DevTools → Network tab
2. Look for `stream/prices?symbols=RELIANCE...`
3. Should show status: "pending" (stays open)
4. Click on it → EventStream tab
5. Should see messages flowing in

---

## Common Issues:

### 1. "Broker not authenticated"
**Cause:** Access token expired or not configured
**Fix:**
```
1. Go to Dashboard → Broker Configuration
2. Click "Authenticate with Zerodha"
3. Complete login flow
4. Try live prices again
```

### 2. "No valid symbols found"
**Cause:** Symbol not in instrument mapping
**Fix:**
```
Edit: lib/websocket/instrumentMapping.ts
Add your symbol:
  'YOURSYMBOL': 123456,  // Get token from Zerodha instruments
```

### 3. WebSocket keeps disconnecting
**Cause:** Session expired or network issues
**Fix:**
```
1. Re-authenticate broker
2. Check internet connection
3. Check Zerodha server status
4. Try different symbol
```

### 4. Prices not updating (but connected)
**Cause:** Market closed or low trading activity
**Fix:**
```
- Check if market is open (9:15 AM - 3:30 PM IST)
- Try different symbol with more activity
- Wait 30 seconds for first tick
```

---

## How to Verify Fix:

### Test 1: Check API Key Decryption
```bash
# In server console, you should see:
📍 API Key (first 10 chars): yourApiKey...  # Should be readable, not "U2FsdGVkX1..."
```

### Test 2: Check WebSocket URL
```bash
# Should NOT contain encrypted values
# Bad:  wss://ws.kite.trade/?api_key=U2FsdGVkX1...
# Good: wss://ws.kite.trade/?api_key=yourActualKey...
```

### Test 3: Connection Success
```bash
# Server console should show:
✅ WebSocket connected to Zerodha
```

---

## Manual Test with cURL:

```bash
# Test SSE endpoint directly
curl -N "http://localhost:3001/api/stream/prices?symbols=RELIANCE&userId=YOUR_USER_ID&broker=zerodha"

# Should see:
data: {"type":"connected","symbols":["RELIANCE"],"tokens":[738561]}
data: {"type":"tick","symbol":"RELIANCE","data":{...}}
```

---

## What Changed:

### Before (Bug):
```typescript
const accessToken = decryptData(configData.accessToken);
const apiKey = configData.apiKey;  // ❌ Not decrypted!
```

### After (Fixed):
```typescript
const accessToken = decryptData(configData.accessToken);
const apiKey = decryptData(configData.apiKey);  // ✅ Now decrypted!
```

---

## Next Steps if Still Not Working:

1. **Check Firestore Data:**
```
- Go to Firebase Console
- Firestore Database
- users/{userId}/brokerConfig/zerodha
- Verify apiKey and accessToken exist
- Both should be encrypted strings
```

2. **Verify Instrument Token:**
```typescript
// In browser console:
console.log(getInstrumentToken('RELIANCE'));
// Should return: 738561
```

3. **Test with Different Symbol:**
```
Try: TCS, INFY, HDFCBANK
These are guaranteed to have high activity
```

4. **Check Zerodha Status:**
```
Visit: https://kite.trade
Ensure Zerodha servers are operational
```

---

## Success Criteria:

✅ Green connection indicator
✅ Prices updating every few seconds
✅ Flash animations on price changes
✅ OHLC values populated
✅ Volume showing
✅ No errors in console

---

## If You See This Working:

You should see:
- 🟢 LIVE indicator (green pulsing dot)
- Price changing every 2-5 seconds
- Green flash when price goes up
- Red flash when price goes down
- OHLC cards showing real values
- Volume count updating

This means **WebSocket is working perfectly!** 🎉
