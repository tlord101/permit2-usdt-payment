# Permit2 USDT Payment (Reown AppKit)

Gasless USDT payments using Uniswap Permit2 + Reown AppKit.

1. User connects wallet  
2. User signs an off-chain Permit2 message (no gas)  
3. Backend relayer submits `permitTransferFrom` and pays the ETH gas  

## Repo structure

```
├── index.html              # Frontend page
├── js/wallet-permit2.js    # AppKit + Permit2 signing logic (config at top)
├── api/collect-permit2.js  # Vercel serverless endpoint
├── package.json
├── vercel.json
└── .env.example
```

## Setup

### 1. Reown Project ID

1. Go to [dashboard.reown.com](https://dashboard.reown.com)
2. Create a project and copy the **Project ID**

### 2. Edit frontend config

Open `js/wallet-permit2.js` and update the `WALLET_PERMIT2_CONFIG` object:

```js
projectId: 'YOUR_REOWN_PROJECT_ID',
metadata: {
  name: 'My Payment App',
  description: 'Gasless USDT payments via Permit2',
  url: 'https://your-app.vercel.app',   // your real domain
  icons: ['https://your-app.vercel.app/icon.png']
},
chainId: 1,
usdtAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
spenderAddress: '0xYourRelayerWalletAddress',  // SAME as the wallet of RELAYER_PRIVATE_KEY
amount: '10000000',                            // 10 USDT (6 decimals)
backendEndpoint: '/api/collect-permit2',
deadlineSeconds: 3600
```

**Important:** `spenderAddress` must be the exact address of the wallet whose private key you put in `RELAYER_PRIVATE_KEY`.

### 3. Environment variables (Vercel)

In your Vercel project → **Settings → Environment Variables** add:

| Name                  | Description                                      |
|-----------------------|--------------------------------------------------|
| `RPC_URL`             | Ethereum RPC (Alchemy / Infura / public)         |
| `RELAYER_PRIVATE_KEY` | Private key of the wallet that pays gas          |
| `COLLECTION_ADDRESS`  | Address that receives the USDT                   |

Never commit the real private key.

### 4. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import this repo
2. Framework Preset: **Other**
3. Add the three environment variables above
4. Deploy

After deploy, open the URL and test:

1. Click **Connect Wallet**
2. Click **Sign & Pay**
3. Approve the one-time USDT → Permit2 allowance if needed
4. Sign the Permit2 message
5. Backend submits the on-chain transfer

## Local testing

```bash
npm install
# Create .env.local with RPC_URL, RELAYER_PRIVATE_KEY, COLLECTION_ADDRESS
npx vercel dev
```

## Flow summary

```
User wallet                    Your backend (relayer)
    |                                  |
    | 1. Connect (AppKit)              |
    | 2. Approve Permit2 (one-time)    |
    | 3. Sign Permit2 EIP-712          |
    | 4. POST /api/collect-permit2 ──► |
    |                                  | 5. permitTransferFrom()
    |                                  | 6. USDT moves to COLLECTION_ADDRESS
```

## Security notes

- Private key stays only on the server (Vercel env vars).
- Relayer wallet needs a small amount of ETH for gas.
- For production, consider rate-limiting the API and validating amounts/server-side order IDs.
