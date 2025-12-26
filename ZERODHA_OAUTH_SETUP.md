# Zerodha OAuth Configuration Guide

## Problem
Zerodha requires explicit whitelisting of redirect URIs in their OAuth settings. Every time your ngrok URL changes, you must update Zerodha's configuration.

---

## Steps to Configure in Zerodha

### 1. Get Your ngrok URL
```bash
# When you start ngrok, it shows your URL:
ngrok http 3001

# Output will show:
# Forwarding     https://a9ce9b0b639c.ngrok-free.app -> http://localhost:3001
```

Your callback URL is:
```
https://a9ce9b0b639c.ngrok-free.app/callback
```

### 2. Log in to Zerodha API Console
- Visit: https://kite.trade/
- Log in to your Zerodha account
- Go to: **Settings → API Tokens** or **Developer Console**
- Look for your API application

### 3. Update Redirect URI (OAuth Callback URL)
In Zerodha's API settings, find the **Redirect URL** field and update it:

**Before (old ngrok URL):**
```
https://a1b2c3d4e5f6.ngrok-free.app/callback
```

**After (new ngrok URL):**
```
https://a9ce9b0b639c.ngrok-free.app/callback
```

### 4. Save and Test
- Click **Save** or **Update**
- Go back to your app and try authentication
- It should now work!

---

## Why This is Needed

Zerodha (and most OAuth providers) require **whitelisting redirect URIs** for security reasons:

1. **Security**: Prevents attackers from redirecting users to malicious sites
2. **Validation**: Zerodha checks that the redirect URL matches what's configured
3. **Production Only**: In your OAuth API console settings

---

## Steps When ngrok URL Changes

Every time you restart ngrok and get a new URL:

1. **Stop your server**: `CTRL+C`
2. **Note the new ngrok URL**: From ngrok output
3. **Update Zerodha**: Go to API console → Update Redirect URL
4. **Restart your app**: `PORT=3001 npm run dev`
5. **Test authentication**: Should work with new URL

---

## How to Get Permanent ngrok URL (Paid)

If you want a **permanent ngrok domain** so you don't have to change Zerodha settings every time:

### Option 1: ngrok Pro (Paid)
```bash
# ngrok Pro gives you a reserved domain
# Subscribe at: https://ngrok.com/pricing
# Then claim a domain: https://dashboard.ngrok.com

ngrok http --domain=your-reserved-domain.ngrok.io 3001
```

This gives a permanent URL like:
```
https://your-reserved-domain.ngrok.io/callback
```

### Option 2: Use Your Own Domain
Deploy to a real server with your own domain:
```
https://yourdomain.com/callback
```

---

## Troubleshooting

### "Invalid callback URL" Error
**Problem**: You authenticated but got error: "Invalid callback URL"

**Solution**:
- Check Zerodha API console - is your redirect URL correct?
- Make sure it matches exactly: `https://your-ngrok-url.ngrok-free.app/callback`
- No trailing slash, exact match required

### "Redirect URI mismatch"
**Problem**: Zerodha returns error about redirect URI mismatch

**Solution**:
- You likely changed ngrok URL but didn't update Zerodha
- Update the URL in Zerodha's API console
- Must match exactly what's in Zerodha settings

### The redirect happens but callback fails
**Problem**: You're redirected back but see error page

**Solution**:
- Check your server logs for errors
- Make sure your app server is running: `PORT=3001 npm run dev`
- Check network tab in browser - what URL is it actually calling?

---

## Summary

| When | What to Do |
|------|-----------|
| **Getting new ngrok URL** | Update Zerodha's Redirect URL field |
| **Testing locally (localhost)** | Use `http://localhost:3001/callback` in Zerodha settings |
| **Going to production** | Update Zerodha's Redirect URL to your production domain |
| **OAuth flow failing** | Check Zerodha console - verify redirect URL is whitelisted |

---

## Current Setup

```
Your App                    Zerodha Server
    ↓                            ↓
http://localhost:3001/     https://kite.trade/
    ↓                            ↑
    ├──→ "Authenticate" ────────→ ├──→ OAuth Login Page
    │                             │
    └←───── Redirect Back ←────────┘
         (with request_token)

Redirect URL = https://a9ce9b0b639c.ngrok-free.app/callback
(Must be registered in Zerodha's API console)
```

---

## Zerodha API Console Location

1. Log in to Zerodha
2. Go to: https://kite.trade/
3. Click on your profile → **Settings**
4. Look for: **API Tokens** or **Developer Console**
5. Find your app → **Edit** or **Configure**
6. Update: **Redirect URL / Callback URL**
7. Save changes

---

## Quick Checklist

- [ ] Zerodha API application created
- [ ] Have API Key and API Secret
- [ ] Redirect URL set in Zerodha to: `https://your-ngrok-url.ngrok-free.app/callback`
- [ ] Saved changes in Zerodha
- [ ] App running on port 3001: `PORT=3001 npm run dev`
- [ ] API credentials saved in app: `/broker/config`
- [ ] Testing: Click "Authenticate with Zerodha"
- [ ] Should redirect to Zerodha login
- [ ] After login, should redirect back with success message
- [ ] Can now place orders

---

## Notes

- Every ngrok restart gives a **new random URL** (free tier)
- You must update Zerodha's settings each time
- If using ngrok Pro, you get a permanent domain (no updates needed)
- Local development: Use `http://localhost:3001/callback`
- Production: Use your actual domain
