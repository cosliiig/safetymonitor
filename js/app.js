/*
  산업안전 모니터링 UI - 프론트엔드 로직

  server/app.py (파이썬 표준 라이브러리 http.server 기반) 가 같은 origin에서
  프론트엔드와 /api/* 를 함께 서빙합니다. 그래서 이 파일의 fetch 호출은 전부
  상대경로("/api/...")를 씁니다 - PC든 휴대폰이든 접속한 주소가 곧 API 주소입니다.

  백엔드가 안 떠 있을 때(VS Code Live Server로 프론트만 열어본 경우 등)는
  fetch가 실패하므로 목(mock) 데이터로 자동 대체됩니다 - UI만 빠르게 확인할 때 유용합니다.
*/

async function apiFetch(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error("API " + path + " -> " + res.status);
  return res.json();
}

// ---------- 목(mock) 데이터 ----------

const mockStatus = {
  state: "ok",          // "ok" | "warn" | "stop"
  distance: 2.4,         // m
  helmet: true,
  noise: 38,             // dB
  noise_threshold: 50,   // dB - 구역 설정의 소음 임계값
  noise_alert: false,    // 소음이 임계값을 넘었는지
  door: "closed",        // "open" | "closed"
  robot: "running"       // "running" | "stopped"
};

const mockEvents = [
  { id: 1, type: "proximity", title: "사람 접근 감지 · 로봇 정지", time: "2026-08-12 09:14", meta: "거리 0.8m", has_video: false },
  { id: 2, type: "helmet", title: "안전모 미착용 · 출입 차단", time: "2026-08-12 08:52", meta: "", has_video: false },
  { id: 3, type: "noise", title: "충돌음 감지", time: "2026-08-11 17:03", meta: "62 dB", has_video: false }
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

  // PC 브라우저가 접속한 주소(location.origin)를 그대로 재사용합니다.
  // 휴대폰이 같은 로컬 WiFi에서 이 주소로 접속해 로그인 승인 페이지를 엽니다.
  // 인터넷 연결이 아니라 로컬망 안에서만 오가므로 "외부 서버 없이" 원칙과 어긋나지 않습니다.
  //
  // 주의: PC에서 http://localhost:8000 으로 접속해 테스트 중이면 location.origin이
  // "localhost"가 되어 휴대폰에서는 못 엽니다 - 이 화면을 띄우는 기기(장치)의
  // 실제 LAN IP(예: http://192.168.0.42:8000)로 접속한 상태에서 QR을 띄워야 합니다.
  const loginUrl = location.origin + "/login/confirm?session=" + token;

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
  // 휴대폰에서 로그인을 승인하면 서버가 이 세션을 "승인됨 + 관리자 ID"로 표시합니다.
  // 여기서 2초마다 확인하다가 승인되는 순간 handleLoginApproved를 호출합니다.
  clearInterval(qrPollInterval);
  qrPollInterval = setInterval(async () => {
    const token = currentSessionToken;
    try {
      const data = await apiFetch("/api/login/status?session=" + encodeURIComponent(token));
      if (token !== currentSessionToken) return; // 그 사이 코드가 갱신됐으면 무시

      if (data.status === "approved") {
        handleLoginApproved(data.admin_id, data.admin_name);
      } else if (data.status === "expired") {
        startQrLogin();
      } else if (data.status === "locked") {
        // 휴대폰에서 비밀번호를 여러 번 틀려 이 QR 코드가 잠긴 경우 - 새 코드로 교체
        startQrLogin();
      }
    } catch (err) {
      // 백엔드가 아직 안 떠 있는 경우 - 조용히 재시도.
      // (UI 단독 테스트는 "스캔 시뮬레이션" 버튼 사용)
    }
  }, 2000);
}

function stopPolling() {
  clearInterval(qrCountdownInterval);
  clearInterval(qrPollInterval);
}

function handleLoginApproved(adminId, adminName) {
  const name = adminName || mockAdmins[adminId] || "알 수 없음";
  currentAdmin = { id: adminId, name: name };
  stopPolling();

  qrApprovedAs.textContent = name + "님 로그인 승인됨";
  qrApprovedAs.classList.remove("hidden");

  setTimeout(() => {
    // .hidden은 !important라 #view-login의 자체 display 스타일(display:flex)까지 확실히 덮어씁니다.
    // active 클래스만 빼면 id 선택자 스타일에 밀려 로그인 화면이 안 사라지는 문제가 있었습니다.
    loginView.classList.remove("active");
    loginView.classList.add("hidden");
    appShell.classList.remove("hidden");
    adminNameEl.textContent = name;
    const settingsAdminNameEl = document.getElementById("settings-admin-name");
    if (settingsAdminNameEl) settingsAdminNameEl.textContent = name;
    initDashboard();
    resetIdleTimer();
  }, 500);
}

qrRefreshBtn.addEventListener("click", startQrLogin);

qrManualToggle.addEventListener("click", () => {
  qrManualBox.classList.toggle("hidden");
});

qrManualSubmit.addEventListener("click", () => {
  // 개발용 시뮬레이션: 실제 승인 API를 거치지 않고 즉시 로그인 처리.
  handleLoginApproved(qrManualAdmin.value, mockAdmins[qrManualAdmin.value]);
});

document.getElementById("logout-btn").addEventListener("click", () => {
  appShell.classList.add("hidden");
  loginView.classList.remove("hidden");
  loginView.classList.add("active");
  qrManualBox.classList.add("hidden");
  currentAdmin = null;
  adminNameEl.textContent = "-";
  clearTimeout(idleTimer);
  clearInterval(statusPollInterval);
  document.getElementById("side-panel").classList.remove("open");
  document.getElementById("panel-backdrop").classList.add("hidden");
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

// ---------- 뷰 전환 (오른쪽 슬라이드 메뉴) ----------

const navButtons = document.querySelectorAll(".nav-btn[data-view]");
const views = {
  main: document.getElementById("view-main"),
  recode: document.getElementById("view-recode"),
  area: document.getElementById("view-area"),
  settings: document.getElementById("view-settings")
};

const menuBtn = document.getElementById("menu-btn");
const sidePanel = document.getElementById("side-panel");
const panelBackdrop = document.getElementById("panel-backdrop");
const panelCloseBtn = document.getElementById("panel-close-btn");

function openPanel() {
  sidePanel.classList.add("open");
  panelBackdrop.classList.remove("hidden");
  menuBtn.setAttribute("aria-expanded", "true");
}

function closePanel() {
  sidePanel.classList.remove("open");
  panelBackdrop.classList.add("hidden");
  menuBtn.setAttribute("aria-expanded", "false");
}

menuBtn.addEventListener("click", openPanel);
panelCloseBtn.addEventListener("click", closePanel);
panelBackdrop.addEventListener("click", closePanel);

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.view;

    navButtons.forEach((b) => b.classList.toggle("active", b === btn));
    Object.entries(views).forEach(([key, el]) => {
      el.classList.toggle("active", key === target);
    });
    closePanel();
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

  let alertText = null;
  if (status.state === "stop" && isNotifTypeEnabled("stop")) {
    alertText = "위험구역 진입 감지 · 로봇 정지";
  } else if (!status.helmet && isNotifTypeEnabled("helmet")) {
    alertText = "안전모 미착용 감지 · 출입 차단";
  }

  if (alertText) {
    banner.textContent = alertText;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }

  // 위험 상황이 "새로 시작"될 때만 알림음 1회 재생 (계속 켜져있는 동안 반복 재생 방지)
  if (alertText && !lastAlertActive) playAlertSound();
  lastAlertActive = Boolean(alertText);

  document.getElementById("chip-distance").textContent = "거리 " + status.distance.toFixed(1) + " m";
  document.getElementById("chip-helmet").textContent = "안전모 " + (status.helmet ? "확인됨" : "미착용");

  // 개요서 기준: 소음은 "임계값을 넘었는지"가 핵심입니다 (넘으면 이벤트 녹화 트리거).
  // 그냥 dB 숫자만 보여주면 지금 정상인지 위험인지 알기 어려워서, 임계값과 비교한 상태를 같이 표시합니다.
  const noiseEl = document.getElementById("chip-noise");
  const noiseAlert = Boolean(status.noise_alert);
  noiseEl.textContent = status.noise + " dB" + (noiseAlert ? " · 감지됨" : " · 정상");
  noiseEl.style.color = noiseAlert ? "var(--danger-text)" : "";
  document.getElementById("stat-door").textContent = status.door === "open" ? "열림" : "닫힘";
  document.getElementById("stat-robot").textContent = status.robot === "running" ? "가동중" : "정지";
}

// ---------- 위험 상황 알림음 ----------
// 이 기기(브라우저)에만 저장되는 설정입니다. 서버/DB에는 저장하지 않습니다.

let lastAlertActive = false;

function isNotifSoundEnabled() {
  return localStorage.getItem("notifSoundEnabled") !== "off";
}

// type: "stop" | "helmet" - 각 상황별로 배너/알림음을 울릴지 개별 설정
function isNotifTypeEnabled(type) {
  const key = type === "stop" ? "notifOnStop" : "notifOnHelmet";
  return localStorage.getItem(key) !== "off";
}

function playAlertSound() {
  if (!isNotifSoundEnabled()) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (err) {
    // 오디오 재생이 막혀있는 환경(자동재생 정책 등) - 배너 알림은 그대로 작동
  }
}

const notifSoundToggle = document.getElementById("notif-sound-toggle");
if (notifSoundToggle) {
  notifSoundToggle.checked = isNotifSoundEnabled();
  notifSoundToggle.addEventListener("change", () => {
    localStorage.setItem("notifSoundEnabled", notifSoundToggle.checked ? "on" : "off");
  });
}

const notifStopToggle = document.getElementById("notif-stop-toggle");
if (notifStopToggle) {
  notifStopToggle.checked = isNotifTypeEnabled("stop");
  notifStopToggle.addEventListener("change", () => {
    localStorage.setItem("notifOnStop", notifStopToggle.checked ? "on" : "off");
  });
}

const notifHelmetToggle = document.getElementById("notif-helmet-toggle");
if (notifHelmetToggle) {
  notifHelmetToggle.checked = isNotifTypeEnabled("helmet");
  notifHelmetToggle.addEventListener("change", () => {
    localStorage.setItem("notifOnHelmet", notifHelmetToggle.checked ? "on" : "off");
  });
}

// ---------- 계정: 비밀번호 변경 ----------

const changePwBtn = document.getElementById("change-pw-btn");
if (changePwBtn) {
  changePwBtn.addEventListener("click", async () => {
    const status = document.getElementById("pw-change-status");
    const current = document.getElementById("pw-current").value;
    const next = document.getElementById("pw-new").value;
    const confirm = document.getElementById("pw-new-confirm").value;

    const showStatus = (text, ok) => {
      status.textContent = text;
      status.classList.remove("hidden", "ok", "err");
      status.classList.add(ok ? "ok" : "err");
    };

    if (!currentAdmin) {
      showStatus("로그인 정보가 없습니다. 다시 로그인해주세요.", false);
      return;
    }
    if (!current || !next || !confirm) {
      showStatus("모든 칸을 입력해주세요.", false);
      return;
    }
    if (next.length < 4) {
      showStatus("새 비밀번호는 4자 이상이어야 합니다.", false);
      return;
    }
    if (next !== confirm) {
      showStatus("새 비밀번호가 서로 일치하지 않습니다.", false);
      return;
    }

    try {
      const data = await apiFetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_id: currentAdmin.id,
          current_password: current,
          new_password: next
        })
      });

      if (data.ok) {
        showStatus("비밀번호가 변경되었습니다.", true);
        document.getElementById("pw-current").value = "";
        document.getElementById("pw-new").value = "";
        document.getElementById("pw-new-confirm").value = "";
      } else {
        const errMap = {
          wrong_current_password: "현재 비밀번호가 올바르지 않습니다.",
          new_password_too_short: "새 비밀번호는 4자 이상이어야 합니다.",
          unknown_admin: "관리자 정보를 찾을 수 없습니다.",
          invalid_request: "입력값을 확인해주세요."
        };
        showStatus(errMap[data.error] || "비밀번호 변경에 실패했습니다.", false);
      }
    } catch (err) {
      showStatus("서버에 연결할 수 없습니다.", false);
    }
  });
}

let statusPollInterval = null;

async function refreshStatus() {
  try {
    const data = await apiFetch("/api/status");
    renderStatus(data);
  } catch (err) {
    renderStatus(mockStatus); // 백엔드 미연결시 목데이터로 폴백
  }
}

function startStatusPolling() {
  refreshStatus();
  clearInterval(statusPollInterval);
  statusPollInterval = setInterval(refreshStatus, 2000);
}

// ---------- 이벤트 기록 (Recode_List) ----------

const eventTypeLabel = { proximity: "사람 접근", helmet: "안전모", noise: "소음" };
let currentFilter = "all";
let currentDateRange = { start: null, end: null }; // Date | null
let currentEvents = mockEvents; // 최근 조회 결과 (재생 버튼 등에서 재사용)

async function loadEvents() {
  const params = new URLSearchParams();
  if (currentFilter !== "all") params.set("type", currentFilter);
  if (currentDateRange.start) params.set("start", String(currentDateRange.start.getTime() / 1000));
  if (currentDateRange.end) params.set("end", String(currentDateRange.end.getTime() / 1000));

  try {
    currentEvents = await apiFetch("/api/events?" + params.toString());
  } catch (err) {
    // 백엔드 미연결시 목데이터에서 같은 조건으로 직접 필터링
    currentEvents = currentFilter === "all"
      ? mockEvents
      : mockEvents.filter((e) => e.type === currentFilter);

    if (currentDateRange.start || currentDateRange.end) {
      currentEvents = currentEvents.filter((e) => {
        const t = new Date(e.time.replace(" ", "T")).getTime();
        if (currentDateRange.start && t < currentDateRange.start.getTime()) return false;
        if (currentDateRange.end && t > currentDateRange.end.getTime()) return false;
        return true;
      });
    }
  }
  renderEvents();
}

function renderEvents() {
  const list = document.getElementById("event-list");
  const filtered = currentEvents;

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
      const ev = currentEvents.find((e) => String(e.id) === btn.dataset.id);
      if (ev && ev.has_video) {
        window.open("/api/events/" + btn.dataset.id + "/video", "_blank");
      } else {
        alert("이 이벤트에는 저장된 영상이 없습니다 (데모 데이터).");
      }
    });
  });
}

document.getElementById("filter-row").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;

  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  currentFilter = chip.dataset.filter;
  loadEvents();
});

// 날짜/시간 수동 조회
document.getElementById("date-search-btn").addEventListener("click", () => {
  const startVal = document.getElementById("date-start").value;
  const endVal = document.getElementById("date-end").value;

  currentDateRange.start = startVal ? new Date(startVal) : null;
  currentDateRange.end = endVal ? new Date(endVal) : null;

  loadEvents();
});

document.getElementById("date-reset-btn").addEventListener("click", () => {
  document.getElementById("date-start").value = "";
  document.getElementById("date-end").value = "";
  currentDateRange = { start: null, end: null };
  loadEvents();
});

function renderStorage(storage) {
  const pct = Math.min(100, Math.round((storage.usedGB / storage.totalGB) * 100));
  document.getElementById("storage-fill").style.width = pct + "%";
  document.getElementById("storage-text").textContent =
    `저장공간 ${storage.usedGB} / ${storage.totalGB} GB · 초과 시 오래된 항목부터 자동 삭제`;
}

async function loadStorage() {
  try {
    const data = await apiFetch("/api/storage");
    renderStorage({ usedGB: data.used_gb, totalGB: data.total_gb });
  } catch (err) {
    renderStorage(mockStorage);
  }
}

// ---------- 구역 설정 (AreaSetting) ----------

const rangeInputs = [
  { id: "range-door-open", out: "val-door-open", key: "doorOpenSeconds" },
  { id: "range-stop-dist", out: "val-stop-dist", key: "stopDistanceM" },
  { id: "range-resume", out: "val-resume", key: "resumeDelaySeconds" },
  { id: "range-noise", out: "val-noise", key: "noiseThresholdDb" }
];

rangeInputs.forEach(({ id, out }) => {
  const input = document.getElementById(id);
  const output = document.getElementById(out);
  input.addEventListener("input", () => {
    output.textContent = input.value;
  });
});

async function loadAreaSettings() {
  try {
    const data = await apiFetch("/api/area-setting");
    rangeInputs.forEach(({ id, out, key }) => {
      if (data[key] === undefined) return;
      document.getElementById(id).value = data[key];
      document.getElementById(out).textContent = data[key];
    });
  } catch (err) {
    // 백엔드 미연결시 화면에 표시된 기본값을 그대로 사용
  }
}

document.getElementById("save-area-btn").addEventListener("click", async () => {
  const payload = {};
  rangeInputs.forEach(({ id, key }) => {
    payload[key] = Number(document.getElementById(id).value);
  });

  const status = document.getElementById("save-status");

  try {
    await apiFetch("/api/area-setting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    status.textContent = "저장되었습니다.";
  } catch (err) {
    status.textContent = "저장 실패 (서버에 연결되지 않음) - 화면에만 반영됨";
  }

  status.classList.remove("hidden");
  status.classList.add("ok");
  setTimeout(() => status.classList.add("hidden"), 2500);
});

// ---------- 초기화 ----------

function initDashboard() {
  startStatusPolling();
  loadEvents();
  loadStorage();
  loadAreaSettings();
}

// 페이지 로드시 바로 QR 로그인 코드 표시
startQrLogin();
