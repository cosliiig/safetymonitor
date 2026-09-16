"""
DB 관련 코드 모음.
지금은 SQLite(파일 하나로 동작하는 가벼운 DB)를 사용합니다.
나중에 젯슨에 그대로 옮겨서 돌려도 별도 설치 없이 바로 동작합니다.
"""
import sqlite3
import hashlib
import os
from datetime import datetime, timezone
from contextlib import contextmanager

# 이 DB 파일은 backend 폴더 안에 robot_safety.db 로 생성됩니다.
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "robot_safety.db")


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def hash_password(raw_password: str) -> str:
    # 데모/공모전용 간단한 해시. 실제 서비스라면 bcrypt 등을 쓰는 게 좋지만,
    # 지금 단계에서는 라이브러리 설치 문제 없이 바로 돌아가는 걸 우선했습니다.
    salted = "robot-safety-salt::" + raw_password
    return hashlib.sha256(salted.encode("utf-8")).hexdigest()


def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,           -- HUMAN | CONVEYOR | FIRE | HELMET
                title TEXT NOT NULL,
                detail TEXT,
                duration TEXT,
                time TEXT NOT NULL,           -- ISO 문자열
                is_read INTEGER NOT NULL DEFAULT 0,
                video_path TEXT               -- 나중에 녹화 파일 경로 (지금은 비워둠)
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),  -- 설정은 한 행만 존재
                safe_distance REAL NOT NULL DEFAULT 1.20,
                escalate_ms INTEGER NOT NULL DEFAULT 2500,
                conveyor_timeout_ms INTEGER NOT NULL DEFAULT 2000,
                pre_roll_sec INTEGER NOT NULL DEFAULT 3,
                post_roll_sec INTEGER NOT NULL DEFAULT 5,
                db_quota_pct INTEGER NOT NULL DEFAULT 50
            )
        """)

        # 관리자 데모 계정 시딩 (admin / 1234) - 프론트엔드의 하드코딩을 대체
        existing = conn.execute("SELECT 1 FROM users WHERE username = ?", ("admin",)).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                ("admin", hash_password("1234")),
            )

        # 설정 기본값 시딩
        existing_settings = conn.execute("SELECT 1 FROM settings WHERE id = 1").fetchone()
        if not existing_settings:
            conn.execute("INSERT INTO settings (id) VALUES (1)")

        # 이벤트 목록이 비어있으면 데모용 예시 2개 시딩 (프론트엔드 초기 화면과 동일하게)
        existing_events = conn.execute("SELECT COUNT(*) as c FROM events").fetchone()
        if existing_events["c"] == 0:
            now = datetime.now(timezone.utc).isoformat()
            conn.execute(
                "INSERT INTO events (type, title, detail, duration, time, is_read) VALUES (?, ?, ?, ?, ?, 1)",
                ("HUMAN", "로봇 접근 감지 — 강제정지", "작업자 0.92m 접근, ISO 13855 임계값 이하로 로봇 정지", "3s+5s", now),
            )
            conn.execute(
                "INSERT INTO events (type, title, detail, duration, time, is_read) VALUES (?, ?, ?, ?, ?, 1)",
                ("HELMET", "안전모 미착용 감지", "출입구 모노카메라 - 미착용 확인, 출입문 잠금", "2s", now),
            )
