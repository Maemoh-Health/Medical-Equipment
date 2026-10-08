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
};

type Coordinates = { latitude: number; longitude: number };

type Props = {
  locations: MapLocation[];
  equipment: MapEquipment[];
  isAdmin: boolean;
  initialLocationId?: string;
  onSaveLocation: (locationId: string, coordinates: Coordinates, subdistrict: string) => Promise<boolean>;
};

const defaultCenter: L.LatLngExpression = [18.3981, 99.8252];
const tileUrl = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function hasCoordinates(location: MapLocation): location is MapLocation & { latitude: number | string; longitude: number | string } {
  return location.latitude !== null && location.latitude !== undefined && location.longitude !== null && location.longitude !== undefined;
}

export default function EquipmentMap({ locations, equipment, isAdmin, initialLocationId, onSaveLocation }: Props) {
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const hasFittedBounds = useRef(false);
  const [selectedLocationId, setSelectedLocationId] = useState(initialLocationId || '');
  const [selectedSubdistrict, setSelectedSubdistrict] = useState('');
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

  const selectedLocation = locations.find(location => location.id === selectedLocationId);
  const pinnedLocations = locations.filter(hasCoordinates);
  const equipmentOnMap = pinnedLocations.reduce((total, location) => total + (equipmentCounts.get(location.id) || 0), 0);
  const equipmentWithoutLocation = equipment.filter(item => !item.location_id).length;
  const equipmentAtUnpinnedLocation = locations
    .filter(location => !hasCoordinates(location))
    .reduce((total, location) => total + (equipmentCounts.get(location.id) || 0), 0);

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
      marker.bindPopup(popup);
    }

    if (pinPreview) {
      const point: L.LatLngExpression = [pinPreview.latitude, pinPreview.longitude];
      pointBounds.push(point);
      L.marker(point, {
        icon: L.divIcon({ className: 'equipment-map-preview-marker', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] }),
      }).addTo(layer).bindPopup('ตำแหน่งที่จะบันทึก');
    }

    if (pointBounds.length && !hasFittedBounds.current) {
      if (pointBounds.length === 1) instance.setView(pointBounds[0], 14);
      else instance.fitBounds(L.latLngBounds(pointBounds), { padding: [32, 32], maxZoom: 14 });
      hasFittedBounds.current = true;
    }
    requestAnimationFrame(() => instance.invalidateSize());
  }, [pinnedLocations, equipmentCounts, equipment, pinPreview]);

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
    if (!selectedLocationId || !pinPreview) return;
    setSaving(true);
    const saved = await onSaveLocation(selectedLocationId, pinPreview, selectedSubdistrict.trim());
    setSaving(false);
    if (saved) {
      setIsPicking(false);
      setPinPreview(null);
    }
  }

  function beginPin() {
    if (!selectedLocationId) return;
    setPinPreview(null);
    setIsPicking(true);
  }

  return (
    <section className="panel equipment-map-panel">
      <div className="panel-head">
        <div>
          <h3>แผนที่จุดเก็บอุปกรณ์</h3>
          <p>แสดงพิกัดสถานที่ที่จัดเก็บอุปกรณ์ ไม่ใช้ตำแหน่งผู้ยืม</p>
        </div>
        <span className="panel-tag">พิกัดจริงของสถานที่</span>
      </div>

      <div className="map-summary">
        <div><strong>{pinnedLocations.length.toLocaleString('th-TH')}</strong><span>สถานที่ที่ปักพิกัดแล้ว</span></div>
        <div><strong>{equipmentOnMap.toLocaleString('th-TH')}</strong><span>อุปกรณ์ที่แสดงบนแผนที่</span></div>
        <div><strong>{(equipmentAtUnpinnedLocation + equipmentWithoutLocation).toLocaleString('th-TH')}</strong><span>อุปกรณ์ที่ยังไม่มีพิกัด</span></div>
      </div>

      <div className="equipment-map-layout">
        <div className="equipment-map" ref={mapElement} aria-label="แผนที่สถานที่เก็บอุปกรณ์" />
        <aside className="map-pin-panel">
          <h4>ปักพิกัดสถานที่เก็บอุปกรณ์</h4>
          {isAdmin ? <>
            <label htmlFor="map-location-select">สถานที่จริง</label>
            <select id="map-location-select" value={selectedLocationId} onChange={event => { setSelectedLocationId(event.target.value); setIsPicking(false); setPinPreview(null); }}>
              <option value="">เลือกสถานที่</option>
              {locations.map(location => <option key={location.id} value={location.id}>{location.location_name}</option>)}
            </select>
            <label htmlFor="map-subdistrict-input">ตำบลที่ตั้งจริง</label>
            <input id="map-subdistrict-input" value={selectedSubdistrict} onChange={event => setSelectedSubdistrict(event.target.value)} placeholder="ตรวจสอบและระบุตำบลของจุดเก็บอุปกรณ์" />
            <button className="secondary" type="button" disabled={!selectedLocationId} onClick={beginPin}>
              {selectedLocation && hasCoordinates(selectedLocation) ? 'ปรับพิกัดสถานที่' : 'เริ่มปักพิกัด'}
            </button>
            {isPicking && <p className="map-help">คลิกบนแผนที่ตรงตำแหน่งที่เก็บอุปกรณ์จริง</p>}
            {pinPreview && <>
              <div className="map-coordinates">{pinPreview.latitude.toFixed(6)}, {pinPreview.longitude.toFixed(6)}</div>
              <button className="primary" type="button" disabled={saving || !selectedSubdistrict.trim()} onClick={() => void savePin()}>{saving ? 'กำลังบันทึก…' : 'บันทึกพิกัดสถานที่'}</button>
            </>}
            <p className="map-help">ใช้จุดของหน่วยบริการหรือสถานที่เก็บจริง พร้อมตรวจสอบชื่อตำบล อุปกรณ์ในสถานที่เดียวกันจะแสดงรวมเป็นหมุดเดียว</p>
          </> : <p className="map-help">ผู้ดูแลระบบสามารถปักพิกัดจากหน้าแผนที่ได้</p>}

          <div className="map-location-list">
            <h4>สถานที่ในทะเบียน</h4>
            {locations.map(location => {
              const count = equipmentCounts.get(location.id) || 0;
              const pinned = hasCoordinates(location);
              return <button className="map-location-row" type="button" key={location.id} onClick={() => {
                setSelectedLocationId(location.id);
                setIsPicking(false);
                setPinPreview(null);
                if (pinned && map.current) map.current.setView([Number(location.latitude), Number(location.longitude)], 16);
              }}>
                <span><b>{location.location_name}</b><small>{pinned ? `${count.toLocaleString('th-TH')} อุปกรณ์ · ${location.subdistrict ? `ต.${location.subdistrict}` : 'ยังไม่ระบุตำบล'}` : `${count.toLocaleString('th-TH')} อุปกรณ์ · ยังไม่ได้ปักพิกัด`}</small></span>
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

