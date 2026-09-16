"""
Robot Safety 프로젝트 백엔드 (FastAPI)

지금은 젯슨이 없어서 "실제 하드웨어에서 오는 데이터" 대신
이 서버가 로그인/이벤트저장/설정/실시간상태를 대신 처리해줍니다.
나중에 젯슨이 도착하면, 지금 시뮬레이션 버튼이 호출하는 것과 똑같은 API를
젯슨 쪽 코드가 호출하도록만 바꾸면 됩니다. (프론트엔드는 거의 안 바꿔도 됨)

실행 방법 (README.md 참고):
    uvicorn app.main:app --reload --port 8000

실행 후 http://localhost:8000/docs 로 들어가면
Swagger UI에서 모든 API를 클릭 몇 번으로 직접 테스트해볼 수 있습니다.
"""
import secrets
from datetime import datetime, timezone
from typing import List

from fastapi import FastAPI, HTTPException, Depends, Header, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from . import database
from .schemas import (
    LoginRequest, LoginResponse,
    EventCreate, EventOut,
    SettingsOut, SettingsUpdate,
    StatusUpdate,
)

app = FastAPI(title="Robot Safety API")

# 프론트엔드(Vite 개발서버, 기본 포트 5173)에서 이 API를 호출할 수 있도록 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    database.init_db()


# ---------------------------------------------------------------------------
# 아주 간단한 로그인 토큰 저장소 (서버가 꺼지면 초기화됨 - 데모 수준)
# ---------------------------------------------------------------------------
_active_tokens: dict[str, str] = {}   # token -> username


def require_login(authorization: str | None = Header(default=None)) -> str:
    """
    프론트엔드가 요청 헤더에 Authorization: Bearer <token> 을 담아 보내면
    로그인한 사용자인지 확인해주는 함수.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    token = authorization.removeprefix("Bearer ").strip()
    username = _active_tokens.get(token)
    if not username:
        raise HTTPException(status_code=401, detail="토큰이 유효하지 않습니다. 다시 로그인해주세요.")
    return username


# ---------------------------------------------------------------------------
# 로그인
# ---------------------------------------------------------------------------
@app.post("/api/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    with database.get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ?", (payload.username,)
        ).fetchone()

    if not row or row["password_hash"] != database.hash_password(payload.password):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")

    token = secrets.token_hex(16)
    _active_tokens[token] = payload.username
    return LoginResponse(token=token, username=payload.username)


@app.post("/api/auth/logout")
def logout(username: str = Depends(require_login), authorization: str = Header(default="")):
    token = authorization.removeprefix("Bearer ").strip()
    _active_tokens.pop(token, None)
    return {"ok": True}


# ---------------------------------------------------------------------------
# 이벤트 (사고/알림 기록)
# ---------------------------------------------------------------------------
def _row_to_event(row) -> EventOut:
    return EventOut(
        id=row["id"],
        type=row["type"],
        title=row["title"],
        detail=row["detail"],
        duration=row["duration"],
        time=row["time"],
        is_read=bool(row["is_read"]),
        video_path=row["video_path"],
    )


@app.get("/api/events", response_model=List[EventOut])
def list_events(_: str = Depends(require_login)):
    with database.get_conn() as conn:
        rows = conn.execute("SELECT * FROM events ORDER BY id DESC").fetchall()
    return [_row_to_event(r) for r in rows]


@app.post("/api/events", response_model=EventOut)
async def create_event(payload: EventCreate, _: str = Depends(require_login)):
    now = datetime.now(timezone.utc).isoformat()
    with database.get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO events (type, title, detail, duration, time, is_read) VALUES (?, ?, ?, ?, ?, 0)",
            (payload.type, payload.title, payload.detail, payload.duration, now),
        )
        new_id = cur.lastrowid
        row = conn.execute("SELECT * FROM events WHERE id = ?", (new_id,)).fetchone()

    event = _row_to_event(row)
    await _broadcast({"kind": "event", "event": event.model_dump()})
    return event


@app.post("/api/events/mark-all-read")
def mark_all_read(_: str = Depends(require_login)):
    with database.get_conn() as conn:
        conn.execute("UPDATE events SET is_read = 1")
    return {"ok": True}


# ---------------------------------------------------------------------------
# 구역/임계값 설정
# ---------------------------------------------------------------------------
def _settings_row_to_out(row) -> SettingsOut:
    return SettingsOut(
        safe_distance=row["safe_distance"],
        escalate_ms=row["escalate_ms"],
        conveyor_timeout_ms=row["conveyor_timeout_ms"],
        pre_roll_sec=row["pre_roll_sec"],
        post_roll_sec=row["post_roll_sec"],
        db_quota_pct=row["db_quota_pct"],
    )


@app.get("/api/settings", response_model=SettingsOut)
def get_settings(_: str = Depends(require_login)):
    with database.get_conn() as conn:
        row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
    return _settings_row_to_out(row)


@app.put("/api/settings", response_model=SettingsOut)
async def update_settings(payload: SettingsUpdate, _: str = Depends(require_login)):
    fields = payload.model_dump(exclude_none=True)
    if fields:
        set_clause = ", ".join(f"{k} = ?" for k in fields.keys())
        with database.get_conn() as conn:
            conn.execute(f"UPDATE settings SET {set_clause} WHERE id = 1", tuple(fields.values()))
            row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
    else:
        with database.get_conn() as conn:
            row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()

    settings_out = _settings_row_to_out(row)
    await _broadcast({"kind": "settings", "settings": settings_out.model_dump()})
    return settings_out


# ---------------------------------------------------------------------------
# 실시간 상태 (웹소켓) - 지금은 시뮬레이션 버튼이, 나중에는 젯슨이 호출
# ---------------------------------------------------------------------------
_ws_clients: List[WebSocket] = []


async def _broadcast(message: dict):
    dead = []
    for ws in _ws_clients:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_clients.remove(ws)


@app.websocket("/ws/status")
async def ws_status(websocket: WebSocket):
    await websocket.accept()
    _ws_clients.append(websocket)
    try:
        while True:
            # 클라이언트가 보내는 메시지는 지금은 사용하지 않지만,
            # 연결이 끊겼는지 감지하려면 계속 받아둬야 합니다.
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in _ws_clients:
            _ws_clients.remove(websocket)


@app.post("/api/status")
async def push_status(payload: StatusUpdate, _: str = Depends(require_login)):
    """
    지금은 프론트엔드의 '시뮬레이션 버튼'이 호출.
    나중에는 젯슨이 실제 감지값을 여기로 보내면 됩니다.
    받은 즉시 연결된 모든 화면(웹소켓)으로 그대로 뿌려줍니다.
    """
    await _broadcast({"kind": "status", "status": payload.model_dump(exclude_none=True)})
    return {"ok": True}


@app.get("/")
def health_check():
    return {"ok": True, "service": "robot-safety-backend"}
