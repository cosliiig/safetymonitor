import { useState } from 'react';
import { User, Rows3, Flame, HardHat, Play, HardDrive } from 'lucide-react';

const TYPE_META = {
  HUMAN: { label: '로봇 접근', icon: User, color: 'var(--red)' },
  CONVEYOR: { label: '컨베이어 이상', icon: Rows3, color: 'var(--amber)' },
  FIRE: { label: '화재', icon: Flame, color: 'var(--red)' },
  HELMET: { label: '헬멧 미착용', icon: HardHat, color: 'var(--amber)' },
};

const FILTERS = [
  { key: 'ALL', label: '전체' },
  { key: 'HUMAN', label: '로봇 접근' },
  { key: 'CONVEYOR', label: '컨베이어' },
  { key: 'FIRE', label: '화재' },
  { key: 'HELMET', label: '헬멧' },
];

export default function EventLog({ events, storagePct, dbQuotaPct }) {
  const [filter, setFilter] = useState('ALL');
  const rows = filter === 'ALL' ? events : events.filter(e => e.type === filter);

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">녹화기록 / 사고기록</div>
      </div>

      <div className="storage-gauge">
        <HardDrive size={15} style={{ color: 'var(--dim)' }} />
        <div className="storage-track"><div className="storage-fill" style={{ width: `${Math.min(100, storagePct)}%`, background: storagePct > 85 ? 'var(--red)' : storagePct > 60 ? 'var(--amber)' : 'var(--blue)' }}></div></div>
        <span className="mono" style={{ fontSize: 12, color: 'var(--dim)' }}>{storagePct.toFixed(1)}% / 할당 {dbQuotaPct}% 중</span>
      </div>

      <div className="filter-row">
        {FILTERS.map(f => (
          <button key={f.key} className={filter === f.key ? 'primary' : ''} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      {rows.length === 0 && <div className="note">해당 조건의 기록이 없습니다.</div>}

      <div className="rec-list">
        {rows.map(e => {
          const meta = TYPE_META[e.type] || TYPE_META.HUMAN;
          const Icon = meta.icon;
          return (
            <div className="rec-row" key={e.id}>
              <div className="rec-thumb" style={{ background: meta.color }}>
                <Play size={16} />
              </div>
              <div className="rec-body">
                <div className="rec-title"><Icon size={13} style={{ verticalAlign: -2, marginRight: 5, color: meta.color }} />{e.title}</div>
                <div className="rec-detail">{e.detail}</div>
              </div>
              <div className="rec-meta">
                <div className="mono">{e.time}</div>
                <div className="rec-dur">{e.duration || '—'}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="note">SSD 전체 용량의 {dbQuotaPct}%가 이벤트 DB에 할당되며, 초과 시 큐/스택 알고리즘으로 오래된 영상부터 자동 삭제됩니다.</div>
    </div>
  );
}
