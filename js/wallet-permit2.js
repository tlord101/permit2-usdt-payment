/**
 * wallet-permit2.js
 * Standalone: Reown AppKit + Permit2 SignatureTransfer (USDT)
 * Buttons: #connect-wallet-btn  |  #sign-and-pay-btn
 */

// ============================================================
// CONFIG – edit these values before deploying
// ============================================================
const WALLET_PERMIT2_CONFIG = {
  // Reown Dashboard → https://dashboard.reown.com
  projectId: 'YOUR_REOWN_PROJECT_ID',

  metadata: {
    name: 'My Payment App',
    description: 'Gasless USDT payments via Permit2',
    url: 'https://your-vercel-app.vercel.app', // must match your deployed domain
    icons: ['https://your-vercel-app.vercel.app/icon.png']
  },

  // 1 = Ethereum mainnet
  chainId: 1,

  // USDT on Ethereum
  usdtAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',

  // MUST be the same address as the wallet whose private key is RELAYER_PRIVATE_KEY
  spenderAddress: '0xYourRelayerWalletAddress',

  // Amount in USDT smallest unit (6 decimals). 10 USDT = 10000000
  amount: '10000000',

  // Relative path works on Vercel; or use full URL
  backendEndpoint: '/api/collect-permit2',

  deadlineSeconds: 3600
};
// ============================================================

import { createAppKit } from 'https://cdn.jsdelivr.net/npm/@reown/appkit@1.7.8/+esm';
import { EthersAdapter } from 'https://cdn.jsdelivr.net/npm/@reown/appkit-adapter-ethers@1.7.8/+esm';
import { mainnet, arbitrum, base, polygon, sepolia } from 'https://cdn.jsdelivr.net/npm/@reown/appkit/networks@1.7.8/+esm';
import { BrowserProvider, Contract, MaxUint256, getAddress } from 'https://cdn.jsdelivr.net/npm/ethers@6.13.4/+esm';

const cfg = WALLET_PERMIT2_CONFIG;
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

const NETWORK_MAP = {
  1: mainnet,
  42161: arbitrum,
  8453: base,
  137: polygon,
  11155111: sepolia
};

const selectedNetwork = NETWORK_MAP[cfg.chainId] || mainnet;

let modal = null;
let isConnected = false;
let userAddress = null;

function setStatus(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function enablePayButton(enabled) {
  const btn = document.getElementById('sign-and-pay-btn');
  if (btn) btn.disabled = !enabled;
}

async function getEthersProvider() {
  const walletProvider = modal.getWalletProvider();
  if (!walletProvider) throw new Error('No wallet provider');
  return new BrowserProvider(walletProvider);
}

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

function initAppKit() {
  if (modal) return modal;

  const ethersAdapter = new EthersAdapter();

  modal = createAppKit({
    adapters: [ethersAdapter],
    networks: [selectedNetwork],
    projectId: cfg.projectId,
    metadata: cfg.metadata,
    features: {
      analytics: false,
      email: false,
      socials: false
    }
  });

  modal.subscribeAccount((account) => {
    isConnected = !!account?.isConnected;
    userAddress = account?.address || null;

    if (isConnected && userAddress) {
      setStatus('wallet-status', `${userAddress.slice(0, 6)}…${userAddress.slice(-4)}`);
      enablePayButton(true);
    } else {
      setStatus('wallet-status', 'Not connected');
      enablePayButton(false);
    }
  });

  return modal;
}

async function connectWallet() {
  try {
    initAppKit();
    await modal.open();
  } catch (err) {
    console.error(err);
    setStatus('tx-status', 'Connect failed: ' + err.message);
  }
}

async function ensurePermit2Allowance() {
  const ethersProvider = await getEthersProvider();
  const signer = await ethersProvider.getSigner();
  const address = await signer.getAddress();

  const usdt = new Contract(cfg.usdtAddress, ERC20_ABI, signer);
  const current = await usdt.allowance(address, PERMIT2_ADDRESS);

  if (current > 0n) return;

  setStatus('tx-status', 'Approving Permit2 (one-time)...');
  const tx = await usdt.approve(PERMIT2_ADDRESS, MaxUint256);
  await tx.wait();
  setStatus('tx-status', 'Permit2 approved');
}

async function signPermit2() {
  if (!isConnected) throw new Error('Wallet not connected');

  await ensurePermit2Allowance();

  const ethersProvider = await getEthersProvider();
  const signer = await ethersProvider.getSigner();
  const owner = await signer.getAddress();

  const amount = BigInt(cfg.amount);
  const nonce = BigInt(Math.floor(Math.random() * 1e15));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + (cfg.deadlineSeconds || 3600));

  const domain = {
    name: 'Permit2',
    chainId: cfg.chainId,
    verifyingContract: PERMIT2_ADDRESS
  };

  const types = {
    PermitTransferFrom: [
      { name: 'permitted', type: 'TokenPermissions' },
      { name: 'spender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ],
    TokenPermissions: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ]
  };

  const message = {
    permitted: {
      token: getAddress(cfg.usdtAddress),
      amount
    },
    spender: getAddress(cfg.spenderAddress),
    nonce,
    deadline
  };

  setStatus('tx-status', 'Please sign the payment in your wallet...');

  const signature = await signer.signTypedData(domain, types, message);

  return {
    permit: {
      permitted: {
        token: message.permitted.token,
        amount: amount.toString()
      },
      spender: message.spender,
      nonce: nonce.toString(),
      deadline: deadline.toString()
    },
    signature,
    owner,
    chainId: cfg.chainId,
    amount: amount.toString()
  };
}

async function sendToBackend(payload) {
  setStatus('tx-status', 'Submitting to backend...');

  const res = await fetch(cfg.backendEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Backend error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  setStatus('tx-status', data.txHash
    ? `Success! Tx: ${data.txHash}`
    : 'Payment submitted successfully');
  return data;
}

async function signAndPay() {
  try {
    enablePayButton(false);
    const signed = await signPermit2();
    await sendToBackend(signed);
  } catch (err) {
    console.error(err);
    setStatus('tx-status', 'Error: ' + (err.shortMessage || err.message));
  } finally {
    enablePayButton(true);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const connectBtn = document.getElementById('connect-wallet-btn');
  const payBtn = document.getElementById('sign-and-pay-btn');

  if (connectBtn) connectBtn.addEventListener('click', connectWallet);
  if (payBtn) payBtn.addEventListener('click', signAndPay);
});
