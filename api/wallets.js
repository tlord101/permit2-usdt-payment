import { ethers } from 'ethers';
import { getSupabase, getSettings, cors, requireAdmin } from '../lib/supabase.js';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const supabase = getSupabase();

    // POST – log a connected wallet (public, called from frontend)
    if (req.method === 'POST') {
      const { address } = req.body || {};
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid address' });
      }
      const normalized = address.toLowerCase();

      const { data: existing } = await supabase
        .from('connected_wallets')
        .select('id, connect_count')
        .eq('address', normalized)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('connected_wallets')
          .update({
            last_seen_at: new Date().toISOString(),
            connect_count: (existing.connect_count || 1) + 1
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('connected_wallets').insert({
          address: normalized,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          connect_count: 1
        });
      }

      return res.status(200).json({ ok: true });
    }

    // GET – admin list with live balances
    if (req.method === 'GET') {
      const settings = await getSettings(supabase);
      requireAdmin(req, settings);

      const { data: wallets, error } = await supabase
        .from('connected_wallets')
        .select('*')
        .order('last_seen_at', { ascending: false });

      if (error) throw error;

      let balances = {};
      if (settings.rpc_url && settings.usdt_address && wallets?.length) {
        try {
          const provider = new ethers.JsonRpcProvider(settings.rpc_url);
          const usdt = new ethers.Contract(settings.usdt_address, ERC20_ABI, provider);
          const decimals = await usdt.decimals().catch(() => 6);

          await Promise.all(
            wallets.map(async (w) => {
              try {
                const bal = await usdt.balanceOf(w.address);
                balances[w.address] = {
                  raw: bal.toString(),
                  formatted: ethers.formatUnits(bal, decimals),
                  eth: ethers.formatEther(await provider.getBalance(w.address))
                };
              } catch {
                balances[w.address] = { raw: '0', formatted: '0', eth: '0' };
              }
            })
          );
        } catch (e) {
          console.error('Balance fetch error', e);
        }
      }

      const result = (wallets || []).map((w) => ({
        ...w,
        usdtBalance: balances[w.address]?.formatted ?? null,
        ethBalance: balances[w.address]?.eth ?? null
      }));

      return res.status(200).json({ wallets: result });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
}
