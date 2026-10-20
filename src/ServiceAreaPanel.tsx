import { useEffect, useState } from 'react';
import { MapPinned, Plus, Save, UserRound, Users } from 'lucide-react';
import { supabase } from './lib/supabase';

type Location = { id: string; location_name: string };
type Volunteer = { id: string; full_name: string; phone: string; village: string | null; is_active: boolean };

export function ServiceAreaPanel({ locations, defaultLocationId, userId, onMessage }: {
  locations: Location[];
  defaultLocationId: string;
  userId: string;
  onMessage: (message: string) => void;
}) {
  const [locationId, setLocationId] = useState(defaultLocationId || locations[0]?.id || '');
  const [coverageArea, setCoverageArea] = useState('');
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!locations.some(location => location.id === locationId)) {
      setLocationId(defaultLocationId && locations.some(location => location.id === defaultLocationId) ? defaultLocationId : locations[0]?.id || '');
    }
  }, [defaultLocationId, locationId, locations]);

  useEffect(() => {
    if (!supabase || !locationId) return;
    let current = true;
    setLoading(true);
    Promise.all([
      supabase.from('service_area_profiles').select('coverage_area').eq('location_id', locationId).maybeSingle(),
      supabase.from('village_health_volunteers').select('id,full_name,phone,village,is_active').eq('location_id', locationId).order('full_name')
    ]).then(([areaResult, volunteerResult]) => {
      if (!current) return;
      if (areaResult.error || volunteerResult.error) onMessage('โหลดข้อมูลเขตรับผิดชอบหรือรายชื่อ อสม. ไม่สำเร็จ');
      setCoverageArea(areaResult.data?.coverage_area || '');
      setVolunteers((volunteerResult.data || []) as Volunteer[]);
      setLoading(false);
    });
    return () => { current = false; };
  }, [locationId, onMessage]);

  async function saveArea(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !locationId) return;
    setSaving(true);
    const { error } = await supabase.from('service_area_profiles').upsert({ location_id: locationId, coverage_area: coverageArea.trim(), updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'location_id' });
    setSaving(false);
    onMessage(error ? 'บันทึกเขตรับผิดชอบไม่สำเร็จ กรุณาตรวจสอบสิทธิ์' : 'บันทึกเขตรับผิดชอบของหน่วยบริการแล้ว');
  }

  async function addVolunteer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !locationId) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const { data, error } = await supabase.from('village_health_volunteers').insert({
      location_id: locationId,
      full_name: String(values.get('full_name') || '').trim(),
      phone: String(values.get('phone') || '').trim(),
      village: String(values.get('village') || '').trim() || null,
      created_by: userId
    }).select('id,full_name,phone,village,is_active').single();
    if (error) { onMessage('เพิ่มรายชื่อ อสม. ไม่สำเร็จ กรุณาตรวจสอบข้อมูลและสิทธิ์'); return; }
    setVolunteers(rows => [...rows, data as Volunteer].sort((a, b) => a.full_name.localeCompare(b.full_name, 'th')));
    form.reset();
    onMessage('เพิ่มรายชื่อ อสม. แล้ว');
  }

  async function saveVolunteer(event: React.FormEvent<HTMLFormElement>, volunteer: Volunteer) {
    event.preventDefault();
    if (!supabase) return;
    const values = new FormData(event.currentTarget);
    const update = { full_name: String(values.get('full_name') || '').trim(), phone: String(values.get('phone') || '').trim(), village: String(values.get('village') || '').trim() || null, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('village_health_volunteers').update(update).eq('id', volunteer.id);
    if (error) { onMessage('บันทึกข้อมูล อสม. ไม่สำเร็จ'); return; }
    setVolunteers(rows => rows.map(row => row.id === volunteer.id ? { ...row, ...update } : row));
    onMessage('บันทึกข้อมูล อสม. แล้ว');
  }

  async function toggleVolunteer(volunteer: Volunteer) {
    if (!supabase) return;
    const nextActive = !volunteer.is_active;
    const { error } = await supabase.from('village_health_volunteers').update({ is_active: nextActive, updated_at: new Date().toISOString() }).eq('id', volunteer.id);
    if (error) { onMessage('เปลี่ยนสถานะรายชื่อ อสม. ไม่สำเร็จ'); return; }
    setVolunteers(rows => rows.map(row => row.id === volunteer.id ? { ...row, is_active: nextActive } : row));
    onMessage(nextActive ? 'เปิดใช้งานรายชื่อ อสม. แล้ว' : 'ปิดใช้งานรายชื่อ อสม. แล้ว');
  }

  return <section className="panel settings-panel service-area-panel">
    <div className="panel-head"><div><h3>เขตรับผิดชอบและรายชื่อ อสม.</h3><p>จัดเก็บพื้นที่ให้บริการและเบอร์ติดต่อ อสม. แยกตามหน่วยบริการ</p></div><Users size={20} className="muted"/></div>
    {!locations.length ? <div className="empty-state"><MapPinned/><b>บัญชีนี้ยังไม่มีสิทธิ์เข้าถึงสถานที่</b></div> : <>
      <label className="service-location-select">หน่วยบริการ<select value={locationId} onChange={event => setLocationId(event.target.value)}>{locations.map(location => <option key={location.id} value={location.id}>{location.location_name}</option>)}</select></label>
      <form className="service-area-form" onSubmit={saveArea}>
        <label>เขตพื้นที่รับผิดชอบ<textarea rows={3} value={coverageArea} onChange={event => setCoverageArea(event.target.value)} maxLength={4000} placeholder="ระบุหมู่บ้าน ตำบล หรือขอบเขตพื้นที่ให้บริการ"/></label>
        <button className="primary" disabled={saving || loading}><Save size={15}/>{saving ? 'กำลังบันทึก…' : 'บันทึกเขตรับผิดชอบ'}</button>
      </form>
      <form className="volunteer-add-form" onSubmit={addVolunteer}>
        <b><UserRound size={16}/> เพิ่มรายชื่อ อสม.</b>
        <div className="volunteer-fields"><label>ชื่อ–นามสกุล อสม. *<input name="full_name" required maxLength={120} placeholder="ชื่อและนามสกุล"/></label><label>เบอร์โทรศัพท์ *<input name="phone" type="tel" required maxLength={30} placeholder="เช่น 08x-xxx-xxxx"/></label><label>หมู่บ้าน / พื้นที่ดูแล<input name="village" maxLength={160} placeholder="ระบุหมู่บ้านหรือชุมชน"/></label></div>
        <button className="secondary"><Plus size={15}/> เพิ่มรายชื่อ</button>
      </form>
      <div className="volunteer-list"><div className="volunteer-list-heading"><b>รายชื่อ อสม. ({volunteers.filter(row => row.is_active).length} คนที่เปิดใช้งาน)</b>{loading&&<span>กำลังโหลด…</span>}</div>
        {!loading && !volunteers.length && <div className="table-empty">ยังไม่มีรายชื่อ อสม. ในหน่วยบริการนี้</div>}
        {volunteers.map(volunteer => <form className={`volunteer-row${volunteer.is_active ? '' : ' is-inactive'}`} key={volunteer.id} onSubmit={event => void saveVolunteer(event, volunteer)}>
          <label>ชื่อ–นามสกุล<input name="full_name" defaultValue={volunteer.full_name} required maxLength={120}/></label><label>เบอร์โทรศัพท์<input name="phone" type="tel" defaultValue={volunteer.phone} required maxLength={30}/></label><label>หมู่บ้าน / พื้นที่ดูแล<input name="village" defaultValue={volunteer.village || ''} maxLength={160}/></label>
          <div className="volunteer-row-actions"><button className="text-button" disabled={loading}><Save size={14}/> บันทึก</button><button type="button" className="text-button" onClick={() => void toggleVolunteer(volunteer)}>{volunteer.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button></div>
        </form>)}
      </div>
    </>}
  </section>;
}

export function ServiceAreaInfo({ locationId, volunteerId, onVolunteerChange }: { locationId: string; volunteerId: string; onVolunteerChange: (id: string) => void }) {
  const [area, setArea] = useState('');
  const [volunteers, setVolunteers] = useState<Pick<Volunteer, 'id' | 'full_name' | 'phone' | 'village'>[]>([]);
  useEffect(() => {
    if (!supabase || !locationId) { setArea(''); setVolunteers([]); return; }
    let current = true;
    setArea('');
    setVolunteers([]);
    Promise.all([
      supabase.from('service_area_profiles').select('coverage_area').eq('location_id', locationId).maybeSingle(),
      supabase.from('village_health_volunteers').select('id,full_name,phone,village').eq('location_id', locationId).eq('is_active', true).order('full_name')
    ]).then(([areaResult, volunteerResult]) => {
      if (!current) return;
      setArea(areaResult.data?.coverage_area || '');
      setVolunteers((volunteerResult.data || []) as Pick<Volunteer, 'id' | 'full_name' | 'phone' | 'village'>[]);
    });
    return () => { current = false; };
  }, [locationId]);
  if (!locationId) return null;
  return <div className="service-area-info"><b>เขตรับผิดชอบและ อสม. ประจำหน่วยบริการ</b>{area ? <p><MapPinned size={14}/><span>{area}</span></p> : <p><MapPinned size={14}/><span>ยังไม่ได้บันทึกเขตรับผิดชอบ</span></p>}<label>อสม. ผู้ดูแลพื้นที่<select name="volunteer" value={volunteerId} onChange={event => onVolunteerChange(event.target.value)}><option value="">{volunteers.length ? 'เลือก อสม. ผู้ดูแล' : 'ยังไม่มีรายชื่อ อสม. ในหน่วยบริการนี้'}</option>{volunteers.map(volunteer => <option key={volunteer.id} value={volunteer.id}>{volunteer.full_name}{volunteer.village ? ` · ${volunteer.village}` : ''} · ${volunteer.phone}</option>)}</select></label>{volunteerId && volunteers.find(volunteer => volunteer.id === volunteerId) && <p><UserRound size={14}/><span>เบอร์ติดต่อ อสม.: <a href={`tel:${volunteers.find(volunteer => volunteer.id === volunteerId)?.phone}`}>{volunteers.find(volunteer => volunteer.id === volunteerId)?.phone}</a></span></p>}{!volunteers.length && <small>เพิ่มรายชื่อจริงในแผงจัดการด้านบนก่อนส่งคำขอ เพื่อเชื่อมผู้ยืมกับ อสม.</small>}</div>;
}

