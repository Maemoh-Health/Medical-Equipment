import { useEffect, useState } from 'react';
import { ImageUp, Save, ShieldCheck, UserCog } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

type Profile = { id: string; full_name: string; email: string | null; phone: string | null; role: string; location_id: string | null; organization_id: string | null; is_active: boolean };
type Location = { id: string; location_name: string };

const roleLabels: Record<string, string> = {
  district_admin: 'Admin ระดับอำเภอ',
  facility_officer: 'ผู้ใช้งานหน่วยบริการ',
  executive: 'ผู้บริหาร',
};

export function LogoSettings({ isAdmin, logoUrl, onLogoChange, onMessage }: { isAdmin: boolean; logoUrl: string; onLogoChange: (url: string) => void; onMessage: (message: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState('');

  async function saveLogo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !isAdmin) return;
    const form = event.currentTarget;
    const file = (new FormData(form).get('logo') as File | null);
    if (!file || !file.size) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) {
      onMessage('เลือกรูป PNG, JPG หรือ WebP ขนาดไม่เกิน 4 MB');
      return;
    }
    setUploading(true);
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `ministry-logo-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('ministry-branding').upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setUploading(false);
      onMessage('อัปโหลดไม่สำเร็จ กรุณาตรวจสอบสิทธิ์ Admin และการตั้งค่า Storage');
      return;
    }
    const { error: settingsError } = await supabase.from('app_settings').update({ ministry_logo_path: path, updated_by: (await supabase.auth.getUser()).data.user?.id || null }).eq('id', 1);
    if (settingsError) {
      await supabase.storage.from('ministry-branding').remove([path]);
      setUploading(false);
      onMessage('บันทึกตำแหน่งโลโก้ไม่สำเร็จ กรุณาลองอีกครั้ง');
      return;
    }
    const url = supabase.storage.from('ministry-branding').getPublicUrl(path).data.publicUrl;
    onLogoChange(url);
    setPreview('');
    setUploading(false);
    form.reset();
    onMessage('บันทึกโลโก้กระทรวงสาธารณสุขแล้ว');
  }

  async function removeLogo() {
    if (!supabase || !isAdmin || !window.confirm('นำโลโก้กระทรวงออกจากระบบใช่หรือไม่?')) return;
    setUploading(true);
    const { error } = await supabase.from('app_settings').update({ ministry_logo_path: null, updated_by: (await supabase.auth.getUser()).data.user?.id || null }).eq('id', 1);
    if (error) onMessage('นำโลโก้ออกไม่สำเร็จ กรุณาลองอีกครั้ง');
    else { onLogoChange(''); onMessage('นำโลโก้ออกจากระบบแล้ว'); }
    setUploading(false);
  }

  return <section className="panel settings-panel"><div className="panel-head"><div><h3>โลโก้กระทรวงสาธารณสุข</h3><p>โลโก้นี้จะแสดงบนแถบเมนูและหน้าเข้าสู่ระบบ</p></div><ImageUp size={20} className="muted"/></div><div className="branding-preview">{preview || logoUrl ? <img src={preview || logoUrl} alt="ตัวอย่างโลโก้กระทรวงสาธารณสุข"/> : <div className="branding-empty"><ShieldCheck/><span>ยังไม่ได้ตั้งค่าโลโก้</span></div>}</div>{isAdmin ? <form className="branding-form" onSubmit={saveLogo}><label>เลือกไฟล์โลโก้ (PNG, JPG, WebP ไม่เกิน 4 MB)<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required onChange={e=>setPreview(e.target.files?.[0] ? URL.createObjectURL(e.target.files[0]) : '')}/></label><div className="settings-actions"><button className="primary" disabled={uploading}><ImageUp size={15}/>{uploading?'กำลังบันทึก…':'อัปโหลดและบันทึก'}</button>{logoUrl&&<button type="button" className="secondary" onClick={removeLogo} disabled={uploading}>นำโลโก้ออก</button>}</div></form> : <p className="permission-note"><ShieldCheck size={16}/> เฉพาะ Admin ระดับอำเภอเท่านั้นที่เปลี่ยนโลโก้ได้</p>}</section>;
}

export function UserSettings({ isAdmin, user, profile, locations, onProfileSaved, onMessage }: { isAdmin: boolean; user: User; profile: Profile | null; locations: Location[]; onProfileSaved: (profile: Profile) => void; onMessage: (message: string) => void }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');

  useEffect(() => { setFullName(profile?.full_name || ''); setPhone(profile?.phone || ''); }, [profile]);
  useEffect(() => {
    if (!supabase || !isAdmin) return;
    let mounted = true;
    setLoading(true);
    supabase.from('user_profiles').select('id,full_name,email,phone,role,location_id,organization_id,is_active').order('full_name').then(({ data, error }) => {
      if (!mounted) return;
      if (error) onMessage('โหลดรายชื่อผู้ใช้ไม่สำเร็จ กรุณาตรวจสอบสิทธิ์');
      else setUsers((data || []) as Profile[]);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [isAdmin, onMessage]);

  async function saveOwnProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !profile) return;
    setSavingId(user.id);
    const updated = { full_name: fullName.trim(), phone: phone.trim() || null };
    const { data, error } = await supabase.from('user_profiles').update(updated).eq('id', user.id).select('id,full_name,email,phone,role,location_id,organization_id,is_active').single();
    setSavingId('');
    if (error) onMessage('บันทึกข้อมูลส่วนตัวไม่สำเร็จ กรุณาลองอีกครั้ง');
    else { onProfileSaved(data as Profile); onMessage('บันทึกข้อมูลส่วนตัวแล้ว'); }
  }

  async function saveUser(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    if (!supabase || !isAdmin) return;
    const form = new FormData(event.currentTarget);
    setSavingId(id);
    const update = { full_name: String(form.get('full_name')).trim(), phone: String(form.get('phone') || '').trim() || null, role: String(form.get('role') || (id === user.id ? profile?.role : 'facility_officer')), location_id: String(form.get('location_id') || '') || null, is_active: form.get('is_active') === null && id === user.id ? Boolean(profile?.is_active) : form.get('is_active') === 'on' };
    const { error } = await supabase.from('user_profiles').update(update).eq('id', id);
    setSavingId('');
    if (error) onMessage('บันทึกสิทธิ์ผู้ใช้ไม่สำเร็จ กรุณาลองอีกครั้ง');
    else { setUsers(rows => rows.map(row => row.id === id ? { ...row, ...update } : row)); if (id === user.id) onProfileSaved({ ...profile!, ...update }); onMessage('บันทึกการตั้งค่าผู้ใช้แล้ว'); }
  }

  async function inviteUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !isAdmin) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = String(values.get('email') || '').trim().toLowerCase();
    const password = String(values.get('password') || '');
    if (password.length < 8) { onMessage('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return; }
    setInviting(true);
    const { error } = await supabase.functions.invoke('admin-invite-user', { body: { email, password, full_name: String(values.get('full_name') || '').trim(), role: String(values.get('role') || 'facility_officer'), location_id: String(values.get('location_id') || '') || null } });
    setInviting(false);
    if (error) { onMessage('สร้างบัญชีไม่สำเร็จ ตรวจสอบอีเมลที่ไม่ซ้ำ รหัสผ่าน และสิทธิ์ Admin'); return; }
    form.reset();
    onMessage(`สร้างบัญชี ${email} แล้ว แจ้งอีเมลและรหัสผ่านให้ผู้ใช้โดยตรง`);
    const { data } = await supabase.from('user_profiles').select('id,full_name,email,phone,role,location_id,organization_id,is_active').order('full_name');
    if (data) setUsers(data as Profile[]);
  }

  return <div className="settings-stack"><section className="panel settings-panel"><div className="panel-head"><div><h3>ข้อมูลบัญชีของฉัน</h3><p>ผู้ใช้งานทุกระดับแก้ไขชื่อและเบอร์ติดต่อของตนเองได้</p></div><UserCog size={20} className="muted"/></div><form className="profile-settings-form" onSubmit={saveOwnProfile}><div className="form-row"><label>ชื่อที่แสดง<input value={fullName} onChange={e=>setFullName(e.target.value)} required maxLength={120}/></label><label>เบอร์ติดต่อ<input value={phone} onChange={e=>setPhone(e.target.value)} maxLength={30} placeholder="ระบุเบอร์ติดต่อ"/></label></div><div className="form-row"><label>อีเมลเข้าสู่ระบบ<input value={user.email || ''} readOnly disabled/></label><label>บทบาท<input value={roleLabels[profile?.role || ''] || profile?.role || ''} readOnly disabled/></label></div><button className="primary" disabled={savingId===user.id}><Save size={15}/>{savingId===user.id?'กำลังบันทึก…':'บันทึกข้อมูลส่วนตัว'}</button></form></section>
    {isAdmin&&<section className="panel table-panel user-management"><div className="panel-head"><div><h3>จัดการผู้ใช้งาน</h3><p>กำหนดบทบาท สถานที่ประจำ และสถานะบัญชี</p></div><span className="panel-tag">Admin</span></div><form className="invite-user-form" onSubmit={e=>void inviteUser(e)}><b>สร้างบัญชีผู้ใช้</b><span>กำหนดอีเมลและรหัสผ่านสำหรับเข้าสู่ระบบ ผู้ใช้เข้าสู่ระบบได้ทันที</span><div className="user-row-fields"><label>ชื่อผู้ใช้<input name="full_name" required minLength={2} maxLength={120} placeholder="ชื่อและนามสกุล"/></label><label>อีเมล<input name="email" type="email" required autoComplete="email" placeholder="name@example.go.th"/></label><label>รหัสผ่านเริ่มต้น<input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" placeholder="อย่างน้อย 8 ตัวอักษร"/></label><label>ระดับผู้ใช้<select name="role" defaultValue="facility_officer">{Object.entries(roleLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>สถานที่ประจำ<select name="location_id" defaultValue=""><option value="">ยังไม่กำหนด</option>{locations.map(location=><option key={location.id} value={location.id}>{location.location_name}</option>)}</select></label></div><small>แจ้งอีเมลและรหัสผ่านให้ผู้ใช้ผ่านช่องทางที่ปลอดภัย</small><div className="user-row-actions"><button className="primary" disabled={inviting}><UserCog size={14}/>{inviting?'กำลังสร้างบัญชี…':'สร้างบัญชีผู้ใช้'}</button></div></form><div className="user-settings-list">{loading?<div className="table-empty">กำลังโหลดรายชื่อผู้ใช้…</div>:users.length?users.map(row=><form className="user-setting-row" key={row.id} onSubmit={e=>void saveUser(e,row.id)}><div className="user-row-title"><div><b>{row.full_name}</b><span>{row.email || 'ไม่มีอีเมล'}{row.id===user.id?' · บัญชีของคุณ':''}</span></div><label className="active-toggle"><input name="is_active" type="checkbox" defaultChecked={row.is_active} disabled={row.id===user.id}/> เปิดใช้งาน</label></div><div className="user-row-fields"><label>ชื่อ<input name="full_name" defaultValue={row.full_name} required maxLength={120}/></label><label>เบอร์ติดต่อ<input name="phone" defaultValue={row.phone || ''} maxLength={30}/></label><label>ระดับผู้ใช้<select name="role" defaultValue={row.role} disabled={row.id===user.id}>{Object.entries(roleLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>สถานที่ประจำ<select name="location_id" defaultValue={row.location_id || ''}><option value="">ยังไม่กำหนด</option>{locations.map(location=><option key={location.id} value={location.id}>{location.location_name}</option>)}</select></label></div><div className="user-row-actions"><button className="primary" disabled={savingId===row.id}><Save size={14}/>{savingId===row.id?'กำลังบันทึก…':'บันทึกผู้ใช้'}</button></div></form>):<div className="table-empty">ไม่พบผู้ใช้งาน</div>}</div></section>}
  </div>;
}


