#!/usr/bin/env python3
"""
산업안전 모니터링 시스템 - 로컬 서버 (개요서 기준 구현)

개요서 요구사항과 맞춘 부분:
  - "외부 서버나 인터넷 연결 없이" -> 클라우드/외부 API 없음. 파이썬 표준 라이브러리만 사용
    (설치 필요한 패키지 0개, pip install 불필요)
  - "Jetson 내부의 로컬 데이터베이스와 SSD에 저장" -> 이 파일과 같은 폴더의 data.db(SQLite)와
    recordings 폴더에 저장. 어떤 장비(라즈베리파이/젯슨/PC 무엇이든)에서 돌려도 동일하게 동작
  - "발생 시간, 정지 원인, 작업자와 로봇 사이의 거리, 안전모 인식 결과" -> events 테이블에
    그대로 기록
  - "저장공간이 일정 기준을 넘으면 가장 오래된 영상부터 한 개씩 삭제하는 순환형 큐 방식"
    -> enforce_fifo_storage_limit() 함수로 구현 (STORAGE_LIMIT_GB 기준)

아직 실제로 안 붙은 부분 (하드웨어 미구매 상태라 스텁으로 남겨둠, TODO 표시):
  - RealSense D455 / 모노캠에서 실제 사람·안전모 인식 결과를 읽어오는 부분
  - Arduino로 서보모터/로봇팔/컨베이어에 실제 명령을 보내는 부분
  - 실제 이벤트 영상 파일 저장 (지금은 메타데이터만 기록)

실행 방법: index.html과 같은 폴더에 이 파일을 두고
    python server.py     (윈도우)
    python3 server.py    (Mac/Linux)
"""

import hashlib
import json
import os
import random
import socket
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = BASE_DIR
DB_PATH = os.path.join(BASE_DIR, "data.db")
RECORDINGS_DIR = os.path.join(BASE_DIR, "recordings")
STORAGE_LIMIT_GB = 16  # 개요서 기준 저장공간 상한

SESSION_TTL = 90  # QR 세션 유효시간(초)

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
}


# ==================== DB ====================

import sqlite3


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def hash_password(password, salt):
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()


def init_db():
    os.makedirs(RECORDINGS_DIR, exist_ok=True)
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            salt TEXT NOT NULL,
            password_hash TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            occurred_at REAL NOT NULL,
            distance_m REAL,
            noise_db REAL,
            helmet_ok INTEGER,
            video_path TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS area_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            door_open_seconds INTEGER NOT NULL DEFAULT 5,
            stop_distance_m REAL NOT NULL DEFAULT 1.0,
            resume_delay_seconds INTEGER NOT NULL DEFAULT 3,
            noise_threshold_db INTEGER NOT NULL DEFAULT 50
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS login_sessions (
            token TEXT PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'pending',
            admin_id TEXT,
            created_at REAL NOT NULL,
            failed_attempts INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.commit()

    # 기존에 만들어져 있던 data.db(구버전 스키마)에는 failed_attempts 컬럼이 없을 수 있으므로
    # 있으면 통과, 없으면 추가합니다. (신규 설치에서는 위 CREATE TABLE에 이미 포함되어 있어 그냥 지나감)
    try:
        cur.execute("ALTER TABLE login_sessions ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0")
        conn.commit()
    except sqlite3.OperationalError:
        pass

    cur.execute("SELECT COUNT(*) AS c FROM users")
    if cur.fetchone()["c"] == 0:
        for user_id, name in [("admin1", "김관리"), ("admin2", "이안전")]:
            salt = uuid.uuid4().hex
            cur.execute(
                "INSERT INTO users (id, name, salt, password_hash) VALUES (?, ?, ?, ?)",
                (user_id, name, salt, hash_password("admin1234", salt))
            )

    cur.execute("SELECT COUNT(*) AS c FROM area_settings")
    if cur.fetchone()["c"] == 0:
        cur.execute(
            "INSERT INTO area_settings (id, door_open_seconds, stop_distance_m, resume_delay_seconds, noise_threshold_db) "
            "VALUES (1, 5, 1.0, 3, 50)"
        )

    cur.execute("SELECT COUNT(*) AS c FROM events")
    if cur.fetchone()["c"] == 0:
        now = time.time()
        seed = [
            ("proximity", "사람 접근 감지 · 로봇 정지", now - 3600, 0.8, None, None),
            ("helmet", "안전모 미착용 · 출입 차단", now - 5400, None, None, 0),
            ("noise", "충돌음 감지", now - 90000, None, 62, None),
        ]
        for type_, title, occurred_at, dist, noise, helmet_ok in seed:
            cur.execute(
                "INSERT INTO events (type, title, occurred_at, distance_m, noise_db, helmet_ok, video_path) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (type_, title, occurred_at, dist, noise, helmet_ok, None)
            )

    conn.commit()
    conn.close()


def get_storage_usage_gb():
    total = 0
    if os.path.isdir(RECORDINGS_DIR):
        for root, _dirs, files in os.walk(RECORDINGS_DIR):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(root, f))
                except OSError:
                    pass
    return round(total / (1024 ** 3), 2)


def enforce_fifo_storage_limit():
    """개요서: 저장공간 초과시 가장 오래된 영상부터 하나씩 삭제 (순환형 큐)."""
    conn = get_conn()
    cur = conn.cursor()
    while get_storage_usage_gb() > STORAGE_LIMIT_GB:
        cur.execute("SELECT id, video_path FROM events WHERE video_path IS NOT NULL ORDER BY occurred_at ASC LIMIT 1")
        row = cur.fetchone()
        if not row:
            break
        if row["video_path"] and os.path.exists(row["video_path"]):
            os.remove(row["video_path"])
        cur.execute("UPDATE events SET video_path = NULL WHERE id = ?", (row["id"],))
        conn.commit()
    conn.close()


# ==================== 하드웨어 연동 지점 (아직 미구매/미연결 - 스텁) ====================

def get_latest_sensor_status():
    # TODO: 실제 카메라/센서 붙으면 RealSense D455 + 모노캠 추론 결과로 교체
    distance = round(2.0 + random.uniform(-0.4, 0.4), 2)
    noise = round(38 + random.uniform(-4, 4), 1)
    state = "stop" if distance < 1.0 else ("warn" if distance < 2.0 else "ok")

    # 개요서: 마이크에 "설정값(구역 설정의 소음 임계값) 이상"의 큰 소리가 입력되면
    # 이벤트 녹화를 시작함 - 즉 소음은 항상 표시하는 값이 아니라, 임계값을 넘었는지가 핵심입니다.
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT noise_threshold_db FROM area_settings WHERE id=1")
        row = cur.fetchone()
        noise_threshold = row["noise_threshold_db"] if row else 50
    finally:
        conn.close()
    noise_alert = noise >= noise_threshold

    return {
        "state": state,
        "distance": distance,
        "helmet": True,
        "noise": noise,
        "noise_threshold": noise_threshold,
        "noise_alert": noise_alert,
        "door": "closed",
        "robot": "stopped" if state == "stop" else "running"
    }


def send_area_setting_to_device(settings):
    # TODO: 실제 장비 연결되면 UART/시리얼로 Arduino에 전송하는 코드로 교체
    print("[device] (테스트 모드) 구역 설정 전송:", settings)


# ==================== 로그인 (QR 세션) ====================

def ensure_session(conn, token):
    cur = conn.cursor()
    cur.execute("SELECT * FROM login_sessions WHERE token = ?", (token,))
    row = cur.fetchone()
    if row is None:
        cur.execute(
            "INSERT INTO login_sessions (token, status, admin_id, created_at) VALUES (?, 'pending', NULL, ?)",
            (token, time.time())
        )
        conn.commit()
        cur.execute("SELECT * FROM login_sessions WHERE token = ?", (token,))
        row = cur.fetchone()
    return row


def confirm_page_html(token):
    conn = get_conn()
    try:
        row = ensure_session(conn, token)
        if row["status"] == "approved":
            return "<html><body style='font-family:sans-serif;text-align:center;padding:40px;'>이미 로그인 처리된 코드입니다.</body></html>"
        if row["status"] == "locked":
            return "<html><body style='font-family:sans-serif;text-align:center;padding:40px;color:#c13030;'>비밀번호를 여러 번 틀려 이 코드는 잠겼습니다.<br>PC 화면에서 새로고침 후 다시 스캔하세요.</body></html>"
        if time.time() - row["created_at"] > SESSION_TTL:
            return "<html><body style='font-family:sans-serif;text-align:center;padding:40px;color:#c13030;'>코드가 만료되었습니다. PC 화면에서 새로고침 후 다시 스캔하세요.</body></html>"

        cur = conn.cursor()
        cur.execute("SELECT id, name FROM users ORDER BY name")
        options = "".join('<option value="{id}">{name}</option>'.format(id=r["id"], name=r["name"]) for r in cur.fetchall())

        return """<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>로그인</title>
<style>
body {{ font-family: -apple-system, 'Segoe UI', 'Noto Sans KR', sans-serif; background:#f4f5f7; margin:0; padding:24px 16px; }}
.card {{ max-width:340px; margin:40px auto; background:#fff; border:1px solid #e2e4e8; border-radius:10px; padding:24px 20px; }}
h1 {{ font-size:16px; margin:0 0 6px; }}
p {{ font-size:13px; color:#6b7280; margin:0 0 16px; }}
label {{ display:block; font-size:13px; color:#6b7280; margin-bottom:6px; }}
select, input {{ width:100%; height:40px; border:1px solid #e2e4e8; border-radius:8px; padding:0 12px; font-size:14px; margin-bottom:14px; box-sizing:border-box; }}
button {{ width:100%; height:42px; border:none; border-radius:8px; background:#2f6fed; color:#fff; font-size:14px; font-weight:600; }}
.err {{ color:#c13030; font-size:13px; margin:-8px 0 12px; display:none; }}
</style></head>
<body>
  <div class="card">
    <h1>산업안전 모니터링 시스템</h1>
    <p>본인 계정으로 로그인을 승인하세요.</p>
    <form id="f">
      <label for="admin">관리자</label>
      <select id="admin" name="admin_id">{options}</select>
      <label for="pw">비밀번호</label>
      <input id="pw" name="password" type="password" placeholder="비밀번호 입력" required>
      <p id="err" class="err">비밀번호가 올바르지 않습니다.</p>
      <button type="submit">로그인</button>
    </form>
  </div>
  <script>
    document.getElementById('f').addEventListener('submit', function (e) {{
      e.preventDefault();
      fetch('/api/login/approve', {{
        method: 'POST',
        headers: {{'Content-Type': 'application/json'}},
        body: JSON.stringify({{
          session: '{token}',
          admin_id: document.getElementById('admin').value,
          password: document.getElementById('pw').value
        }})
      }}).then(function (r) {{ return r.json(); }}).then(function (data) {{
        if (data.ok) {{
          document.body.innerHTML = '<div class="card"><h1>로그인되었습니다</h1><p>PC 화면을 확인하세요. 이 창은 닫아도 됩니다.</p></div>';
        }} else if (data.error === 'locked') {{
          document.body.innerHTML = '<div class="card"><h1 style="color:#c13030;">잠금 처리되었습니다</h1><p>비밀번호를 여러 번 틀려 이 코드는 더 이상 사용할 수 없습니다.<br>PC 화면에서 새로고침 후 다시 스캔하세요.</p></div>';
        }} else {{
          document.getElementById('err').style.display = 'block';
        }}
      }});
    }});
  </script>
</body></html>""".format(options=options, token=token)
    finally:
        conn.close()


def handle_login_status(token):
    conn = get_conn()
    try:
        row = ensure_session(conn, token)
        if row["status"] == "pending" and (time.time() - row["created_at"]) > SESSION_TTL:
            conn.execute("UPDATE login_sessions SET status='expired' WHERE token=?", (token,))
            conn.commit()
            return {"status": "expired"}
        if row["status"] == "approved":
            cur = conn.cursor()
            cur.execute("SELECT name FROM users WHERE id=?", (row["admin_id"],))
            u = cur.fetchone()
            return {"status": "approved", "admin_id": row["admin_id"], "admin_name": u["name"] if u else "알 수 없음"}
        return {"status": row["status"]}
    finally:
        conn.close()


MAX_LOGIN_ATTEMPTS = 5  # 이 횟수만큼 비밀번호를 틀리면 해당 QR 코드는 잠깁니다.


def handle_login_approve(body):
    token = body.get("session")
    admin_id = body.get("admin_id")
    password = body.get("password", "")
    if not token or not admin_id:
        return {"ok": False, "error": "invalid_request"}

    conn = get_conn()
    try:
        cur = conn.cursor()

        cur.execute("SELECT * FROM login_sessions WHERE token=?", (token,))
        session_row = cur.fetchone()
        if session_row is None or session_row["status"] != "pending":
            if session_row is not None and session_row["status"] == "locked":
                return {"ok": False, "error": "locked"}
            return {"ok": False, "error": "session_not_pending"}

        cur.execute("SELECT * FROM users WHERE id=?", (admin_id,))
        user = cur.fetchone()
        if user is None or hash_password(password, user["salt"]) != user["password_hash"]:
            # 틀린 시도 횟수를 세션 단위로 누적합니다. 한도를 넘으면 이 QR 코드(세션)를
            # 잠가서 더 이상 이 코드로는 비밀번호를 계속 시도할 수 없게 막습니다.
            attempts = session_row["failed_attempts"] + 1
            if attempts >= MAX_LOGIN_ATTEMPTS:
                cur.execute("UPDATE login_sessions SET failed_attempts=?, status='locked' WHERE token=?", (attempts, token))
                conn.commit()
                return {"ok": False, "error": "locked"}
            cur.execute("UPDATE login_sessions SET failed_attempts=? WHERE token=?", (attempts, token))
            conn.commit()
            return {"ok": False, "error": "bad_password"}

        cur.execute("UPDATE login_sessions SET status='approved', admin_id=? WHERE token=?", (admin_id, token))
        conn.commit()
        return {"ok": True, "admin_id": admin_id, "admin_name": user["name"]}
    finally:
        conn.close()


# ==================== 이벤트 / 저장공간 / 구역설정 ====================

def handle_events_list(query):
    type_filter = query.get("type", [None])[0]
    start = query.get("start", [None])[0]
    end = query.get("end", [None])[0]

    sql = "SELECT * FROM events WHERE 1=1"
    params = []
    if type_filter and type_filter != "all":
        sql += " AND type = ?"
        params.append(type_filter)
    if start:
        sql += " AND occurred_at >= ?"
        params.append(float(start))
    if end:
        sql += " AND occurred_at <= ?"
        params.append(float(end))
    sql += " ORDER BY occurred_at DESC"

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        events = []
        for r in cur.fetchall():
            meta = []
            if r["distance_m"] is not None:
                meta.append("거리 {}m".format(r["distance_m"]))
            if r["noise_db"] is not None:
                meta.append("{} dB".format(r["noise_db"]))
            events.append({
                "id": r["id"], "type": r["type"], "title": r["title"],
                "time": time.strftime("%Y-%m-%d %H:%M", time.localtime(r["occurred_at"])),
                "meta": " · ".join(meta), "has_video": bool(r["video_path"])
            })
        return events
    finally:
        conn.close()


def get_event_video_path(event_id):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT video_path FROM events WHERE id=?", (event_id,))
        row = cur.fetchone()
        if row and row["video_path"] and os.path.exists(row["video_path"]):
            return row["video_path"]
        return None
    finally:
        conn.close()


def handle_storage():
    return {"used_gb": get_storage_usage_gb(), "total_gb": STORAGE_LIMIT_GB}


def handle_area_get():
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM area_settings WHERE id=1")
        row = cur.fetchone()
        return {
            "doorOpenSeconds": row["door_open_seconds"],
            "stopDistanceM": row["stop_distance_m"],
            "resumeDelaySeconds": row["resume_delay_seconds"],
            "noiseThresholdDb": row["noise_threshold_db"]
        }
    finally:
        conn.close()


def handle_area_post(body):
    door_open = int(body.get("doorOpenSeconds", 5))
    stop_dist = float(body.get("stopDistanceM", 1.0))
    resume_delay = int(body.get("resumeDelaySeconds", 3))
    noise_threshold = int(body.get("noiseThresholdDb", 50))

    conn = get_conn()
    try:
        conn.execute(
            "UPDATE area_settings SET door_open_seconds=?, stop_distance_m=?, resume_delay_seconds=?, noise_threshold_db=? WHERE id=1",
            (door_open, stop_dist, resume_delay, noise_threshold)
        )
        conn.commit()
    finally:
        conn.close()

    send_area_setting_to_device({
        "doorOpenSeconds": door_open, "stopDistanceM": stop_dist,
        "resumeDelaySeconds": resume_delay, "noiseThresholdDb": noise_threshold
    })
    return {"ok": True}


def handle_change_password(body):
    admin_id = body.get("admin_id")
    current_password = body.get("current_password", "")
    new_password = body.get("new_password", "")

    if not admin_id or not new_password:
        return {"ok": False, "error": "invalid_request"}
    if len(new_password) < 4:
        return {"ok": False, "error": "new_password_too_short"}

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE id=?", (admin_id,))
        user = cur.fetchone()
        if user is None:
            return {"ok": False, "error": "unknown_admin"}
        if hash_password(current_password, user["salt"]) != user["password_hash"]:
            return {"ok": False, "error": "wrong_current_password"}

        new_salt = uuid.uuid4().hex
        cur.execute(
            "UPDATE users SET salt=?, password_hash=? WHERE id=?",
            (new_salt, hash_password(new_password, new_salt), admin_id)
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ==================== HTTP 서버 ====================

class Handler(BaseHTTPRequestHandler):
    server_version = "SafetyUIServer/2.0"

    def _json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _html(self, html, code=200):
        body = html.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path):
        ext = os.path.splitext(path)[1]
        mime = MIME_TYPES.get(ext, "application/octet-stream")
        with open(path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _static(self, url_path):
        if url_path == "/":
            url_path = "/index.html"
        safe_path = os.path.normpath(url_path).lstrip(os.sep)
        full_path = os.path.join(STATIC_DIR, safe_path)
        if not os.path.abspath(full_path).startswith(os.path.abspath(STATIC_DIR)):
            self._json({"error": "forbidden"}, 403)
            return
        if os.path.isfile(full_path):
            self._file(full_path)
        else:
            self._json({"error": "not_found", "path": url_path}, 404)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except ValueError:
            return {}

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        try:
            if path == "/login/confirm":
                self._html(confirm_page_html(query.get("session", [""])[0]))
                return
            if path == "/api/login/status":
                self._json(handle_login_status(query.get("session", [""])[0]))
                return
            if path == "/api/status":
                self._json(get_latest_sensor_status())
                return
            if path == "/api/events":
                self._json(handle_events_list(query))
                return
            if path.startswith("/api/events/") and path.endswith("/video"):
                event_id = int(path.split("/")[3])
                video_path = get_event_video_path(event_id)
                if video_path:
                    self._file(video_path)
                else:
                    self._json({"error": "video_not_found"}, 404)
                return
            if path == "/api/storage":
                self._json(handle_storage())
                return
            if path == "/api/area-setting":
                self._json(handle_area_get())
                return
            self._static(path)
        except Exception as exc:  # noqa: BLE001
            self._json({"error": "server_error", "detail": str(exc)}, 500)

    def do_POST(self):
        path = urlparse(self.path).path
        body = self._read_json()
        try:
            if path == "/api/login/approve":
                self._json(handle_login_approve(body))
                return
            if path == "/api/area-setting":
                self._json(handle_area_post(body))
                return
            if path == "/api/account/change-password":
                self._json(handle_change_password(body))
                return
            self._json({"error": "not_found"}, 404)
        except Exception as exc:  # noqa: BLE001
            self._json({"error": "server_error", "detail": str(exc)}, 500)

    def log_message(self, fmt, *args):
        print("[server] %s - %s" % (self.address_string(), fmt % args))


def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except OSError:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


def main():
    init_db()
    enforce_fifo_storage_limit()

    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    ip = get_local_ip()
    print("=" * 55)
    print("서버 실행됨 (data.db에 저장됨 - 껐다 켜도 유지됩니다)")
    print("이 주소를 PC 브라우저로 여세요 (localhost 아님!):")
    print("  http://%s:%d" % (ip, PORT))
    print("휴대폰도 같은 WiFi에 연결돼 있어야 QR이 열립니다.")
    print("테스트 로그인 비밀번호: admin1234")
    print("=" * 55)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n서버 종료")


if __name__ == "__main__":
    main()
