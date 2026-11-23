import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const response = await fetch('/api/config');
if (!response.ok) throw new Error('无法读取 Supabase 配置，请检查部署环境变量');
const config = await response.json();
if (!config.url || !config.publishableKey) {
  throw new Error('Supabase 配置缺失：请设置 SUPABASE_URL 和 SUPABASE_PUBLISHABLE_KEY');
}

export const supabase = createClient(config.url, config.publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
