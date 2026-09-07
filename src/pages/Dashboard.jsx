import { Camera, Shield, User, Flame, HardHat, Settings, Bot, Rows3, DoorClosed, Cpu, Target, MoveHorizontal, MoveVertical, MoveDiagonal, ShieldCheck, Check } from 'lucide-react';

export default function Dashboard({ state, states, distance }) {
  const s = states[state];
  const danger = (state === 'EMERGENCY' || state === 'STOP');

  const boxPct = Math.max(8, Math.min(70, 70 - (distance / 2.5) * 45));
  const boxColor = distance < 1.2 ? '#e63946' : distance < 1.6 ? '#e08e0b' : '#2f5fdb';

  const equipColor = danger ? '#e63946' : '#12b76a';
  const doorColor = danger ? '#e08e0b' : '#98a2b3';

  return (
    <>
      <div className="top-grid">
        <div className="card">
          <div className="card-head">
            <div className="card-head-left"><div className="icon-badge"><Camera size={16} /></div><div className="card-title">D435i 카메라</div></div>
            <div className="pill live">● 실시간</div>
          </div>
          <div className="cam-frame">
            <svg viewBox="0 0 400 250" width="100%" height="100%" style={{ display: 'block' }}>
              <rect width="400" height="250" fill="#e9edf3" />
              <rect x="0" y="170" width="400" height="80" fill="#dde3ec" />
              <rect x="20" y="60" width="90" height="110" rx="4" fill="#c9d2e0" />
              <rect x="250" y="40" width="70" height="130" rx="4" fill="#c9d2e0" />
              <g transform="translate(150,90)">
                <rect x="-8" y="60" width="16" height="14" rx="2" fill="#8f9bb3" />
                <rect x="-4" y="10" width="8" height="52" fill="#8f9bb3" />
                <circle cx="0" cy="6" r="8" fill="#7787a5" />
                <rect x="0" y="-2" width="34" height="7" rx="3" fill="#7787a5" />
                <circle cx="36" cy="1" r="6" fill="#66759a" />
              </g>
              <rect x="60" y="185" width="220" height="10" rx="3" fill="#b9c2d1" />
              <g transform="translate(230,120)">
                <circle cx="0" cy="0" r="9" fill="#3a4356" />
                <rect x="-11" y="8" width="22" height="34" rx="6" fill="#f5b400" />
                <rect x="-6" y="42" width="6" height="22" fill="#3a4356" />
                <rect x="4" y="42" width="6" height="22" fill="#3a4356" />
              </g>
            </svg>
            <div className="bbox" style={{ left: `${boxPct}%`, top: '38%', width: '15%', height: '38%', borderColor: boxColor }}></div>
            <div className="bbox-label" style={{ left: `${boxPct + 7.5}%`, top: '38%', background: boxColor }}>작업자 {distance.toFixed(2)}m</div>
            <div className="cam-caption">RealSense D435i · 카메라 영상 (목업)</div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-head-left"><div className="icon-badge"><Shield size={16} /></div><div className="card-title">안전 상태</div></div>
            <div className="pill">현재 상태</div>
          </div>
          <div className="status-box" style={{ background: s.box }}>
            <div className="status-icon" style={{ background: s.icon }}><Check size={20} /></div>
            <div>
              <div className="status-name" style={{ color: s.icon }}>{s.name}</div>
              <div className="status-hint">{s.hint}</div>
            </div>
          </div>
          <div className="info-row"><User size={16} style={{ color: 'var(--dim)' }} /><span className="lbl">작업자 거리</span><span className="val mono">{distance.toFixed(2)} m</span></div>
          <div className="info-row"><Flame size={16} style={{ color: 'var(--dim)' }} /><span className="lbl">화재 감지</span><span className="val">이상 없음</span></div>
          <div className="info-row"><HardHat size={16} style={{ color: 'var(--dim)' }} /><span className="lbl">안전모 감지</span><span className="val" style={{ color: 'var(--green)' }}>감지됨</span></div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div className="card-head-left"><div className="icon-badge"><Settings size={16} /></div><div className="card-title">설비 상태</div></div></div>
        <div className="equip-grid">
          <div className="equip-card">
            <div className="equip-icon" style={{ background: equipColor }}><Bot size={20} /></div>
            <div><div className="equip-name">SCARA 로봇</div><div className="equip-state" style={{ color: equipColor }}><span className="d"></span>{danger ? '정지' : '동작 중'}</div></div>
          </div>
          <div className="equip-card">
            <div className="equip-icon" style={{ background: equipColor }}><Rows3 size={20} /></div>
            <div><div className="equip-name">컨베이어</div><div className="equip-state" style={{ color: equipColor }}><span className="d"></span>{danger ? '정지' : '동작 중'}</div></div>
          </div>
          <div className="equip-card">
            <div className="equip-icon" style={{ background: doorColor }}><DoorClosed size={20} /></div>
            <div><div className="equip-name">출입문</div><div className="equip-state" style={{ color: doorColor }}><span className="d"></span>{danger ? '열림' : '닫힘'}</div></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-head-left"><div className="icon-badge indigo"><Cpu size={16} /></div><div className="card-title">AI / 뎁스 감지 정보</div></div>
          <div className="pill live">● {state === 'NORMAL' ? '감지 중' : s.name}</div>
        </div>
        <div className="ai-grid">
          <div className="ai-cell"><Target /><div className="lbl">감지 객체</div><div className="val">작업자</div></div>
          <div className="ai-cell"><User /><div className="lbl">작업자 거리</div><div className="val mono">{distance.toFixed(2)} m</div></div>
          <div className="ai-cell"><MoveHorizontal /><div className="lbl">X 위치</div><div className="val mono">0.32 m</div></div>
          <div className="ai-cell"><MoveVertical /><div className="lbl">Y 위치</div><div className="val mono">1.10 m</div></div>
          <div className="ai-cell"><MoveDiagonal /><div className="lbl">Z 위치</div><div className="val mono">{distance.toFixed(2)} m</div></div>
          <div className="ai-cell"><ShieldCheck /><div className="lbl">안전구역</div><div className="val" style={{ color: danger ? 'var(--red)' : 'var(--green)' }}>{danger ? '위험' : '정상'}</div></div>
        </div>
      </div>
    </>
  );
}