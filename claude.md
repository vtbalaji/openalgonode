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
