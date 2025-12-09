// lib/supabase-backup.js
import { createClient } from '@supabase/supabase-js';

class SupabaseBackup {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return this.client;
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }
    
    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    this.initialized = true;
    return this.client;
  }

  async storeData(payload) {
    const client = await this.initialize();
    
    const { data, error } = await client
      .from('chartink_webhooks')
      .insert([{
        payload,
        received_at: new Date().toISOString(),
        source_ip: payload._metadata?.ip
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

export const supabaseBackup = new SupabaseBackup();