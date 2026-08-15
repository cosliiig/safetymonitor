/*
  산업안전 모니터링 UI - 프론트엔드 로직
  현재는 백엔드 없이 목(mock) 데이터로 동작합니다.
  라즈베리파이에 Flask/FastAPI 등 경량 서버를 붙이면
  아래 "TODO: 실제 API 연동" 표시된 부분만 fetch/WebSocket 호출로 교체하면 됩니다.
*/

// ---------- 목(mock) 데이터 ----------

const mockStatus = {
  state: "ok",          // "ok" | "warn" | "stop"
  distance: 2.4,         // m
  helmet: true,
  noise: 38,             // dB
  door: "closed",        // "open" | "closed"
  robot: "running"       // "running" | "stopped"
};

const mockEvents = [
  { id: 1, type: "proximity", title: "사람 접근 감지 · 로봇 정지", time: "2026-08-12 09:14", meta: "거리 0.8m" },
  { id: 2, type: "helmet", title: "안전모 미착용 · 출입 차단", time: "2026-08-12 08:52", meta: "" },
  { id: 3, type: "noise", title: "충돌음 감지", time: "2026-08-11 17:03", meta: "62 dB" }
];

const mockStorage = { usedGB: 12.4, totalGB: 16 };

// 등록된 관리자 목록 (USER_DB 대응) - 여러 관리자가 각자 자기 QR/계정으로 로그인
const mockAdmins = {
  admin1: "김관리",
  admin2: "이안전"
};

// ---------- 로그인 (화면에 QR 표시 -> 개인 휴대폰으로 스캔) ----------

const loginView = document.getElementById("view-login");
const appShell = document.getElementById("app-shell");
const qrCodeEl = document.getElementById("qr-code-el");
const qrStatus = document.getElementById("qr-status");
const qrTimerSec = document.getElementById("qr-timer-sec");
const qrApprovedAs = document.getElementById("qr-approved-as");
const qrRefreshBtn = document.getElementById("qr-refresh-btn");
const qrManualToggle = document.getElementById("qr-manual-toggle");
const qrManualBox = document.getElementById("qr-manual-box");
const qrManualAdmin = document.getElementById("qr-manual-admin");
const qrManualSubmit = document.getElementById("qr-manual-submit");
const adminNameEl = document.getElementById("admin-name");

let currentSessionToken = null;
let currentAdmin = null;
let qrCountdownInterval = null;
let qrPollInterval = null;
let secondsLeft = 60;

function generateSessionToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function renderQrCode(token) {
  qrCodeEl.innerHTML = "";
  // TODO: 실제 API 연동 - <라즈베리파이 로컬 IP>를 실제 주소로 교체.
  // 휴대폰이 같은 로컬 네트워크(WiFi)에서 이 주소로 접속해 로그인 승인 페이지를 엽니다.
  // 인터넷 연결 없이 로컬망 안에서만 동작하므로 "외부 서버 없이" 원칙과 어긋나지 않습니다.
  const loginUrl = "http://<라즈베리파이-IP>:8000/login/confirm?session=" + token;
  new QRCode(qrCodeEl, {
    text: loginUrl,
    width: 200,
    height: 200,
    correctLevel: QRCode.CorrectLevel.M
  });
}

function startQrLogin() {
  stopPolling();
  currentSessionToken = generateSessionToken();
  renderQrCode(currentSessionToken);
  qrApprovedAs.classList.add("hidden");
  qrStatus.textContent = "QR 코드를 스캔하면 자동으로 로그인됩니다.";
  startCountdown();
  startPolling();
}

function startCountdown() {
  secondsLeft = 60;
  qrTimerSec.textContent = secondsLeft;
  clearInterval(qrCountdownInterval);
  qrCountdownInterval = setInterval(() => {
    secondsLeft -= 1;
    qrTimerSec.textContent = secondsLeft;
    if (secondsLeft <= 0) {
      // 보안을 위해 일정 시간 지나면 코드를 새로 발급 (재사용 방지)
      startQrLogin();
    }
  }, 1000);
}

function startPolling() {
  // TODO: 실제 API 연동 - GET /api/login/status?session=<token> 폴링 또는 WebSocket으로 교체.
  // 휴대폰에서 로그인을 승인하면 서버가 이 세션을 "승인됨 + 관리자 ID"로 표시하고,
  // 여기서 그 상태를 감지해 handleLoginApproved(adminId)를 호출하면 됩니다.
  clearInterval(qrPollInterval);
  qrPollInterval = setInterval(() => {
    // 백엔드 연동 전까지는 대기만 함. 테스트는 아래 "스캔 시뮬레이션" 버튼 사용.
  }, 2000);
}

function stopPolling() {
  clearInterval(qrCountdownInterval);
  clearInterval(qrPollInterval);
}

function handleLoginApproved(adminId) {
  const adminName = mockAdmins[adminId] || "알 수 없음";
  currentAdmin = { id: adminId, name: adminName };
  stopPolling();

  qrApprovedAs.textContent = adminName + "님 로그인 승인됨";
  qrApprovedAs.classList.remove("hidden");

  setTimeout(() => {
    loginView.classList.remove("active");
    appShell.classList.remove("hidden");
    adminNameEl.textContent = adminName;
    initDashboard();
    resetIdleTimer();
  }, 500);
}

qrRefreshBtn.addEventListener("click", startQrLogin);

qrManualToggle.addEventListener("click", () => {
  qrManualBox.classList.toggle("hidden");
});

qrManualSubmit.addEventListener("click", () => {
  handleLoginApproved(qrManualAdmin.value);
});

document.getElementById("logout-btn").addEventListener("click", () => {
  appShell.classList.add("hidden");
  loginView.classList.add("active");
  qrManualBox.classList.add("hidden");
  currentAdmin = null;
  adminNameEl.textContent = "-";
  clearTimeout(idleTimer);
  startQrLogin();
});

// ---------- 자동 로그아웃 (여러 관리자가 같은 PC를 공용으로 쓸 때 보안) ----------

const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5분 미조작시 자동 로그아웃
let idleTimer = null;

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    document.getElementById("logout-btn").click();
  }, IDLE_LIMIT_MS);
}

["click", "keydown", "touchstart"].forEach((evt) => {
  document.addEventListener(evt, () => {
    if (!appShell.classList.contains("hidden")) resetIdleTimer();
  });
});

// 페이지 로드시 바로 카메라 시작
startQrLogin();

// ---------- 뷰 전환 (사이드바 내비게이션) ----------

const navButtons = document.querySelectorAll(".nav-btn[data-view]");
const views = {
  main: document.getElementById("view-main"),
  recode: document.getElementById("view-recode"),
  area: document.getElementById("view-area")
};

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.view;

    navButtons.forEach((b) => b.classList.toggle("active", b === btn));
    Object.entries(views).forEach(([key, el]) => {
      el.classList.toggle("active", key === target);
    });
  });
});

// ---------- Main 대시보드 ----------

function renderStatus(status) {
  const badge = document.getElementById("status-badge");
  const banner = document.getElementById("alert-banner");

  const stateMap = {
    ok: { label: "정상", cls: "status-ok" },
    warn: { label: "주의", cls: "status-warn" },
    stop: { label: "정지", cls: "status-stop" }
  };
  const s = stateMap[status.state] || stateMap.ok;

  badge.textContent = s.label;
  badge.className = "status-badge " + s.cls;

  if (status.state === "stop") {
    banner.textContent = "위험구역 진입 감지 · 로봇 정지";
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }

  document.getElementById("stat-distance").textContent = status.distance.toFixed(1) + " m";
  document.getElementById("stat-helmet").textContent = status.helmet ? "확인됨" : "미착용";
  document.getElementById("stat-noise").textContent = status.noise + " dB";
  document.getElementById("stat-door").textContent = status.door === "open" ? "열림" : "닫힘";
  document.getElementById("stat-robot").textContent = status.robot === "running" ? "가동중" : "정지";
}

// ---------- 이벤트 기록 (Recode_List) ----------

const eventTypeLabel = { proximity: "사람 접근", helmet: "안전모", noise: "소음" };
let currentFilter = "all";
let currentDateRange = { start: null, end: null }; // Date | null

function renderEvents() {
  const list = document.getElementById("event-list");

  let filtered = currentFilter === "all"
    ? mockEvents
    : mockEvents.filter((e) => e.type === currentFilter);

  if (currentDateRange.start || currentDateRange.end) {
    filtered = filtered.filter((e) => {
      const t = new Date(e.time.replace(" ", "T")).getTime();
      if (currentDateRange.start && t < currentDateRange.start.getTime()) return false;
      if (currentDateRange.end && t > currentDateRange.end.getTime()) return false;
      return true;
    });
  }

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state">해당 조건의 기록이 없습니다.</div>';
    return;
  }

  list.innerHTML = filtered.map((e) => `
    <div class="event-row">
      <div class="event-thumb"></div>
      <div class="event-info">
        <p class="event-title">${e.title}</p>
        <p class="event-meta">${e.time}${e.meta ? " · " + e.meta : ""}</p>
      </div>
      <button class="event-play" aria-label="영상 재생" data-id="${e.id}">▶</button>
    </div>
  `).join("");

  list.querySelectorAll(".event-play").forEach((btn) => {
    btn.addEventListener("click", () => {
      // TODO: 실제 API 연동 - GET /api/events/{id}/video
      alert("이벤트 #" + btn.dataset.id + " 영상 재생 (백엔드 연동 필요)");
    });
  });
}

document.getElementById("filter-row").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;

  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  currentFilter = chip.dataset.filter;
  renderEvents();
});

// 날짜/시간 수동 조회
document.getElementById("date-search-btn").addEventListener("click", () => {
  const startVal = document.getElementById("date-start").value;
  const endVal = document.getElementById("date-end").value;

  currentDateRange.start = startVal ? new Date(startVal) : null;
  currentDateRange.end = endVal ? new Date(endVal) : null;

  // TODO: 실제 API 연동 - GET /api/events?start=...&end=...&type=...
  renderEvents();
});

document.getElementById("date-reset-btn").addEventListener("click", () => {
  document.getElementById("date-start").value = "";
  document.getElementById("date-end").value = "";
  currentDateRange = { start: null, end: null };
  renderEvents();
});

function renderStorage(storage) {
  const pct = Math.min(100, Math.round((storage.usedGB / storage.totalGB) * 100));
  document.getElementById("storage-fill").style.width = pct + "%";
  document.getElementById("storage-text").textContent =
    `저장공간 ${storage.usedGB} / ${storage.totalGB} GB · 초과 시 오래된 항목부터 자동 삭제`;
}

// ---------- 구역 설정 (AreaSetting) ----------

const rangeInputs = [
  { id: "range-door-open", out: "val-door-open" },
  { id: "range-stop-dist", out: "val-stop-dist" },
  { id: "range-resume", out: "val-resume" },
  { id: "range-noise", out: "val-noise" }
];

rangeInputs.forEach(({ id, out }) => {
  const input = document.getElementById(id);
  const output = document.getElementById(out);
  input.addEventListener("input", () => {
    output.textContent = input.value;
  });
});

document.getElementById("save-area-btn").addEventListener("click", () => {
  const payload = {
    doorOpenSeconds: Number(document.getElementById("range-door-open").value),
    stopDistanceM: Number(document.getElementById("range-stop-dist").value),
    resumeDelaySeconds: Number(document.getElementById("range-resume").value),
    noiseThresholdDb: Number(document.getElementById("range-noise").value)
  };

  // TODO: 실제 API 연동 - POST /api/area-setting (라즈베리파이로 전송)
  console.log("area-setting payload", payload);

  const status = document.getElementById("save-status");
  status.textContent = "저장되었습니다.";
  status.classList.remove("hidden");
  status.classList.add("ok");
  setTimeout(() => status.classList.add("hidden"), 2000);
});

// ---------- 초기화 ----------

function initDashboard() {
  renderStatus(mockStatus);
  renderEvents();
  renderStorage(mockStorage);

  // TODO: 실제 API 연동 - WebSocket 연결로 실시간 상태 갱신
  // const ws = new WebSocket("ws://<라즈베리파이 IP>:8000/ws/status");
  // ws.onmessage = (msg) => renderStatus(JSON.parse(msg.data));
}

// 페이지 로드시 바로 QR 로그인 코드 표시
startQrLogin();
