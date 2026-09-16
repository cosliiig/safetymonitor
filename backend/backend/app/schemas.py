"""
요청/응답 데이터의 모양(타입)을 정의하는 곳.
프론트엔드(React)에서 보내는 JSON이 이 모양과 다르면 FastAPI가 자동으로 에러를 내줘서
디버깅이 쉬워집니다.
"""
from pydantic import BaseModel
from typing import Optional


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str


class EventCreate(BaseModel):
    type: str          # HUMAN | CONVEYOR | FIRE | HELMET
    title: str
    detail: Optional[str] = None
    duration: Optional[str] = None


class EventOut(BaseModel):
    id: int
    type: str
    title: str
    detail: Optional[str] = None
    duration: Optional[str] = None
    time: str
    is_read: bool
    video_path: Optional[str] = None


class SettingsOut(BaseModel):
    safe_distance: float
    escalate_ms: int
    conveyor_timeout_ms: int
    pre_roll_sec: int
    post_roll_sec: int
    db_quota_pct: int


class SettingsUpdate(BaseModel):
    safe_distance: Optional[float] = None
    escalate_ms: Optional[int] = None
    conveyor_timeout_ms: Optional[int] = None
    pre_roll_sec: Optional[int] = None
    post_roll_sec: Optional[int] = None
    db_quota_pct: Optional[int] = None


class StatusUpdate(BaseModel):
    """
    나중에 젯슨이 실시간 상태를 보낼 때 쓸 형식.
    지금은 시뮬레이션 버튼이 이 형식으로 백엔드에 보내고,
    백엔드가 다시 웹소켓으로 모든 화면에 뿌려줍니다.
    """
    state: str                 # NORMAL | WARNING | EMERGENCY | STOP | RECOVERY
    distance: Optional[float] = None
    helmet_ok: Optional[bool] = None
    door_locked: Optional[bool] = None
    conveyor_state: Optional[str] = None   # OK | PENDING | JAM
    fire_active: Optional[bool] = None
