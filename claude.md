# API Architecture - 3-Layer Structure

## Overview
Clean separation of concerns across three API layers: External, UI, and Broker-specific.

---

## Layer 1: External API (`/api/v1/*`)
**Purpose**: Third-party integrations (OpenAlgo compatible)

**Responsibility**:
- API key authentication only
- No Firebase access
- Routes requests to broker-specific endpoints
- Maintains OpenAlgo schema

**Endpoints** (10 total):
- `POST /api/v1/placeorder` → calls `/api/broker/zerodha/place-order`
- `POST /api/v1/cancelorder` → calls `/api/broker/zerodha/cancel-order`
- `POST /api/v1/modifyorder` → calls `/api/broker/zerodha/modify-order`
- `POST /api/v1/orderbook`, `tradebook`, `positionbook`, `holdings`, `funds`, `closeposition`, `cancelallorder`

**Data Flow**: External System → Authenticate API Key → Validate → Route to Broker

---

## Layer 2: Dashboard UI API (`/api/ui/dashboard/*`)
**Purpose**: Web dashboard interface

**Responsibility**:
- Firebase ID token authentication
- Uses brokerConfig cache (5-min TTL)
- Routes to broker-specific endpoints
- Maps responses to UI format

**Endpoints** (5 total):
- `POST /api/ui/dashboard/place` → calls `/api/broker/zerodha/place-order`
- `POST /api/ui/dashboard/cancel` → calls `/api/broker/zerodha/cancel-order`
- `POST /api/ui/dashboard/modify` → calls `/api/broker/zerodha/modify-order`
- `GET /api/ui/dashboard/positions` → calls `/api/broker/zerodha/positions`
- `GET /api/ui/dashboard/status` → calls `/api/broker/zerodha/orderbook`

**Data Flow**: Dashboard → Authenticate Firebase Token → Route to Broker

---

## Layer 3: Broker-Specific API (`/api/broker/{broker}/*`)
**Purpose**: Isolated broker implementation (only Zerodha for now)

**Responsibility**:
- Get broker config from cache
- Decrypt credentials
- Call actual broker APIs
- Store results in Firestore
- All broker-specific logic isolated here

**Zerodha Endpoints** (10 total):
- `POST /api/broker/zerodha/place-order`
- `POST /api/broker/zerodha/cancel-order`
- `POST /api/broker/zerodha/modify-order`
- `POST /api/broker/zerodha/cancel-all-orders`
- `POST /api/broker/zerodha/orderbook`
- `POST /api/broker/zerodha/tradebook`
- `POST /api/broker/zerodha/positions`
- `POST /api/broker/zerodha/holdings`
- `POST /api/broker/zerodha/funds`
- `POST /api/broker/zerodha/close-position`

**Data Flow**: Get Config (cached) → Decrypt Credentials → Call Zerodha → Return Response

---

## Support Endpoints (`/api/broker/*`)
**Config Management**:
- `POST /api/broker/config` - Save API key/secret (encrypted)
- `GET /api/broker/config` - Retrieve config status
- `POST /api/broker/authenticate` - OAuth token exchange
- `POST /api/broker/login-url` - Generate Zerodha login URL

---

## Security & Caching

**Encryption**:
- Credentials encrypted with AES before Firestore storage
- Decryption only in broker endpoints
- Centralized in `/lib/encryptionUtils.ts`

**Caching**:
- 5-minute TTL for broker config
- 99.97% Firebase read reduction
- Auto-cleanup every 1 minute

---

## Adding New Brokers

To add Angel Broking support:
1. Create `/api/broker/angel/` directory
2. Implement same 10 endpoints as Zerodha
3. Update v1 routers to support Angel (add conditional routing)
4. Update UI dashboard to support Angel selection

---

## Architecture Benefits

✅ Clear separation of concerns
✅ External API isolated from Firebase
✅ Credentials only accessed in broker layer
✅ Easy to add new brokers
✅ Self-documenting via directory structure
✅ No code duplication across layers
- Original Python Flask app remains untouched
- New Next.js app is standalone
- Can run both simultaneously for testing
- Plan to eventually replace Flask app with Next.js
- Explain everything directly on screen/terminal
- Keep it comprehensive and clear in the conversation
- Only create MD files when you specifically ask for them
- Avoid pre-emptive documentation

---

# Early Harmonic Pattern Detection (Fibonacci Chart)

## Concept
Detect early formation of harmonic patterns by identifying Fibonacci retracement + pullback sequences BEFORE full pattern completion. This provides earlier entry signals with better risk/reward.

## Pattern Structure

**Standard Harmonic Pattern Legs:**
```
X → A → B → C → D
```

**Early Detection (Enter at C or early D):**
```
1. XA: Initial swing (high → low or low → high)
2. AB: Retracement to Fib level (38.2%, 50%, 61.8% of XA)
3. BC: Small pullback (38.2%-88.6% of AB) ← EARLY SIGNAL
4. CD: Resumption (if breaks above/below B point) ← ENTRY TRIGGER
```

## Implementation Plan

### Phase 1: Detection Algorithm
**File**: `/lib/indicators/harmonicDetection.ts`

```typescript
interface HarmonicSetup {
  type: 'bullish' | 'bearish';
  points: {
    X: { time: number; price: number; index: number };
    A: { time: number; price: number; index: number };
    B: { time: number; price: number; index: number };
    C: { time: number; price: number; index: number };
  };
  fibLevels: {
    AB_retracement: number; // % of XA (38.2, 50, 61.8)
    BC_pullback: number;    // % of AB (38.2-88.6)
  };
  status: 'forming' | 'valid' | 'broken';
  confidence: number; // 0-100
}
```

**Detection Logic:**
1. Find XA leg (use existing swing detection)
2. Scan for AB retracement:
   - Must retrace 38.2%-61.8% of XA
   - Track point B (highest high in uptrend, lowest low in downtrend)
3. Monitor BC pullback:
   - Must pullback 38.2%-88.6% of AB
   - Track point C (current position)
4. Signal when:
   - BC pullback is 38.2%-50% (early, conservative)
   - Price starts moving back toward B (potential CD leg)

### Phase 2: Visual Indicators
**File**: `/components/FibonacciTradingChart.tsx`

**Add to chart:**
1. **XABCD Points**: Circle markers at each point
   - X: Gray circle
   - A: Red/Green circle (direction indicator)
   - B: Blue circle (retracement point)
   - C: Yellow circle (pullback point)

2. **Connecting Lines**: Diagonal lines X→A→B→C

3. **Shaded Zones**:
   - AB zone: Light blue (valid retracement range 38.2%-61.8%)
   - BC zone: Light yellow (valid pullback range 38.2%-88.6%)

4. **Entry Signal**:
   - Green arrow when CD leg starts (price moves back toward B)
   - Text label: "Early Entry: [pattern type]"

### Phase 3: UI Controls
**File**: `/app/chart-fib/page.tsx`

**Add checkbox:**
```tsx
☐ Harmonic (Early Detection)
```

**Settings panel:**
- Min AB Retracement: 38.2% (slider: 38.2-61.8)
- Max BC Pullback: 88.6% (slider: 38.2-88.6)
- Lookback Period: 50 candles (adjustable)

### Phase 4: Filtering & Alerts

**Valid Setup Criteria:**
1. AB retraces between 38.2%-61.8% of XA
2. BC pullback between 38.2%-88.6% of AB
3. Minimum XA leg size: 0.5% of price (filter noise)
4. Volume confirmation: BC volume < AB volume (shows exhaustion)

**Entry Trigger:**
- Price breaks above/below C point by 0.1%
- Moving in direction of original XA trend

**Risk Management:**
- Stop loss: Below/above C point (tight stop)
- Target 1: B point (initial target)
- Target 2: 127.2% extension of AB

## Example Scenarios

**Bullish Setup:**
```
X: 26330 (high)
A: 25880 (low) - XA range = 450 points
B: 26158 (retraced 61.8% of XA = 25880 + 278)
C: 26050 (pulled back 38.2% of AB = 26158 - 108)
→ Early Entry: ~26070 (when price breaks above C)
→ Stop: 26040 (below C)
→ Target 1: 26158 (B point)
→ Target 2: 26230 (127.2% extension)
```

**Bearish Setup:**
```
X: 25880 (low)
A: 26330 (high) - XA range = 450 points
B: 26052 (retraced 61.8% of XA = 26330 - 278)
C: 26160 (pulled back 38.2% of AB = 26052 + 108)
→ Early Entry: ~26140 (when price breaks below C)
→ Stop: 26170 (above C)
→ Target 1: 26052 (B point)
→ Target 2: 25980 (127.2% extension)
```

## Why This Works

✅ **Earlier Entry**: Enter at C instead of waiting for D
✅ **Tighter Stop**: Stop at C vs traditional stop at X
✅ **Better R:R**: Risk 20-30 points to gain 100+ points
✅ **Fibonacci Logic**: Based on proven market geometry
✅ **Confirmation**: Requires pullback (not just retracement)
✅ **Adaptive**: Works in any timeframe/symbol

## Implementation Order

1. ✅ Fibonacci retracement visualization (DONE)
2. ✅ Harmonic detection algorithm (DONE - /lib/indicators/harmonicDetection.ts)
3. ✅ XABCD point markers (DONE - visual circles and labels)
4. ✅ Entry/exit signals (DONE - arrows at point C when valid)
5. ✅ UI controls & settings (DONE - checkbox on /chart-fib page)
6. ✅ Ready for testing & validation

## Usage

1. Go to `/chart-fib` page
2. Enable "Harmonic (XABCD)" checkbox
3. Chart will detect:
   - X: Initial swing point (gray circle)
   - A: Opposite swing point (green/red circle)
   - B: Retracement point 38.2%-61.8% (blue circle)
   - C: Pullback point 38.2%-88.6% (yellow circle)
4. When pattern is valid:
   - Entry arrow appears at C (↗ bullish, ↘ bearish)
   - Info badge shows confidence % and entry price
   - Stop loss and targets calculated automatically

---
