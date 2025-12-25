# OpenAlgoNode - Trading Platform

A modern, full-stack trading application built with Next.js, React, Firebase, and TypeScript. Place orders on Zerodha (and other brokers) with a beautiful, responsive UI.

## 🚀 Features

**MVP (Phase 1) - Currently Implemented:**
- ✅ Firebase Authentication (Email/Password & Google Sign-In)
- ✅ Broker Configuration Management (Zerodha)
- ✅ Place Orders (Market, Limit, Stop Loss orders)
- ✅ Order Status Tracking
- ✅ Real-time Order Book
- ✅ Encrypted credential storage in Firebase Firestore

**Future Features (Phase 2+):**
- Trading strategies
- Position and holdings tracking
- P&L dashboard
- Real-time WebSocket updates
- Additional broker support (Angel, Dhan, Upstox, Fyers, etc.)
- Strategy analyzer

## 📋 Prerequisites

Before you begin, ensure you have:

1. **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
2. **npm** or **yarn**
3. **Firebase Project** - [Create one here](https://console.firebase.google.com/)
4. **Zerodha API Access** - [Apply here](https://kite.zerodha.com/login)

## 🔧 Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Your `.env.local` file has been pre-configured with Firebase credentials. The file contains:
- Firebase client configuration (already filled in)
- Firebase Admin SDK key (already filled in)
- Encryption key for sensitive data

## 🏃 Running the Application

### Development Mode

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Production Build

```bash
npm run build
npm start
```

## 📚 Project Structure

```
openalgonode/
├── app/
│   ├── api/
│   │   ├── broker/
│   │   │   ├── authenticate/route.ts    # Zerodha authentication
│   │   │   └── config/route.ts          # Broker config management
│   │   └── orders/
│   │       ├── place/route.ts           # Place order endpoint
│   │       └── status/route.ts          # Get order status endpoint
│   ├── broker/
│   │   └── config/page.tsx              # Broker configuration UI
│   ├── orders/
│   │   ├── place/page.tsx               # Place order UI
│   │   └── status/page.tsx              # Order status UI
│   ├── login/page.tsx                   # Authentication page
│   ├── page.tsx                         # Dashboard
│   ├── layout.tsx                       # Root layout
│   └── globals.css                      # Global styles
├── lib/
│   ├── firebase.ts                      # Firebase client config
│   ├── firebaseAdmin.ts                 # Firebase Admin SDK config
│   ├── AuthContext.tsx                  # Auth context provider
│   ├── firebaseUtils.ts                 # Firestore utilities
│   └── zerodhaClient.ts                 # Zerodha API client
└── .env.local                           # Environment variables
```

## 🔐 Security Features

✅ **Authentication**
- Firebase Auth handles user management
- Sessions managed by Firebase

✅ **Encryption**
- API keys and secrets encrypted before storing
- Uses AES encryption with CryptoJS

✅ **Authorization**
- Firestore security rules restrict data access
- Server-side verification of Firebase tokens

✅ **API Security**
- All broker API calls happen server-side
- Credentials never exposed to frontend

## 📖 Usage Guide

### 1. Create Account & Sign In

- Visit `http://localhost:3000`
- Click "Sign In"
- Create account with email/password or Google

### 2. Configure Broker (Zerodha)

1. Go to "Broker Configuration"
2. Get API credentials from [Zerodha API Console](https://kite.zerodha.com/login)
3. Save credentials
4. Generate request token and authenticate

### 3. Place Order

1. Go to "Place Order"
2. Enter order details (symbol, quantity, price, etc.)
3. Submit to place order
4. Get order ID on success

### 4. Check Order Status

1. Go to "Order Status"
2. View all open orders
3. Click "Refresh" to update

## 🛠 Development

### Key Technologies

- **Frontend**: React 19, Next.js 15, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Language**: TypeScript

## 🚀 Deployment

### Deploy to Vercel (Recommended)

```bash
vercel
```

### Other Platforms

Can be deployed to any Node.js platform:
- Hercel
- Railway
- Render
- AWS Amplify
- Google Cloud Run
- Azure App Service

## 📝 Environment Variables

### Required

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `FIREBASE_ADMIN_SDK_KEY` (base64 encoded)

### Optional

- `NEXT_PUBLIC_ENCRYPTION_KEY` - For encrypting sensitive data
- `ZERODHA_API_KEY` - For testing
- `ZERODHA_API_SECRET` - For testing

## 🐛 Troubleshooting

### Authentication Failed
- Ensure Firebase is initialized
- Verify API key in `.env.local`
- Check Firebase has Authentication enabled

### Broker Configuration Not Found
- Go to Broker Configuration page
- Save API credentials first
- Then authenticate with request token

### Failed to Place Order
- Ensure broker is authenticated
- Check Zerodha API credentials
- Verify order parameters

## 📄 License

Part of the OpenAlgo ecosystem.

---

**Ready to trade? Create an account and configure your broker!**
