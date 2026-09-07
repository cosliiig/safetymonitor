const EVENTS = [
  { time: '2026-09-07 14:21:03', cause: 'HUMAN', distance: '0.92 m', helmet: 'DETECTED', action: 'ROBOT STOP' },
  { time: '2026-09-07 11:05:41', cause: 'HUMAN', distance: '1.10 m', helmet: 'DETECTED', action: 'ROBOT STOP' },
];

export default function EventLog() {
  return (
    <div className="card">
      <div className="card-head"><div className="card-title">사고기록 (샘플 데이터)</div></div>
      <table className="log-table">
        <thead>
          <tr><th>발생시각</th><th>원인</th><th>이격거리</th><th>안전모</th><th>조치</th></tr>
        </thead>
        <tbody>
          {EVENTS.map((e, i) => (
            <tr key={i}>
              <td className="mono">{e.time}</td>
              <td>{e.cause}</td>
              <td className="mono">{e.distance}</td>
              <td>{e.helmet}</td>
              <td>{e.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">다음 단계에서 영상 썸네일 + 저장공간 게이지를 추가할 예정입니다.</div>
    </div>
  );
}