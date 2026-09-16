import { useState } from 'react';
import { Shield, Lock, User, AlertCircle } from 'lucide-react';
import { api } from '../api';

export default function Login({ onLogin }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!id.trim() || !pw.trim()) {
      setError('아이디와 비밀번호를 입력해주세요.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      // 백엔드에 실제로 로그인 요청을 보냄 (더 이상 하드코딩 아님)
      const { token, username } = await api.login(id, pw);
      onLogin({ token, username });
    } catch (err) {
      // 백엔드가 꺼져있으면 fetch 자체가 실패하면서 err.message가
      // "Failed to fetch" 같은 걸로 뜸 -> 이 경우도 알려줌
      if (err.message === 'Failed to fetch') {
        setError('백엔드 서버에 연결할 수 없습니다. (uvicorn 서버가 켜져있는지 확인하세요)');
      } else {
        setError(err.message || '로그인에 실패했습니다.');
      }
    } finally {
      setLoading(false);
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

        <button type="submit" className="login-submit" disabled={loading}>
          {loading ? '로그인 중...' : '로그인'}
        </button>
        <div className="login-hint">데모 계정 — 아이디 admin / 비밀번호 1234</div>
      </form>
    </div>
  );
}
