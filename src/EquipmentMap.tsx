import { useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type MapLocation = {
  id: string;
  location_name: string;
  latitude: number | string | null;
  longitude: number | string | null;
  subdistrict?: string | null;
};

type MapEquipment = {
  id: string;
  equipment_code: string;
  equipment_name: string;
  status: string;
  location_id: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

type MapBorrow = {
  id: string;
  borrow_code: string;
  equipment_id: string;
  borrower_name: string;
  borrower_address: string;
  due_date: string;
  status: string;
  purpose: string | null;
  borrower_latitude?: number | string | null;
  borrower_longitude?: number | string | null;
};

type Coordinates = { latitude: number; longitude: number };

type Props = {
  locations: MapLocation[];
  equipment: MapEquipment[];
  borrowTransactions: MapBorrow[];
  isAdmin: boolean;
  initialLocationId?: string;
  onSaveLocation: (locationId: string, coordinates: Coordinates, subdistrict: string) => Promise<boolean>;
  onSaveEquipmentLocation: (equipmentId: string, coordinates: Coordinates) => Promise<boolean>;
};

const defaultCenter: L.LatLngExpression = [18.3981, 99.8252];
const tileUrl = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function hasCoordinates(location: MapLocation): location is MapLocation & { latitude: number | string; longitude: number | string } {
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  return location.latitude !== null && location.latitude !== undefined && location.longitude !== null && location.longitude !== undefined && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

function hasEquipmentCoordinates(item: MapEquipment): item is MapEquipment & { latitude: number | string; longitude: number | string } {
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  return item.latitude !== null && item.latitude !== undefined && item.longitude !== null && item.longitude !== undefined && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

function hasBorrowerCoordinates(loan: MapBorrow): loan is MapBorrow & { borrower_latitude: number | string; borrower_longitude: number | string } {
  const latitude = Number(loan.borrower_latitude);
  const longitude = Number(loan.borrower_longitude);
  return loan.borrower_latitude !== null && loan.borrower_latitude !== undefined && loan.borrower_longitude !== null && loan.borrower_longitude !== undefined && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

const borrowStatusNames: Record<string, string> = {
  PENDING: 'รออนุมัติ',
  APPROVED: 'อนุมัติแล้ว',
  BORROWED: 'กำลังยืม',
  OVERDUE: 'เกินกำหนดคืน',
};

const equipmentStatusNames: Record<string, string> = {
  AVAILABLE: 'พร้อมใช้งาน',
  BORROWED: 'กำลังยืม',
  WAITING_INSPECTION: 'รอตรวจสภาพ',
  WAITING_CLEANING: 'รอทำความสะอาด',
  REPAIRING: 'กำลังซ่อม',
  UNAVAILABLE: 'ไม่พร้อมใช้งาน',
  DISPOSED: 'จำหน่าย',
};

function formatDueDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'ไม่ระบุ' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(date);
}

function borrowStatusLabel(loan: MapBorrow) {
  if (loan.status === 'BORROWED' && new Date(loan.due_date).getTime() < Date.now()) return 'เกินกำหนดคืน';
  return borrowStatusNames[loan.status] || loan.status;
}

export default function EquipmentMap({ locations, equipment, borrowTransactions, isAdmin, initialLocationId, onSaveLocation, onSaveEquipmentLocation }: Props) {
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const hasFittedBounds = useRef(false);
  const [selectedLocationId, setSelectedLocationId] = useState(initialLocationId || '');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');
  const [selectedSubdistrict, setSelectedSubdistrict] = useState('');
  const [pinTarget, setPinTarget] = useState<'location' | 'equipment' | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [pinPreview, setPinPreview] = useState<Coordinates | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialLocationId) {
      setSelectedLocationId(initialLocationId);
      setSelectedSubdistrict(locations.find(location => location.id === initialLocationId)?.subdistrict || '');
    }
  }, [initialLocationId, locations]);

  useEffect(() => {
    if (!selectedLocationId) return;
    setSelectedSubdistrict(locations.find(location => location.id === selectedLocationId)?.subdistrict || '');
  }, [selectedLocationId, locations]);

  const equipmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of equipment) {
      if (item.location_id) counts.set(item.location_id, (counts.get(item.location_id) || 0) + 1);
    }
    return counts;
  }, [equipment]);
  const borrowCounts = useMemo(() => {
    const equipmentLocations = new Map(equipment.map(item => [item.id, item.location_id]));
    const counts = new Map<string, number>();
    for (const loan of borrowTransactions) {
      const locationId = equipmentLocations.get(loan.equipment_id);
      if (locationId) counts.set(locationId, (counts.get(locationId) || 0) + 1);
    }
    return counts;
  }, [equipment, borrowTransactions]);

  const selectedLocation = locations.find(location => location.id === selectedLocationId);
  const selectedEquipment = equipment.find(item => item.id === selectedEquipmentId);
  const pinnedLocations = locations.filter(hasCoordinates);
  const equipmentWithCoordinates = equipment.filter(hasEquipmentCoordinates);
  const equipmentWithoutCoordinates = equipment.length - equipmentWithCoordinates.length;
  const equipmentOnMap = pinnedLocations.reduce((total, location) => total + (equipmentCounts.get(location.id) || 0), 0);
  const equipmentWithoutLocation = equipment.filter(item => !item.location_id).length;
  const loansWithCoordinates = borrowTransactions.filter(hasBorrowerCoordinates);

  useEffect(() => {
    if (!mapElement.current || map.current) return;
    const instance = L.map(mapElement.current, { scrollWheelZoom: true }).setView(defaultCenter, 11);
    L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(instance);
    markerLayer.current = L.layerGroup().addTo(instance);
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      markerLayer.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    const layer = markerLayer.current;
    if (!instance || !layer) return;
    layer.clearLayers();

    const pointBounds: L.LatLngExpression[] = [];
    for (const location of pinnedLocations) {
      const point: L.LatLngExpression = [Number(location.latitude), Number(location.longitude)];
      pointBounds.push(point);
      const count = equipmentCounts.get(location.id) || 0;
      const marker = L.marker(point, {
        icon: L.divIcon({
          className: 'equipment-map-marker',
          html: `<span>${count > 99 ? '99+' : count}</span>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        }),
      }).addTo(layer);

      const popup = document.createElement('div');
      popup.className = 'equipment-map-popup';
      const title = document.createElement('strong');
      title.textContent = location.location_name;
      const countLabel = document.createElement('span');
      countLabel.textContent = `อุปกรณ์ ${count.toLocaleString('th-TH')} รายการ`;
      popup.append(title, countLabel);
      const coordinates = document.createElement('small');
      coordinates.textContent = `พิกัดสถานที่เก็บ: ${Number(location.latitude).toFixed(6)}, ${Number(location.longitude).toFixed(6)}`;
      popup.append(coordinates);
      if (location.subdistrict) {
        const subdistrict = document.createElement('small');
        subdistrict.textContent = `ตำบล${location.subdistrict}`;
        popup.append(subdistrict);
      }
      const itemsAtLocation = equipment.filter(item => item.location_id === location.id).slice(0, 6);
      for (const item of itemsAtLocation) {
        const row = document.createElement('small');
        row.textContent = `${item.equipment_code} · ${item.equipment_name}`;
        popup.append(row);
      }
      if (count > itemsAtLocation.length) {
        const more = document.createElement('small');
        more.textContent = `และอีก ${count - itemsAtLocation.length} รายการ`;
        popup.append(more);
      }
      const locationEquipmentIds = new Set(equipment.filter(item => item.location_id === location.id).map(item => item.id));
      const loansAtLocation = borrowTransactions.filter(loan => locationEquipmentIds.has(loan.equipment_id));
      const loanHeading = document.createElement('strong');
      loanHeading.textContent = `รายการยืมที่เกี่ยวข้อง ${loansAtLocation.length.toLocaleString('th-TH')} รายการ`;
      popup.append(loanHeading);
      for (const loan of loansAtLocation.slice(0, 8)) {
        const item = equipment.find(candidate => candidate.id === loan.equipment_id);
        const row = document.createElement('small');
        row.textContent = `${loan.borrow_code} · ${item?.equipment_code || 'อุปกรณ์'}${item?.equipment_name ? ` · ${item.equipment_name}` : ''} · ${borrowStatusLabel(loan)}`;
        popup.append(row);
        const borrower = document.createElement('small');
        borrower.textContent = `ผู้ยืม: ${loan.borrower_name} · กำหนดคืน: ${formatDueDate(loan.due_date)}`;
        popup.append(borrower);
        const address = document.createElement('small');
        address.textContent = `ที่อยู่ผู้ยืม: ${loan.borrower_address}`;
        popup.append(address);
        if (loan.purpose) {
          const purpose = document.createElement('small');
          purpose.textContent = `วัตถุประสงค์: ${loan.purpose}`;
          popup.append(purpose);
        }
      }
      if (loansAtLocation.length > 8) {
        const moreLoans = document.createElement('small');
        moreLoans.textContent = `และอีก ${loansAtLocation.length - 8} รายการยืม`;
        popup.append(moreLoans);
      }
      marker.bindPopup(popup);
    }

    const equipmentGroups = new Map<string, MapEquipment[]>();
    for (const item of equipmentWithCoordinates) {
      const key = `${Number(item.latitude).toFixed(6)},${Number(item.longitude).toFixed(6)}`;
      const group = equipmentGroups.get(key) || [];
      group.push(item);
      equipmentGroups.set(key, group);
    }
    for (const [key, items] of equipmentGroups) {
      const [latitude, longitude] = key.split(',').map(Number);
      const point: L.LatLngExpression = [latitude, longitude];
      pointBounds.push(point);
      const marker = L.marker(point, {
        icon: L.divIcon({
          className: 'equipment-item-map-marker',
          html: `<span>${items.length > 99 ? '99+' : items.length}</span>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        }),
      }).addTo(layer);
      const popup = document.createElement('div');
      popup.className = 'equipment-map-popup';
      const title = document.createElement('strong');
      title.textContent = items.length === 1 ? 'ตำแหน่งอุปกรณ์' : `ตำแหน่งอุปกรณ์ ${items.length.toLocaleString('th-TH')} ชิ้น`;
      popup.append(title);
      const coordinates = document.createElement('small');
      coordinates.textContent = `พิกัดอุปกรณ์: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      popup.append(coordinates);
      for (const item of items.slice(0, 8)) {
        const itemLine = document.createElement('small');
        itemLine.textContent = `${item.equipment_code} · ${item.equipment_name} · ${equipmentStatusNames[item.status] || item.status}`;
        popup.append(itemLine);
        const storageLocation = locations.find(location => location.id === item.location_id);
        if (storageLocation) {
          const locationName = document.createElement('small');
          locationName.textContent = `สถานที่เก็บ: ${storageLocation.location_name}`;
          popup.append(locationName);
        }
      }
      if (items.length > 8) {
        const more = document.createElement('small');
        more.textContent = `และอีก ${items.length - 8} ชิ้น`;
        popup.append(more);
      }
      marker.bindPopup(popup);
    }

    // Use coordinates saved with the borrow request; group identical points to avoid stacked markers.
    const borrowerGroups = new Map<string, MapBorrow[]>();
    for (const loan of loansWithCoordinates) {
      const key = `${Number(loan.borrower_latitude).toFixed(6)},${Number(loan.borrower_longitude).toFixed(6)}`;
      const group = borrowerGroups.get(key) || [];
      group.push(loan);
      borrowerGroups.set(key, group);
    }
    for (const [key, loans] of borrowerGroups) {
      const [latitude, longitude] = key.split(',').map(Number);
      const point: L.LatLngExpression = [latitude, longitude];
      pointBounds.push(point);
      const marker = L.marker(point, {
        icon: L.divIcon({
          className: 'borrower-map-marker',
          html: `<span>${loans.length > 99 ? '99+' : loans.length}</span>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        }),
      }).addTo(layer);
      const popup = document.createElement('div');
      popup.className = 'equipment-map-popup';
      const title = document.createElement('strong');
      title.textContent = loans.length === 1 ? `ตำแหน่งผู้ยืม · ${loans[0].borrower_name}` : `ตำแหน่งผู้ยืม · ${loans.length.toLocaleString('th-TH')} รายการ`;
      popup.append(title);
      const coordinates = document.createElement('small');
      coordinates.textContent = `พิกัดที่บันทึกตอนขอยืม: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      popup.append(coordinates);
      for (const loan of loans.slice(0, 8)) {
        const item = equipment.find(candidate => candidate.id === loan.equipment_id);
        const row = document.createElement('small');
        row.textContent = `${loan.borrow_code} · ${borrowStatusLabel(loan)} · ${item?.equipment_code || 'อุปกรณ์'}${item?.equipment_name ? ` · ${item.equipment_name}` : ''}`;
        popup.append(row);
        const borrower = document.createElement('small');
        borrower.textContent = `ผู้ยืม: ${loan.borrower_name} · กำหนดคืน: ${formatDueDate(loan.due_date)}`;
        popup.append(borrower);
        const address = document.createElement('small');
        address.textContent = `ที่อยู่ผู้ยืม: ${loan.borrower_address || 'ไม่ระบุ'}`;
        popup.append(address);
        if (loan.purpose) {
          const purpose = document.createElement('small');
          purpose.textContent = `วัตถุประสงค์: ${loan.purpose}`;
          popup.append(purpose);
        }
      }
      if (loans.length > 8) {
        const more = document.createElement('small');
        more.textContent = `และอีก ${loans.length - 8} รายการ`;
        popup.append(more);
      }
      marker.bindPopup(popup);
    }

    if (pinPreview) {
      const point: L.LatLngExpression = [pinPreview.latitude, pinPreview.longitude];
      pointBounds.push(point);
      L.marker(point, {
        icon: L.divIcon({ className: pinTarget === 'equipment' ? 'equipment-item-preview-marker' : 'equipment-map-preview-marker', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] }),
      }).addTo(layer).bindPopup('ตำแหน่งที่จะบันทึก');
    }

    if (pointBounds.length && !hasFittedBounds.current) {
      if (pointBounds.length === 1) instance.setView(pointBounds[0], 14);
      else instance.fitBounds(L.latLngBounds(pointBounds), { padding: [32, 32], maxZoom: 14 });
      hasFittedBounds.current = true;
    }
    requestAnimationFrame(() => instance.invalidateSize());
  }, [pinnedLocations, equipmentCounts, equipment, equipmentWithCoordinates, locations, borrowTransactions, loansWithCoordinates, pinPreview, pinTarget]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const handleClick = (event: L.LeafletMouseEvent) => {
      if (isPicking) setPinPreview({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    };
    instance.on('click', handleClick);
    const container = instance.getContainer();
    container.classList.toggle('equipment-map-picking', isPicking);
    return () => {
      instance.off('click', handleClick);
      container.classList.remove('equipment-map-picking');
    };
  }, [isPicking]);

  async function savePin() {
    if (!pinPreview || !pinTarget) return;
    if (pinTarget === 'location' && !selectedLocationId) return;
    if (pinTarget === 'equipment' && !selectedEquipmentId) return;
    setSaving(true);
    const saved = pinTarget === 'equipment'
      ? await onSaveEquipmentLocation(selectedEquipmentId, pinPreview)
      : await onSaveLocation(selectedLocationId, pinPreview, selectedSubdistrict.trim());
    setSaving(false);
    if (saved) {
      map.current?.setView([pinPreview.latitude, pinPreview.longitude], Math.max(map.current.getZoom(), 16));
      setIsPicking(false);
      setPinPreview(null);
      setPinTarget(null);
    }
  }

  function beginPin() {
    if (!selectedLocationId) return;
    setPinPreview(null);
    setPinTarget('location');
    setIsPicking(true);
  }

  function beginEquipmentPin() {
    if (!selectedEquipmentId) return;
    setPinPreview(null);
    setPinTarget('equipment');
    setIsPicking(true);
  }

  return (
    <section className="panel equipment-map-panel">
      <div className="panel-head">
        <div>
          <h3>แผนที่อุปกรณ์และตำแหน่งผู้ยืม</h3>
          <p>สีเขียวคือสถานที่เก็บ สีม่วงคือพิกัดอุปกรณ์รายชิ้น และสีส้มคือพิกัดผู้ยืมจากคำขอยืม</p>
        </div>
        <span className="panel-tag">ไม่ต้องปักพิกัดซ้ำ</span>
      </div>

      <div className="map-summary">
        <div><strong>{pinnedLocations.length.toLocaleString('th-TH')}</strong><span>สถานที่ที่ปักพิกัดแล้ว</span></div>
        <div><strong>{equipmentOnMap.toLocaleString('th-TH')}</strong><span>อุปกรณ์ในสถานที่ที่มีพิกัด</span></div>
        <div><strong>{equipmentWithCoordinates.length.toLocaleString('th-TH')}</strong><span>อุปกรณ์ที่ปักพิกัดรายชิ้น</span></div>
        <div><strong>{equipmentWithoutCoordinates.toLocaleString('th-TH')}</strong><span>อุปกรณ์ที่ยังไม่มีพิกัดรายชิ้น</span></div>
        <div><strong>{loansWithCoordinates.length.toLocaleString('th-TH')}</strong><span>รายการยืมที่มีพิกัดผู้ยืม</span></div>
      </div>

      <div className="equipment-map-layout">
        <div className="equipment-map" ref={mapElement} aria-label="แผนที่จุดเก็บอุปกรณ์และตำแหน่งผู้ยืม" />
        <aside className="map-pin-panel">
          {isAdmin ? <>
            <div className="map-pin-section">
              <h4>ปักพิกัดอุปกรณ์รายชิ้น</h4>
              <label htmlFor="map-equipment-select">เลือกอุปกรณ์</label>
              <select id="map-equipment-select" value={selectedEquipmentId} onChange={event => { setSelectedEquipmentId(event.target.value); setIsPicking(false); setPinPreview(null); setPinTarget(null); }}>
                <option value="">เลือกอุปกรณ์ในทะเบียน</option>
                {equipment.map(item => <option key={item.id} value={item.id}>{item.equipment_code} · {item.equipment_name}{hasEquipmentCoordinates(item) ? ' · ปักพิกัดแล้ว' : ' · ยังไม่มีพิกัด'}</option>)}
              </select>
              {selectedEquipment && hasEquipmentCoordinates(selectedEquipment) && <div className="map-coordinates">พิกัดปัจจุบัน {Number(selectedEquipment.latitude).toFixed(6)}, {Number(selectedEquipment.longitude).toFixed(6)}</div>}
              <button className="secondary" type="button" disabled={!selectedEquipmentId} onClick={beginEquipmentPin}>
                {selectedEquipment && hasEquipmentCoordinates(selectedEquipment) ? 'ปรับพิกัดอุปกรณ์' : 'เริ่มปักพิกัดอุปกรณ์'}
              </button>
              {isPicking && pinTarget === 'equipment' && <p className="map-help">คลิกบนแผนที่ตรงตำแหน่งจริงของอุปกรณ์ที่เลือก</p>}
              <p className="map-help">พิกัดนี้ผูกกับอุปกรณ์ที่เลือกโดยตรง แยกจากพิกัดสถานที่เก็บ</p>
            </div>
            <div className="map-pin-section">
              <h4>ปักพิกัดสถานที่เก็บอุปกรณ์</h4>
              <label htmlFor="map-location-select">สถานที่จริง</label>
              <select id="map-location-select" value={selectedLocationId} onChange={event => { setSelectedLocationId(event.target.value); setIsPicking(false); setPinPreview(null); setPinTarget(null); }}>
                <option value="">เลือกสถานที่</option>
                {locations.map(location => <option key={location.id} value={location.id}>{location.location_name}</option>)}
              </select>
              <label htmlFor="map-subdistrict-input">ตำบลที่ตั้งจริง</label>
              <input id="map-subdistrict-input" value={selectedSubdistrict} onChange={event => setSelectedSubdistrict(event.target.value)} placeholder="ตรวจสอบและระบุตำบลของจุดเก็บอุปกรณ์" />
              <button className="secondary" type="button" disabled={!selectedLocationId} onClick={beginPin}>
                {selectedLocation && hasCoordinates(selectedLocation) ? 'ปรับพิกัดสถานที่' : 'เริ่มปักพิกัดสถานที่'}
              </button>
              {isPicking && pinTarget === 'location' && <p className="map-help">คลิกบนแผนที่ตรงตำแหน่งที่เก็บอุปกรณ์จริง</p>}
              <p className="map-help">หมุดสถานที่แสดงจุดเก็บรวมของหน่วยบริการ</p>
            </div>
            {pinPreview && <>
              <div className="map-coordinates">พิกัดที่จะบันทึก {pinPreview.latitude.toFixed(6)}, {pinPreview.longitude.toFixed(6)}</div>
              <button className="primary" type="button" disabled={saving || (pinTarget === 'location' && !selectedSubdistrict.trim())} onClick={() => void savePin()}>{saving ? 'กำลังบันทึก…' : pinTarget === 'equipment' ? 'บันทึกพิกัดอุปกรณ์' : 'บันทึกพิกัดสถานที่'}</button>
            </>}
          </> : <p className="map-help">ผู้ดูแลระบบสามารถปักพิกัดจากหน้าแผนที่ได้</p>}

          <div className="map-location-list">
            <h4>สถานที่ในทะเบียน</h4>
            {locations.map(location => {
              const count = equipmentCounts.get(location.id) || 0;
              const loanCount = borrowCounts.get(location.id) || 0;
              const pinned = hasCoordinates(location);
              return <button className="map-location-row" type="button" key={location.id} onClick={() => {
                setSelectedLocationId(location.id);
                setIsPicking(false);
                setPinPreview(null);
                setPinTarget(null);
                if (pinned && map.current) map.current.setView([Number(location.latitude), Number(location.longitude)], 16);
              }}>
                <span><b>{location.location_name}</b><small>{pinned ? `${count.toLocaleString('th-TH')} อุปกรณ์ · ${location.subdistrict ? `ต.${location.subdistrict}` : 'ยังไม่ระบุตำบล'} · ยืม ${loanCount.toLocaleString('th-TH')} รายการ` : `${count.toLocaleString('th-TH')} อุปกรณ์ · ยืม ${loanCount.toLocaleString('th-TH')} รายการ · ยังไม่ได้ปักพิกัด`}</small></span>
                <span className={pinned ? 'map-status pinned' : 'map-status'}>{pinned ? 'ดู' : 'รอปัก'}</span>
              </button>;
            })}
            {equipmentWithoutLocation > 0 && <div className="map-unassigned-note">อีก {equipmentWithoutLocation.toLocaleString('th-TH')} รายการยังไม่ผูกกับสถานที่ จึงยังไม่แสดงบนแผนที่</div>}
          </div>
        </aside>
      </div>
    </section>
  );
}


