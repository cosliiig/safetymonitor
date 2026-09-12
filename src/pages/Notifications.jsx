import { Bell, User, Rows3, Flame, HardHat, CheckCheck } from 'lucide-react';

const ICONS = { HUMAN: User, CONVEYOR: Rows3, FIRE: Flame, HELMET: HardHat };
const COLORS = { HUMAN: 'var(--red)', CONVEYOR: 'var(--amber)', FIRE: 'var(--red)', HELMET: 'var(--amber)' };

export default function Notifications({ events, onMarkAllRead }) {
  const unread = events.filter(e => !e.read).length;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-head-left"><div className="icon-badge"><Bell size={16} /></div><div className="card-title">알림</div></div>
        <div className="card-head-left">
          {unread > 0 && <div className="pill live">읽지 않음 {unread}</div>}
          <button onClick={onMarkAllRead} disabled={unread === 0}><CheckCheck size={14} style={{ marginRight: 4, verticalAlign: -2 }} />모두 읽음</button>
        </div>
      </div>

      {events.length === 0 && <div className="note">표시할 알림이 없습니다.</div>}

      <div className="notif-list">
        {events.map(ev => {
          const Icon = ICONS[ev.type] || Bell;
          return (
            <div className={`notif-row ${ev.read ? '' : 'unread'}`} key={ev.id}>
              <div className="notif-icon" style={{ background: COLORS[ev.type] || 'var(--dim-2)' }}><Icon size={16} /></div>
              <div className="notif-body">
                <div className="notif-title">{ev.title}</div>
                <div className="notif-detail">{ev.detail}</div>
              </div>
              <div className="notif-time mono">{ev.time}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
