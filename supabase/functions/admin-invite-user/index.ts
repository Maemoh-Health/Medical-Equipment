import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed' });

  const authorization = request.headers.get('Authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return respond(401, { error: 'ต้องเข้าสู่ระบบก่อนเชิญผู้ใช้' });

  const projectUrl = Deno.env.get('SUPABASE_URL');
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!projectUrl || !publicKey || !serviceKey) return respond(500, { error: 'ระบบเชิญผู้ใช้ยังตั้งค่าไม่ครบ' });

  const callerClient = createClient(projectUrl, publicKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: callerResult, error: authError } = await callerClient.auth.getUser(token);
  if (authError || !callerResult.user) return respond(401, { error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  const { data: callerProfile, error: profileError } = await callerClient.from('user_profiles').select('role,is_active').eq('id', callerResult.user.id).single();
  if (profileError || callerProfile?.role !== 'district_admin' || !callerProfile.is_active) return respond(403, { error: 'เฉพาะ Admin ระดับอำเภอที่เชิญผู้ใช้ได้' });

  let input: { email?: string; password?: string; full_name?: string; role?: string; location_id?: string | null };
  try { input = await request.json(); } catch { return respond(400, { error: 'รูปแบบข้อมูลไม่ถูกต้อง' }); }
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');
  const fullName = String(input.full_name || '').trim();
  const role = String(input.role || 'facility_officer');
  const locationId = input.location_id ? String(input.location_id) : null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || fullName.length < 2 || fullName.length > 120 || password.length < 8 || password.length > 128) return respond(400, { error: 'กรุณาตรวจสอบอีเมล ชื่อผู้ใช้ และรหัสผ่านอย่างน้อย 8 ตัวอักษร' });
  if (!['district_admin', 'facility_officer', 'executive'].includes(role)) return respond(400, { error: 'ระดับผู้ใช้ไม่ถูกต้อง' });

  const adminClient = createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error: createError } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (createError || !data.user) return respond(400, { error: createError?.message || 'สร้างบัญชีไม่สำเร็จ' });

  const { error: updateError } = await adminClient.from('user_profiles').update({ full_name: fullName, role, location_id: locationId, is_active: true }).eq('id', data.user.id);
  if (updateError) {
    await adminClient.from('user_profiles').delete().eq('id', data.user.id);
    await adminClient.auth.admin.deleteUser(data.user.id);
    return respond(500, { error: 'สร้างบัญชีไม่สำเร็จ กรุณาตรวจสอบสถานที่ประจำและลองใหม่' });
  }
  return respond(200, { created: true });
});


