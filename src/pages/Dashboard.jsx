import { Camera, Shield, User, Flame, HardHat, Settings, Bot, Rows3, DoorClosed, DoorOpen, Cpu, Target, MoveHorizontal, MoveVertical, MoveDiagonal, ShieldCheck, Check, ScanFace, AlertTriangle } from 'lucide-react';

export default function Dashboard({ state, states, distance, helmetOk, doorLocked, conveyorState, fireActive }) {
  const s = states[state];
  const danger = (state === 'EMERGENCY' || state === 'STOP') || fireActive;

  const boxPct = Math.max(8, Math.min(70, 70 - (distance / 2.5) * 45));
  const boxColor = distance < 1.2 ? '#e63946' : distance < 1.6 ? '#e08e0b' : '#2f5fdb';

  const equipColor = danger || conveyorState === 'JAM' ? '#e63946' : '#12b76a';
  const conveyorColor = conveyorState === 'JAM' ? '#e63946' : (danger ? '#e63946' : '#12b76a');
  const doorColor = fireActive ? '#12b76a' : (doorLocked ? '#e63946' : (danger ? '#e08e0b' : '#98a2b3'));

  return (
    <>
      {fireActive && (
        <div className="fire-banner">
          <Flame size={18} />
          <div>
            <div className="fire-banner-title">화재 감지 — 비상 시퀀스 진행 중</div>
            <div className="fire-banner-sub">출입문 개방 · 로봇 초기위치 대기 · 관리자가 상황종료를 누를 때까지 연속 녹화됩니다.</div>
          </div>
        </div>
      )}

      <div className="top-grid">
        <div className="card">
          <div className="card-head">
            <div className="card-head-left"><div className="icon-badge"><Camera size={16} /></div><div className="card-title">D435i 카메라 (현장)</div></div>
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
            <div className="seg-mask" style={{ left: `${boxPct}%`, top: '36%', width: '16%', height: '42%' }}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
                <path
                  d="M50 4 C61 4 65 13 61 21 C77 26 81 45 73 57 C79 71 77 90 69 100 L31 100 C23 90 21 71 27 57 C19 45 23 26 39 21 C35 13 39 4 50 4 Z"
                  fill={boxColor}
                  fillOpacity="0.3"
                  stroke={boxColor}
                  strokeWidth="2.4"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
            <div className="bbox-label" style={{ left: `${boxPct + 8}%`, top: '36%', background: boxColor }}>작업자 {distance.toFixed(2)}m · SEG</div>
            <div className="cam-caption">RealSense D435i · 카메라 영상 (목업) · Segmentation 탐지</div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-head-left"><div className="icon-badge"><Shield size={16} /></div><div className="card-title">안전 상태</div></div>
            <div className="pill">현재 상태</div>
          </div>
          <div className="status-box" style={{ background: fireActive ? '#fde8ea' : s.box }}>
            <div className="status-icon" style={{ background: fireActive ? '#e63946' : s.icon }}>
              {fireActive ? <Flame size={20} /> : <Check size={20} />}
            </div>
            <div>
              <div className="status-name" style={{ color: fireActive ? '#e63946' : s.icon }}>{fireActive ? '화재 비상' : s.name}</div>
              <div className="status-hint">{fireActive ? '출입문 개방, 로봇 초기위치 대기 중입니다.' : s.hint}</div>
            </div>
          </div>
          <div className="info-row"><User size={16} style={{ color: 'var(--dim)' }} /><span className="lbl">작업자 거리</span><span className="val mono">{distance.toFixed(2)} m</span></div>
          <div className="info-row"><Flame size={16} style={{ color: 'var(--dim)' }} /><span className="lbl">화재 감지</span><span className="val" style={{ color: fireActive ? 'var(--red)' : undefined }}>{fireActive ? '감지됨' : '이상 없음'}</span></div>
          <div className="info-row"><HardHat size={16} style={{ color: 'var(--dim)' }} /><span className="lbl">안전모 감지 (출입구)</span><span className="val" style={{ color: helmetOk ? 'var(--green)' : 'var(--red)' }}>{helmetOk ? '감지됨' : '미착용'}</span></div>
          <div className="info-row"><Rows3 size={16} style={{ color: 'var(--dim)' }} /><span className="lbl">컨베이어 이상감지</span><span className="val" style={{ color: conveyorState === 'JAM' ? 'var(--red)' : 'var(--green)' }}>{conveyorState === 'JAM' ? '이상 감지' : '정상'}</span></div>
        </div>
      </div>

      <div className="top-grid">
        <div className="card">
          <div className="card-head">
            <div className="card-head-left"><div className="icon-badge indigo"><ScanFace size={16} /></div><div className="card-title">모노카메라 (출입구 · 헬멧 감지)</div></div>
            <div className={`pill ${helmetOk ? '' : 'live'}`}>{helmetOk ? '안전모 확인됨' : '미착용 감지'}</div>
          </div>
          <div className="cam-frame">
            <svg viewBox="0 0 400 250" width="100%" height="100%" style={{ display: 'block' }}>
              <rect width="400" height="250" fill="#e4e9f1" />
              <rect x="0" y="0" width="400" height="60" fill="#d3dae5" />
              <g transform="translate(200,150)">
                <circle cx="0" cy="-38" r="26" fill="#e7c9a9" />
                <rect x="-30" y="-10" width="60" height="90" rx="16" fill="#5a7a9a" />
                {helmetOk && <path d="M -28 -50 A 28 28 0 0 1 28 -50 L 30 -40 L -30 -40 Z" fill="#f5b400" />}
              </g>
            </svg>
            <div
              className="seg-mask"
              style={{ left: '38%', top: helmetOk ? '16%' : '12%', width: '24%', height: helmetOk ? '46%' : '50%' }}
            >
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
                <path
                  d="M50 4 C61 4 65 13 61 21 C77 26 81 45 73 57 C79 71 77 90 69 100 L31 100 C23 90 21 71 27 57 C19 45 23 26 39 21 C35 13 39 4 50 4 Z"
                  fill={helmetOk ? '#12b76a' : '#e63946'}
                  fillOpacity="0.3"
                  stroke={helmetOk ? '#12b76a' : '#e63946'}
                  strokeWidth="2.4"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
            <div className="bbox-label" style={{ left: '50%', top: helmetOk ? '16%' : '12%', background: helmetOk ? '#12b76a' : '#e63946' }}>
              {helmetOk ? '안전모 착용 · SEG' : '안전모 미착용 · SEG'}
            </div>
            <div className="cam-caption">모노카메라 · 출입구 (목업) · Segmentation 탐지</div>
          </div>
          <div className="info-row" style={{ marginTop: 10 }}>
            {doorLocked ? <DoorClosed size={16} style={{ color: 'var(--red)' }} /> : <DoorOpen size={16} style={{ color: 'var(--green)' }} />}
            <span className="lbl">출입문 상태</span>
            <span className="val" style={{ color: doorLocked ? 'var(--red)' : 'var(--green)' }}>{doorLocked ? '잠금 (미착용 감지)' : '통행 가능'}</span>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-head-left"><div className="icon-badge"><Settings size={16} /></div><div className="card-title">설비 상태</div></div></div>
          <div className="equip-grid">
            <div className="equip-card">
              <div className="equip-icon" style={{ background: equipColor }}><Bot size={20} /></div>
              <div><div className="equip-name">OMX 로봇팔</div><div className="equip-state" style={{ color: equipColor }}><span className="d"></span>{fireActive ? '초기위치 대기' : danger ? '정지' : '동작 중'}</div></div>
            </div>
            <div className="equip-card">
              <div className="equip-icon" style={{ background: conveyorColor }}><Rows3 size={20} /></div>
              <div><div className="equip-name">컨베이어</div><div className="equip-state" style={{ color: conveyorColor }}><span className="d"></span>{conveyorState === 'JAM' ? '정지 · 이상감지' : (danger ? '정지' : '동작 중')}</div></div>
            </div>
            <div className="equip-card">
              <div className="equip-icon" style={{ background: doorColor }}>{doorLocked && !fireActive ? <DoorClosed size={20} /> : <DoorOpen size={20} />}</div>
              <div><div className="equip-name">출입문</div><div className="equip-state" style={{ color: doorColor }}><span className="d"></span>{fireActive ? '개방 (화재)' : doorLocked ? '잠김' : (danger ? '열림' : '닫힘')}</div></div>
            </div>
          </div>
          {conveyorState === 'JAM' && (
            <div className="note" style={{ color: 'var(--red)', borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
              <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              센서1 감지 후 설정된 시간 내 센서2 미감지 — 컨베이어 이상으로 정지되었습니다.
            </div>
          )}
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
