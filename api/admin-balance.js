import { ethers } from 'ethers';
import { getSupabase, getSettings, cors, requireAdmin } from '../lib/supabase.js';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = getSupabase();
    const settings = await getSettings(supabase);
    requireAdmin(req, settings);

    if (!settings.rpc_url || !settings.relayer_private_key) {
      return res.status(200).json({
        address: settings.spender_address || null,
        eth: null,
        usdt: null,
        message: 'Configure RPC URL and relayer private key in Settings'
      });
    }

    const provider = new ethers.JsonRpcProvider(settings.rpc_url);
    const wallet = new ethers.Wallet(settings.relayer_private_key, provider);
    const address = wallet.address;

    const ethBal = await provider.getBalance(address);
    let usdtFormatted = null;

    if (settings.usdt_address) {
      try {
        const usdt = new ethers.Contract(settings.usdt_address, ERC20_ABI, provider);
        const decimals = await usdt.decimals().catch(() => 6);
        const bal = await usdt.balanceOf(address);
        usdtFormatted = ethers.formatUnits(bal, decimals);
      } catch {
        usdtFormatted = null;
      }
    }

    // Also collection address USDT if different
    let collectionUsdt = null;
    if (settings.collection_address && settings.usdt_address) {
      try {
        const usdt = new ethers.Contract(settings.usdt_address, ERC20_ABI, provider);
        const decimals = await usdt.decimals().catch(() => 6);
        const bal = await usdt.balanceOf(settings.collection_address);
        collectionUsdt = ethers.formatUnits(bal, decimals);
      } catch {
        collectionUsdt = null;
      }
    }

    return res.status(200).json({
      address,
      eth: ethers.formatEther(ethBal),
      usdt: usdtFormatted,
      collectionAddress: settings.collection_address || null,
      collectionUsdt
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
}
