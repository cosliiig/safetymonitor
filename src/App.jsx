import { useState, useEffect, useRef } from 'react';
import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { Home, Activity, ClipboardList, Shield, Bell, LogOut, Ruler } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import SystemHealth from './pages/SystemHealth';
import EventLog from './pages/EventLog.jsx';
import Login from './pages/Login.jsx';
import { api, connectStatusSocket } from './api';
import SettingsModal from './components/SettingsModal.jsx';

const STATES = {
  NORMAL:    { name:'정상', hint:'현재 감지된 위험 요소가 없습니다.', box:'#e7f9f0', icon:'#12b76a', sys:'시스템 정상', sysDot:'#37e08a' },
  WARNING:   { name:'경고', hint:'위험 신호 감지 — 지속시간을 확인하는 중입니다.', box:'#fdf3de', icon:'#e08e0b', sys:'경고', sysDot:'#e08e0b' },
  EMERGENCY: { name:'비상', hint:'위험상황 확정 — 강제정지로 전환합니다.', box:'#fde8ea', icon:'#e63946', sys:'비상', sysDot:'#e63946' },
  STOP:      { name:'강제정지', hint:'MCU가 독립적으로 전원을 차단했습니다. 복구 확인이 필요합니다.', box:'#fde8ea', icon:'#e63946', sys:'강제정지', sysDot:'#e63946' },
  RECOVERY:  { name:'복구', hint:'안전 조건을 확인하고 정상 복귀를 준비 중입니다.', box:'#eaf1ff', icon:'#2f5fdb', sys:'복구 중', sysDot:'#2f5fdb' },
};

function formatDateTime(d) {
  const pad = n => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizeEvent(e) {
  return { ...e, read: e.is_read ?? e.read ?? false };
}

export default function App() {
  const [auth, setAuth] = useState(() => {
    try {
      const saved = localStorage.getItem('robotSafetyAuth');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [state, setState] = useState('NORMAL');
  const [distance, setDistance] = useState(1.82);
  const [rosUp, setRosUp] = useState(true);
  const [clock, setClock] = useState('--:--:--');

  const [helmetOk, setHelmetOk] = useState(true);
  const [doorLocked, setDoorLocked] = useState(false);
  const [conveyorState, setConveyorState] = useState('OK');
  const [fireActive, setFireActive] = useState(false);

  const [events, setEvents] = useState([]);
  const [storagePct, setStoragePct] = useState(12.4);
  const [notifOpen, setNotifOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backendError, setBackendError] = useState('');

  const [settings, setSettings] = useState({
    safeDistance: 1.20,
    escalateMs: 2500,
    conveyorTimeoutMs: 2000,
    preRollSec: 3,
    postRollSec: 5,
    dbQuotaPct: 50,
  });

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const fireRef = useRef(fireActive);
  useEffect(() => { fireRef.current = fireActive; }, [fireActive]);
  const escalateTimer = useRef(null);
  const conveyorTimer = useRef(null);

  useEffect(() => {
    const tick = () => setClock(formatDateTime(new Date()).slice(11));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!auth) return;

    let cancelled = false;

    (async () => {
      try {
        const [remoteEvents, remoteSettings] = await Promise.all([
          api.getEvents(auth.token),
          api.getSettings(auth.token),
        ]);
        if (cancelled) return;
        setEvents(remoteEvents.map(normalizeEvent));
        setSettings({
          safeDistance: remoteSettings.safe_distance,
          escalateMs: remoteSettings.escalate_ms,
          conveyorTimeoutMs: remoteSettings.conveyor_timeout_ms,
          preRollSec: remoteSettings.pre_roll_sec,
          postRollSec: remoteSettings.post_roll_sec,
          dbQuotaPct: remoteSettings.db_quota_pct,
        });
        setBackendError('');
      } catch (err) {
        setBackendError('백엔드에서 데이터를 불러오지 못했습니다: ' + err.message);
      }
    })();

    const socket = connectStatusSocket((msg) => {
      if (msg.kind === 'event') {
        setEvents(prev => {
          if (prev.some(e => e.id === msg.event.id)) return prev;
          return [normalizeEvent(msg.event), ...prev];
        });
        setStoragePct(p => Math.min(100, +(p + (1.5 + Math.random() * 3)).toFixed(1)));
      } else if (msg.kind === 'status') {
        const s = msg.status;
        if (s.state !== undefined) setState(s.state);
        if (s.distance !== undefined) setDistance(s.distance);
        if (s.helmet_ok !== undefined) setHelmetOk(s.helmet_ok);
        if (s.door_locked !== undefined) setDoorLocked(s.door_locked);
        if (s.conveyor_state !== undefined) setConveyorState(s.conveyor_state);
        if (s.fire_active !== undefined) setFireActive(s.fire_active);
      }
    });

    return () => {
      cancelled = true;
      socket.close();
    };
  }, [auth]);

  function handleLogin(authInfo) {
    setAuth(authInfo);
    try {
      localStorage.setItem('robotSafetyAuth', JSON.stringify(authInfo));
    } catch {
    }
  }

  function handleLogout() {
    if (auth) api.logout(auth.token).catch(() => {});
    setAuth(null);
    try { localStorage.removeItem('robotSafetyAuth'); } catch { }
  }

  function addEvent(type, title, detail, duration) {
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setEvents(prev => [{ id: localId, time: formatDateTime(new Date()), type, title, detail, duration, read: false }, ...prev]);
    setStoragePct(p => Math.min(100, +(p + (1.5 + Math.random() * 3)).toFixed(1)));

    if (auth) {
      api.createEvent(auth.token, { type, title, detail, duration }).catch(err => {
        setBackendError('이벤트 저장 실패: ' + err.message);
      });
    }
  }

  function evaluateRisk() {
    if (fireRef.current) return;
    if (stateRef.current === 'NORMAL') {
      setState('WARNING');
      clearTimeout(escalateTimer.current);
      escalateTimer.current = setTimeout(() => {
        if (stateRef.current === 'WARNING' && !fireRef.current) {
          setState('EMERGENCY');
          setTimeout(() => {
            if (stateRef.current === 'EMERGENCY' && !fireRef.current) {
              setState('STOP');
              addEvent('HUMAN', '로봇 접근 감지 — 강제정지', `작업자 ${distance.toFixed(2)}m 접근, 안전거리(${settings.safeDistance.toFixed(2)}m) 이하로 로봇 정지`, `${settings.preRollSec}s+${settings.postRollSec}s`);
            }
          }, 500);
        }
      }, settings.escalateMs);
    }
  }

  function simulateApproach() { setDistance(0.8); evaluateRisk(); }
  function clearDanger() {
    setDistance(1.82);
    if (stateRef.current === 'WARNING') { clearTimeout(escalateTimer.current); setState('NORMAL'); }
  }
  function forceStop() {
    clearTimeout(escalateTimer.current);
    if (stateRef.current !== 'STOP') addEvent('HUMAN', '로봇 접근 감지 — 강제정지', '수동 트리거로 강제정지 실행', `${settings.preRollSec}s+${settings.postRollSec}s`);
    setState('STOP');
  }
  function recover() {
    if (stateRef.current !== 'STOP') return;
    setState('RECOVERY');
    setTimeout(() => { if (stateRef.current === 'RECOVERY') { setDistance(1.82); setState('NORMAL'); } }, 1500);
  }
  function toggleRos() { setRosUp(v => !v); }

  function toggleHelmet() {
    if (!helmetOk) { setHelmetOk(true); setDoorLocked(false); return; }
    setHelmetOk(false);
    setDoorLocked(true);
    addEvent('HELMET', '안전모 미착용 감지', '출입구 모노카메라 - 미착용 확인, 출입문 잠금 및 즉시 녹화', '2s');
  }

  function simulateConveyorJam() {
    if (conveyorState !== 'OK') return;
    setConveyorState('PENDING');
    clearTimeout(conveyorTimer.current);
    conveyorTimer.current = setTimeout(() => {
      setConveyorState('JAM');
      addEvent('CONVEYOR', '컨베이어 이상감지', `센서1 감지 후 ${(settings.conveyorTimeoutMs / 1000).toFixed(1)}s 내 센서2 미감지`, `${settings.preRollSec}s+${settings.postRollSec}s`);
    }, settings.conveyorTimeoutMs);
  }
  function resetConveyor() { clearTimeout(conveyorTimer.current); setConveyorState('OK'); }

  function simulateFire() {
    if (fireActive) return;
    clearTimeout(escalateTimer.current);
    setFireActive(true);
    addEvent('FIRE', '화재 감지 — 비상 시퀀스 시작', '출입문 개방, 로봇 초기위치 이동 지시 (사람감지 우선). 다른 이벤트보다 우선 처리됩니다.', '진행 중');
  }
  function resolveFire() {
    if (!fireActive) return;
    setFireActive(false);
    setState('NORMAL');
    setDistance(1.82);
    addEvent('FIRE', '화재 상황 종료', '관리자가 상황종료를 확인 — 로봇 정상 운전 재개', '완료');
  }

  function markAllRead() {
    setEvents(prev => prev.map(e => ({ ...e, read: true })));
    if (auth) api.markAllRead(auth.token).catch(() => {});
  }

  function handleSettingsChange(next) {
    setSettings(next);
    if (!auth) return;
    api.updateSettings(auth.token, {
      safe_distance: next.safeDistance,
      escalate_ms: next.escalateMs,
      conveyor_timeout_ms: next.conveyorTimeoutMs,
      pre_roll_sec: next.preRollSec,
      post_roll_sec: next.postRollSec,
      db_quota_pct: next.dbQuotaPct,
    }).catch(err => setBackendError('설정 저장 실패: ' + err.message));
  }

  if (!auth) return <Login onLogin={handleLogin} />;

  const s = STATES[state];
  const linkClass = ({ isActive }) => 'nav-item' + (isActive ? ' active' : '');
  const unread = events.filter(e => !e.read).length;
  const sysLabel = fireActive ? '화재 비상' : s.sys;
  const sysDot = fireActive ? '#e63946' : s.sysDot;

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-left">
          <div className="logo-badge"><Shield size={20} /></div>
          <div>
            <div className="topbar-title">ROBOT SAFETY</div>
            <div className="topbar-sub">뎁스 카메라 기반 작업자 접근 감지 로봇 안전제어 시스템</div>
          </div>
        </div>
        <div className="topbar-right">
          <div className="sys-pill">
            <span className="sys-dot" style={{ background: rosUp ? sysDot : '#98a2b3' }}></span>
            {rosUp ? sysLabel : '통신두절 · MCU 단독'}
          </div>
          <div className="mono">{clock}</div>
          <div className="notif-wrap">
            <button className="icon-btn" onClick={() => setNotifOpen(v => !v)}>
              <Bell size={16} />
              {unread > 0 && <span className="notif-badge">{unread}</span>}
            </button>
            {notifOpen && (
              <div className="notif-dropdown">
                <div className="notif-dropdown-head">
                  <span>최근 알림</span>
                  <button onClick={markAllRead} disabled={unread === 0}>모두 읽음</button>
                </div>
                {events.slice(0, 5).map(e => (
                  <div className={`notif-row ${e.read ? '' : 'unread'}`} key={e.id}>
                    <div className="notif-body">
                      <div className="notif-title">{e.title}</div>
                      <div className="notif-time mono">{e.time}</div>
                    </div>
                  </div>
                ))}
                {events.length === 0 && <div className="note" style={{ padding: 12 }}>알림이 없습니다.</div>}
                <NavLink to="/event-log" className="notif-dropdown-footer" onClick={() => setNotifOpen(false)}>전체 보기 →</NavLink>
              </div>
            )}
          </div>
          <div className="topbar-user">
            <span>{auth.username}</span>
            <button className="icon-btn" onClick={handleLogout} title="로그아웃"><LogOut size={15} /></button>
          </div>
        </div>
      </div>

      {backendError && (
        <div className="note" style={{ color: 'var(--red)', padding: '8px 20px', background: '#fde8ea' }}>
          {backendError} — 백엔드(uvicorn)가 켜져 있는지 확인해주세요.
        </div>
      )}

      <div className="body-row">
        <div className="sidebar">
          <NavLink to="/" end className={linkClass}><Home size={17} />&nbsp;대시보드</NavLink>
          <NavLink to="/system-health" className={linkClass}><Activity size={17} />&nbsp;실시간 모니터링</NavLink>
          <NavLink to="/event-log" className={linkClass}><ClipboardList size={17} />&nbsp;로그/녹화조회</NavLink>
          <button className="nav-item" onClick={() => setSettingsOpen(true)}><Ruler size={17} />&nbsp;설정</button>

          <div className="sidebar-devices">
            <div className="sidebar-devices-label">연결 장비</div>
            <div className="device-row"><span className="name">D435i 카메라</span><span className="device-status"><span className="d"></span>정상</span></div>
            <div className="device-row"><span className="name">모노카메라</span><span className="device-status"><span className="d"></span>정상</span></div>
            <div className="device-row"><span className="name">Jetson Orin Nano</span><span className={`device-status ${rosUp ? '' : 'down'}`}><span className="d"></span>{rosUp ? '정상' : '끊김'}</span></div>
            <div className="device-row"><span className="name">ROS 2</span><span className={`device-status ${rosUp ? '' : 'down'}`}><span className="d"></span>{rosUp ? '정상' : '끊김'}</span></div>
            <div className="device-row"><span className="name">MCU</span><span className="device-status"><span className="d"></span>정상</span></div>
          </div>
        </div>

        <div className="main">
          <Routes>
            <Route path="/" element={<Dashboard state={state} states={STATES} distance={distance} helmetOk={helmetOk} doorLocked={doorLocked} conveyorState={conveyorState} fireActive={fireActive} />} />
            <Route path="/system-health" element={<SystemHealth />} />
            <Route path="/event-log" element={<EventLog events={events} storagePct={storagePct} dbQuotaPct={settings.dbQuotaPct} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>

      <div className="controls">
        <div className="controls-label">시뮬레이션 · 아직 Jetson/카메라가 없어 수동으로 상태를 테스트합니다</div>
        <div className="btn-row">
          <button onClick={simulateApproach}>사람 접근 감지</button>
          <button onClick={clearDanger}>위험 해제</button>
          <button className="primary" onClick={forceStop}>강제정지 트리거</button>
          <button onClick={recover} disabled={state !== 'STOP'}>복구 확인</button>
          <span className="btn-sep" />
          <button onClick={toggleHelmet}>{helmetOk ? '헬멧 미착용 감지' : '안전모 착용 확인'}</button>
          <button onClick={simulateConveyorJam} disabled={conveyorState !== 'OK'}>컨베이어 이상감지</button>
          <button onClick={resetConveyor} disabled={conveyorState === 'OK'}>컨베이어 정상화</button>
          <span className="btn-sep" />
          {!fireActive
            ? <button onClick={simulateFire}>화재 감지</button>
            : <button className="primary" onClick={resolveFire}>상황종료 (화재)</button>}
          <button onClick={toggleRos}>{rosUp ? 'Jetson/ROS2 연결 끊기' : 'Jetson/ROS2 연결 복구'}</button>
        </div>
      </div>

      {settingsOpen && (
        <SettingsModal settings={settings} onChange={handleSettingsChange} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
