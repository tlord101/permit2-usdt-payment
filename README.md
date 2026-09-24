# Permit2 USDT Payment + Admin Dashboard

Gasless USDT payments (Reown AppKit + Uniswap Permit2) with a **black / off-black / white / off-white** admin dashboard backed by **Supabase**.

AppKit is installed via **npm** and bundled with **Vite** (no CDN ESM links).

## Features

- Public payment page (connect → sign Permit2 → backend collects)
- Admin login (password)
- **Dashboard** — live admin ETH/USDT + collection USDT balances
- **Wallets** — connected wallets as cards with live USDT & ETH balances
- **Payments** — history + **Retry** for failed collections (e.g. low gas)
- **Settings** — all config including RPC, private key, collection address, amount, Reown project ID

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. SQL Editor → run the full script in `supabase/schema.sql`
3. Copy **Project URL** and **service_role** key (Settings → API)

### 2. Vercel env vars

| Name | Value |
|------|--------|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |

### 3. Deploy

Import this repo on Vercel (Framework: **Other**).

On deploy Vercel runs:

```bash
npm install
npm run build   # Vite bundles src/wallet-permit2.js → js/wallet-permit2.js
```

Packages used:

```bash
npm install @reown/appkit @reown/appkit-adapter-ethers ethers
```

### 4. First login & configure

1. Open `https://your-app.vercel.app/admin/login.html`
2. Password default: **`change-me`** (from schema)
3. Go to **Settings** and fill in:
   - Reown **Project ID** ([dashboard.reown.com](https://dashboard.reown.com))
   - Metadata URL = your Vercel domain
   - **Spender address** = address of the wallet that owns the private key
   - **Relayer private key**
   - **RPC URL**
   - **Collection address** (where USDT lands)
   - Amount, chain ID, etc.
   - Change **admin password**
4. Save

**Critical:** `spender_address` must be the same address derived from `relayer_private_key`.

### 5. Fund the relayer

Send a little **ETH** to the relayer wallet for gas.

## Local development

```bash
npm install
npm run build
npx vercel dev
```

Edit `src/wallet-permit2.js`, then `npm run build` again (or use `npx vite build --watch`).

## Pages

| URL | Purpose |
|-----|--------|
| `/` | Public payment |
| `/admin/login.html` | Admin login |
| `/admin/` | Dashboard + balances |
| `/admin/wallets.html` | Connected wallets |
| `/admin/payments.html` | Payments + retry |
| `/admin/settings.html` | All configuration |

## Design

Strict palette only: `#000`, `#121212`, `#1a1a1a`, `#2a2a2a`, `#fff`, `#f0f0f0`, muted greys. No accent colors.

## Security notes

- Private key is stored in Supabase `app_settings` and only returned to authenticated admin.
- Prefer restricting admin to a private domain / VPN in production.
- Service role key must never be exposed to the browser (API only).
- Relayer needs ETH for gas; use **Retry** on Payments if a run failed due to insufficient funds.
