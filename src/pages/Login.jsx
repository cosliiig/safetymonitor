import { useState } from 'react';
import { Shield, Lock, User, AlertCircle } from 'lucide-react';

export default function Login({ onLogin }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  function submit(e) {
    e.preventDefault();
    if (!id.trim() || !pw.trim()) {
      setError('아이디와 비밀번호를 입력해주세요.');
      return;
    }
    // 데모용 인증: 실제 배포 시 백엔드 인증 API로 교체 예정
    if (id === 'admin' && pw === '1234') {
      setError('');
      onLogin(id);
    } else {
      setError('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><Shield size={26} /></div>
        <div className="login-title">ROBOT SAFETY</div>
        <div className="login-sub">뎁스 카메라 기반 작업자 접근 감지 로봇 안전제어 시스템</div>

        <label className="login-field">
          <User size={16} />
          <input
            type="text"
            placeholder="관리자 아이디"
            value={id}
            onChange={e => setId(e.target.value)}
            autoFocus
          />
        </label>
        <label className="login-field">
          <Lock size={16} />
          <input
            type="password"
            placeholder="비밀번호"
            value={pw}
            onChange={e => setPw(e.target.value)}
          />
        </label>

        {error && <div className="login-error"><AlertCircle size={14} />{error}</div>}

        <button type="submit" className="login-submit">로그인</button>
        <div className="login-hint">데모 계정 — 아이디 admin / 비밀번호 1234</div>
      </form>
    </div>
  );
}
