export default function SystemHealth({ jetsonLive }) {
  const DEVICES = ['Intel RealSense D435i', '모노카메라 (헬멧 감지)', 'Jetson Orin Nano', 'ROS 2', 'MCU Safety Controller (시뮬레이션)'];
  return (
    <div className="card">
      <div className="card-head"><div className="card-title">장치 온라인 상태</div></div>
      {DEVICES.map(name => (
        <div className="comm-row" key={name}>
          <span className="dot" style={{ background: jetsonLive ? undefined : '#e63946' }}></span>
          <span className="lbl">{name}</span>
          <span className="mono" style={{ color: jetsonLive ? undefined : 'var(--red)' }}>{jetsonLive ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
      ))}
      <div className="note">
        {jetsonLive
          ? '젯슨에서 최근 3초 이내에 상태를 수신했습니다. 실시간 연동 중입니다.'
          : '젯슨으로부터 3초 이상 데이터가 없습니다 — 네트워크 연결 또는 backend_bridge_node 실행 상태를 확인하세요.'}
      </div>
    </div>
  );
}