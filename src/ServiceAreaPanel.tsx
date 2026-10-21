type Location = { id: string; location_name: string };
type Volunteer = { id: string; full_name: string; phone: string; village: string | null; is_active: boolean };
type Equipment = { id:string; equipment_code:string; equipment_name:string; status:string; location_id:string|null; category_id:string; serial_number:string|null; categories?:{category_name:string}|null; locations?:{location_name:string}|null };
type Category = { id:string; category_name:string };
const equipmentStatuses:Record<string,string>={AVAILABLE:'พร้อมใช้งาน',BORROWED:'กำลังยืม',WAITING_INSPECTION:'รอตรวจสภาพ',WAITING_CLEANING:'รอทำความสะอาด',REPAIRING:'กำลังซ่อม',UNAVAILABLE:'ไม่พร้อมใช้งาน',DISPOSED:'จำหน่าย'};

export function ServiceAreaPanel({ locations, defaultLocationId, userId, onMessage, equipment, categories, isAdmin, onEquipmentUpdated }: {
  locations: Location[];
  defaultLocationId: string;
  userId: string;
  onMessage: (message: string) => void;
  equipment: Equipment[];
  categories: Category[];
  isAdmin: boolean;
  onEquipmentUpdated: () => void;
}) {
  const [locationId, setLocationId] = useState(defaultLocationId || locations[0]?.id || '');
  const [coverageArea, setCoverageArea] = useState('');
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userSelectedLocation, setUserSelectedLocation] = useState(false);
  const [equipmentPickerOpen, setEquipmentPickerOpen] = useState(false);
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [editingEquipmentId, setEditingEquipmentId] = useState('');
  const [savingEquipmentId, setSavingEquipmentId] = useState('');

  useEffect(() => {
    if (!userSelectedLocation && defaultLocationId && locations.some(location => location.id === defaultLocationId)) setLocationId(defaultLocationId);
  }, [defaultLocationId, locations, userSelectedLocation]);

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

  const serviceEquipment = equipment.filter(item => item.location_id === locationId);
  const activeLocationIds = new Set(locations.map(location => location.id));
  const equipmentOutsideCurrentLocations = equipment.filter(item => !item.location_id || !activeLocationIds.has(item.location_id));
  const candidateEquipment = equipmentOutsideCurrentLocations.filter(item => `${item.equipment_code} ${item.equipment_name} ${item.serial_number||''}`.toLocaleLowerCase().includes(equipmentSearch.trim().toLocaleLowerCase())).slice(0, 15);

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

  async function saveEquipment(event: React.FormEvent<HTMLFormElement>, item: Equipment) {
    event.preventDefault();
    if (!supabase || !isAdmin) return;
    const values = new FormData(event.currentTarget);
    const update = {
      equipment_code: String(values.get('equipment_code') || '').trim(),
      equipment_name: String(values.get('equipment_name') || '').trim(),
      category_id: String(values.get('category_id') || ''),
      serial_number: String(values.get('serial_number') || '').trim() || null,
      status: String(values.get('status') || item.status),
      location_id: String(values.get('location_id') || '') || null,
      updated_at: new Date().toISOString()
    };
    setSavingEquipmentId(item.id);
    const { error } = await supabase.from('equipment').update(update).eq('id', item.id);
    setSavingEquipmentId('');
    if (error) { onMessage('แก้ไขอุปกรณ์ไม่สำเร็จ กรุณาตรวจสอบสิทธิ์และข้อมูลซ้ำ'); return; }
    setEditingEquipmentId('');
    onEquipmentUpdated();
    onMessage('บันทึกการแก้ไขอุปกรณ์แล้ว');
  }

  async function assignEquipment(item: Equipment) {
    if (!supabase || !isAdmin || !locationId) return;
    setSavingEquipmentId(item.id);
    const { error } = await supabase.from('equipment').update({ location_id: locationId, updated_at: new Date().toISOString() }).eq('id', item.id);
    setSavingEquipmentId('');
    if (error) { onMessage('ผูกอุปกรณ์กับหน่วยบริการไม่สำเร็จ กรุณาตรวจสอบสิทธิ์'); return; }
    onEquipmentUpdated();
    onMessage('ผูกอุปกรณ์กับหน่วยบริการแล้ว');
  }

  const equipmentRow = (item: Equipment, canAssign = false) => <article className="service-equipment-row" key={item.id}>
    <div className="service-equipment-info"><b>{item.equipment_code}</b><span>{item.equipment_name}</span><small>{item.categories?.category_name||'ไม่ระบุประเภท'}{item.serial_number? ` · SN ${item.serial_number}`:''}</small></div>
    <span className={`service-equipment-status status-${item.status.toLowerCase()}`}>{equipmentStatuses[item.status]||item.status}</span>
    {isAdmin&&<div className="service-equipment-actions">{canAssign&&<button type="button" className="text-button" disabled={savingEquipmentId===item.id} onClick={()=>void assignEquipment(item)}>{savingEquipmentId===item.id?'กำลังบันทึก…':'ผูกกับหน่วยบริการนี้'}</button>}<button type="button" className="text-button" onClick={()=>setEditingEquipmentId(editingEquipmentId===item.id?'':item.id)}>{editingEquipmentId===item.id?'ปิด':'แก้ไขเพิ่มเติม'}</button></div>}
    {isAdmin&&editingEquipmentId===item.id&&<form className="service-equipment-edit" onSubmit={event=>void saveEquipment(event,item)}>
      <label>รหัสอุปกรณ์<input name="equipment_code" required maxLength={80} defaultValue={item.equipment_code}/></label>
      <label>ชื่ออุปกรณ์<input name="equipment_name" required maxLength={200} defaultValue={item.equipment_name}/></label>
      <label>ประเภท<select name="category_id" required defaultValue={item.category_id}>{categories.map(category=><option key={category.id} value={category.id}>{category.category_name}</option>)}</select></label>
      <label>Serial Number<input name="serial_number" defaultValue={item.serial_number||''}/></label>
      <label>สถานะ<select name="status" defaultValue={item.status}>{Object.entries(equipmentStatuses).map(([status,label])=><option value={status} key={status}>{label}</option>)}</select></label>
      <label>หน่วยบริการ<select name="location_id" defaultValue={item.location_id||locationId}>{item.location_id&&!activeLocationIds.has(item.location_id)&&<option value={item.location_id}>{item.locations?.location_name||'สถานที่เดิม'}</option>}<option value="">ยังไม่ระบุ</option>{locations.map(location=><option key={location.id} value={location.id}>{location.location_name}</option>)}</select></label>
      <div className="service-equipment-edit-actions"><button type="button" className="secondary" onClick={()=>setEditingEquipmentId('')}>ยกเลิก</button><button className="primary" disabled={savingEquipmentId===item.id}><Save size={14}/>{savingEquipmentId===item.id?'กำลังบันทึก…':'บันทึกการแก้ไข'}</button></div>
    </form>}
  </article>;

  return <section className="panel settings-panel service-area-panel">
    <div className="panel-head"><div><h3>หน่วยบริการในพื้นที่</h3><p>จัดการเขตรับผิดชอบ รายชื่อ อสม. และทะเบียนอุปกรณ์ของหน่วยบริการ</p></div><Users size={20} className="muted"/></div>
    {!locations.length ? <div className="empty-state"><MapPinned/><b>บัญชีนี้ยังไม่มีสิทธิ์เข้าถึงสถานที่</b></div> : <>
      <label className="service-location-select">หน่วยบริการ<select value={locationId} onChange={event => {setUserSelectedLocation(true);setLocationId(event.target.value);setEditingEquipmentId('')}}>{locations.map(location => <option key={location.id} value={location.id}>{location.location_name}</option>)}</select></label>
      <section className="service-equipment-section">
        <div className="service-equipment-heading"><div><b>รายการอุปกรณ์ประจำหน่วยบริการ</b><span>{serviceEquipment.length} รายการ{loading?' · กำลังโหลดข้อมูลพื้นที่…':''}</span></div>{isAdmin&&<button type="button" className="secondary" onClick={()=>setEquipmentPickerOpen(value=>!value)}><Plus size={15}/>{equipmentPickerOpen?'ปิดรายการอุปกรณ์':'เพิ่มอุปกรณ์จากทะเบียน'}</button>}</div>
        {!serviceEquipment.length?<div className="service-equipment-empty">ยังไม่มีอุปกรณ์ผูกกับหน่วยบริการนี้</div>:<div className="service-equipment-list">{serviceEquipment.map(item=>equipmentRow(item))}</div>}
        {isAdmin&&equipmentPickerOpen&&<div className="service-equipment-picker">
          <label>ค้นหาอุปกรณ์จากทะเบียน<input type="search" value={equipmentSearch} onChange={event=>setEquipmentSearch(event.target.value)} placeholder="พิมพ์รหัส ชื่อ หรือ Serial Number"/></label>
          {!equipmentSearch.trim()&&<div className="service-equipment-empty">พิมพ์คำค้นเพื่อค้นหาอุปกรณ์ที่ยังไม่ผูกกับหน่วยบริการปัจจุบัน</div>}
          {equipmentSearch.trim()&&<div className="service-equipment-list">{candidateEquipment.map(item=>equipmentRow(item,true))}{!candidateEquipment.length&&<div className="service-equipment-empty">ไม่พบอุปกรณ์ที่ค้นหา</div>}</div>}
          {equipmentSearch.trim()&&candidateEquipment.length===15&&<small>แสดง 15 รายการแรก โปรดพิมพ์คำค้นให้เฉพาะเจาะจงขึ้น</small>}
        </div>}
      </section>
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

