import { Ruler, Timer, Video, X } from 'lucide-react';

const RELAYS = [
  { key: 'omx', label: 'OMX 팔로워 (Dynamixel)' },
  { key: 'conveyor', label: '컨베이어' },
  { key: 'door', label: '출입문' },
];

export default function SettingsModal({ settings, onChange, onClose }) {
  function set(key, value) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className="cam-modal-overlay" onClick={onClose}>
      <div className="cam-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="cam-modal-head">
          <div className="card-title">안전 설정</div>
          <button className="cam-modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="zone-field">
          <div className="zone-field-label">
            <span>로봇 안전거리 임계값 (ISO 13855 기준)</span>
            <span className="mono">{settings.safeDistance.toFixed(2)} m</span>
          </div>
          <input type="range" min="0.5" max="2.5" step="0.05" value={settings.safeDistance} onChange={e => set('safeDistance', parseFloat(e.target.value))} />
        </div>

        <div className="zone-field">
          <div className="zone-field-label"><span>경고 → 정지 유예시간</span><span className="mono">{settings.escalateMs / 1000}s</span></div>
          <input type="range" min="1000" max="5000" step="500" value={settings.escalateMs} onChange={e => set('escalateMs', parseInt(e.target.value))} />
        </div>

        <div className="zone-field">
          <div className="zone-field-label"><span><Timer size={13} style={{ verticalAlign: -2, marginRight: 4 }} />컨베이어 센서1→센서2 타임아웃</span><span className="mono">{(settings.conveyorTimeoutMs / 1000).toFixed(1)}s</span></div>
          <input type="range" min="500" max="4000" step="250" value={settings.conveyorTimeoutMs} onChange={e => set('conveyorTimeoutMs', parseInt(e.target.value))} />
        </div>

        <div className="zone-field">
          <div className="zone-field-label"><span><Video size={13} style={{ verticalAlign: -2, marginRight: 4 }} />이벤트 녹화 구간 (전 n초 / 후 m초)</span></div>
          <div className="zone-dual">
            <label>전 (n초)<input type="number" min="1" max="30" value={settings.preRollSec} onChange={e => set('preRollSec', parseInt(e.target.value) || 0)} /></label>
            <label>후 (m초)<input type="number" min="1" max="60" value={settings.postRollSec} onChange={e => set('postRollSec', parseInt(e.target.value) || 0)} /></label>
          </div>
        </div>

        <div className="zone-field">
          <div className="zone-field-label"><span>DB 저장 공간 할당</span><span className="mono">SSD 전체의 {settings.dbQuotaPct}%</span></div>
          <input type="range" min="10" max="80" step="5" value={settings.dbQuotaPct} onChange={e => set('dbQuotaPct', parseInt(e.target.value))} />
        </div>

        <div className="zone-field">
          <div className="zone-field-label"><span>릴레이 수동 테스트</span></div>
          <div className="relay-test-list">
            {RELAYS.map(r => (
              <div className="relay-test-row" key={r.key}>
                <span>{r.label}</span>
                <button>TEST</button>
              </div>
            ))}
          </div>
        </div>

        <div className="btn-row" style={{ marginTop: 4 }}>
          <button className="primary" onClick={onClose}>닫기 (설정은 실시간 반영됩니다)</button>
        </div>
      </div>
    </div>
  );
}