import { useState, useEffect, useRef } from 'react';
import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { Home, Activity, Settings, ClipboardList, Shield } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import SystemHealth from './pages/SystemHealth';
import EventLog from './pages/EventLog.jsx';

const STATES = {
  NORMAL:    { name:'정상', hint:'현재 감지된 위험 요소가 없습니다.', box:'#e7f9f0', icon:'#12b76a', sys:'시스템 정상', sysDot:'#37e08a' },
  WARNING:   { name:'경고', hint:'위험 신호 감지 — 지속시간을 확인하는 중입니다.', box:'#fdf3de', icon:'#e08e0b', sys:'경고', sysDot:'#e08e0b' },
  EMERGENCY: { name:'비상', hint:'위험상황 확정 — 강제정지로 전환합니다.', box:'#fde8ea', icon:'#e63946', sys:'비상', sysDot:'#e63946' },
  STOP:      { name:'강제정지', hint:'MCU가 독립적으로 전원을 차단했습니다. 복구 확인이 필요합니다.', box:'#fde8ea', icon:'#e63946', sys:'강제정지', sysDot:'#e63946' },
  RECOVERY:  { name:'복구', hint:'안전 조건을 확인하고 정상 복귀를 준비 중입니다.', box:'#eaf1ff', icon:'#2f5fdb', sys:'복구 중', sysDot:'#2f5fdb' },
};

export default function App() {
  const [state, setState] = useState('NORMAL');
  const [distance, setDistance] = useState(1.82);
  const [rosUp, setRosUp] = useState(true);
  const [clock, setClock] = useState('--:--:--');

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const escalateTimer = useRef(null);

  useEffect(() => {
    const pad = n => (n < 10 ? '0' + n : '' + n);
    const tick = () => {
      const d = new Date();
      setClock(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  function evaluateRisk() {
    if (stateRef.current === 'NORMAL') {
      setState('WARNING');
      clearTimeout(escalateTimer.current);
      escalateTimer.current = setTimeout(() => {
        if (stateRef.current === 'WARNING') {
          setState('EMERGENCY');
          setTimeout(() => { if (stateRef.current === 'EMERGENCY') setState('STOP'); }, 500);
        }
      }, 2500);
    }
  }

  function simulateApproach() { setDistance(0.8); evaluateRisk(); }
  function simulateFire() { evaluateRisk(); }
  function clearDanger() {
    setDistance(1.82);
    if (stateRef.current === 'WARNING') { clearTimeout(escalateTimer.current); setState('NORMAL'); }
  }
  function forceStop() { clearTimeout(escalateTimer.current); setState('STOP'); }
  function recover() {
    if (stateRef.current !== 'STOP') return;
    setState('RECOVERY');
    setTimeout(() => { if (stateRef.current === 'RECOVERY') { setDistance(1.82); setState('NORMAL'); } }, 1500);
  }
  function toggleRos() { setRosUp(v => !v); }

  const s = STATES[state];
  const linkClass = ({ isActive }) => 'nav-item' + (isActive ? ' active' : '');

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
            <span className="sys-dot" style={{ background: rosUp ? s.sysDot : '#98a2b3' }}></span>
            {rosUp ? s.sys : '통신두절 · MCU 단독'}
          </div>
          <div className="mono">{clock}</div>
        </div>
      </div>

      <div className="body-row">
        <div className="sidebar">
          <NavLink to="/" end className={linkClass}><Home size={17} />&nbsp;대시보드</NavLink>
          <NavLink to="/system-health" className={linkClass}><Activity size={17} />&nbsp;실시간 모니터링</NavLink>
          <NavLink to="/event-log" className={linkClass}><ClipboardList size={17} />&nbsp;로그 조회</NavLink>
          <NavLink to="/system-health" className={linkClass}><Settings size={17} />&nbsp;시스템 설정</NavLink>

          <div className="sidebar-devices">
            <div className="sidebar-devices-label">연결 장비</div>
            <div className="device-row"><span className="name">D435i 카메라</span><span className="device-status"><span className="d"></span>정상</span></div>
            <div className="device-row"><span className="name">Jetson Orin Nano</span><span className={`device-status ${rosUp ? '' : 'down'}`}><span className="d"></span>{rosUp ? '정상' : '끊김'}</span></div>
            <div className="device-row"><span className="name">ROS 2</span><span className={`device-status ${rosUp ? '' : 'down'}`}><span className="d"></span>{rosUp ? '정상' : '끊김'}</span></div>
            <div className="device-row"><span className="name">MCU</span><span className="device-status"><span className="d"></span>정상</span></div>
          </div>
        </div>

        <div className="main">
          <Routes>
            <Route path="/" element={<Dashboard state={state} states={STATES} distance={distance} />} />
            <Route path="/system-health" element={<SystemHealth />} />
            <Route path="/event-log" element={<EventLog />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>

      <div className="controls">
        <div className="controls-label">시뮬레이션 · 아직 Jetson/카메라가 없어 수동으로 상태를 테스트합니다</div>
        <div className="btn-row">
          <button onClick={simulateApproach}>사람 접근 감지</button>
          <button onClick={simulateFire}>화재 감지</button>
          <button onClick={clearDanger}>위험 해제</button>
          <button className="primary" onClick={forceStop}>강제정지 트리거</button>
          <button onClick={recover} disabled={state !== 'STOP'}>복구 확인</button>
          <button onClick={toggleRos}>{rosUp ? 'Jetson/ROS2 연결 끊기' : 'Jetson/ROS2 연결 복구'}</button>
        </div>
      </div>
    </div>
  );
}