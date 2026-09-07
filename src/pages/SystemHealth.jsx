const DEVICES = ['Intel RealSense D435i', 'Jetson Orin Nano', 'ROS 2', 'MCU Safety Controller'];

export default function SystemHealth() {
  return (
    <div className="card">
      <div className="card-head"><div className="card-title">장치 온라인 상태</div></div>
      {DEVICES.map(name => (
        <div className="comm-row" key={name}>
          <span className="dot"></span>
          <span className="lbl">{name}</span>
          <span className="mono">ONLINE</span>
        </div>
      ))}
      <div className="note">아직 실제 하드웨어가 연결되지 않아 임시 데이터입니다. Jetson·D435i 입고 후 실시간 데이터로 교체 예정입니다.</div>
    </div>
  );
}