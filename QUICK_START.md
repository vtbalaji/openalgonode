# OpenAlgoNode - Quick Start Guide

## 🎯 What's Been Built

A complete **MVP trading platform** with:
- ✅ User authentication (Firebase)
- ✅ Broker configuration management
- ✅ Place orders on Zerodha
- ✅ Order status tracking
- ✅ Responsive web UI

## 📦 Project Location

```
/Users/balajithanigaiarasu/openalgonode/
```

## 🚀 Get Started (5 minutes)

### 1. Install Dependencies
```bash
cd /Users/balajithanigaiarasu/openalgonode
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

Visit: **http://localhost:3000**

### 3. Create Account
- Click "Sign In"
- Create account with email or Google
- You're logged in!

### 4. Configure Broker
1. Go to "Broker Configuration"
2. Get credentials from [Zerodha API Console](https://kite.zerodha.com/login)
3. Save credentials
4. Authenticate with request token

### 5. Place Orders
1. Go to "Place Order"
2. Enter symbol, quantity, price
3. Submit and get order ID!

### 6. Check Status
1. Go to "Order Status"
2. See all your orders
3. Click "Refresh" for updates

## 📁 Key Files

| File | Purpose |
|------|---------|
| `app/page.tsx` | Dashboard |
| `app/login/page.tsx` | Authentication |
| `app/broker/config/page.tsx` | Broker setup |
| `app/orders/place/page.tsx` | Place orders |
| `app/orders/status/page.tsx` | Order tracking |
| `lib/firebase.ts` | Firebase config |
| `lib/zerodhaClient.ts` | Zerodha API |
| `.env.local` | Environment vars (already configured) |

## 🔧 API Routes

```
POST   /api/broker/config          → Save broker credentials
POST   /api/broker/authenticate    → Get access token
POST   /api/orders/place           → Place order
GET    /api/orders/status          → Get order book
```

## 🎨 Tech Stack

- **Frontend**: React 19 + Next.js 15 + Tailwind CSS
- **Backend**: Next.js API Routes (Node.js)
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Language**: TypeScript

## 📝 Environment

Everything is pre-configured in `.env.local`:
- ✅ Firebase project: `algotrade-13e61`
- ✅ Firebase Admin SDK key: configured
- ✅ Encryption key: set

## ⚙️ Configure Firebase

If you want to use your own Firebase project:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create new project
3. Enable Firestore Database
4. Enable Authentication (Email + Google)
5. Create service account key
6. Update `.env.local` with your credentials

## 🔐 Security

- API keys encrypted before storage
- All broker API calls server-side
- Firebase security rules for data access
- Session tokens verified on API routes

## 📤 Deploy

### To Vercel (Easiest)
```bash
vercel
```

### To Other Platforms
- Railway
- Render
- Heroku
- AWS Amplify
- Google Cloud Run

## 🐛 Troubleshooting

**App won't start?**
```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

**Firebase error?**
- Check `.env.local` has all keys
- Verify Firebase project exists
- Enable Firestore & Authentication

**Can't authenticate with Zerodha?**
- Check API key & secret are correct
- Generate new request token
- Ensure Zerodha app is created

## 📞 Next Steps

1. **Deploy**: `vercel` or push to Vercel
2. **Add Features**: Create more pages as needed
3. **Add Brokers**: Follow Zerodha pattern
4. **Real-time Updates**: Add WebSocket support
5. **Mobile**: Deploy as PWA

## 📖 Documentation

- `README.md` - Full documentation
- `claude.md` - Implementation plan & decisions
- This file - Quick start

## 🎉 Done!

You now have a working trading platform!

**Next: Create account, configure Zerodha, place orders!**

---

Built with ❤️ using Next.js, React, Firebase & TypeScript
