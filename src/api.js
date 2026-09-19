// 백엔드(FastAPI)와 통신하는 함수들을 한 곳에 모아둔 파일.
// 나중에 백엔드 주소가 바뀌면(예: 젯슨 IP) 여기 BASE_URL만 고치면 됩니다.

export const BASE_URL = "http://localhost:8000";

async function request(path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = `요청 실패 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) detail = data.detail;
    } catch {
      // 응답이 JSON이 아닐 수도 있음 - 무시하고 기본 메시지 사용
    }
    throw new Error(detail);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  login: (username, password) =>
    request("/api/auth/login", { method: "POST", body: { username, password } }),

  logout: (token) => request("/api/auth/logout", { method: "POST", token }),

  getEvents: (token) => request("/api/events", { token }),

  createEvent: (token, { type, title, detail, duration }) =>
    request("/api/events", { method: "POST", token, body: { type, title, detail, duration } }),

  markAllRead: (token) => request("/api/events/mark-all-read", { method: "POST", token }),

  getSettings: (token) => request("/api/settings", { token }),

  updateSettings: (token, partialSettings) =>
    request("/api/settings", { method: "PUT", token, body: partialSettings }),

  pushStatus: (token, statusPayload) =>
    request("/api/status", { method: "POST", token, body: statusPayload }),
};

// 실시간 상태/이벤트 수신용 웹소켓 연결.
// onMessage(msg) 로 { kind: 'event' | 'settings' | 'status', ... } 형태의 메시지가 옵니다.
export function connectStatusSocket(onMessage) {
  const wsUrl = BASE_URL.replace(/^http/, "ws") + "/ws/status";
  const socket = new WebSocket(wsUrl);

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch {
      // 파싱 안 되는 메시지는 무시
    }
  };

  return socket;
}