// 상주시 정책 플랫폼 — 클라우드(Supabase) 사업 관리
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// 📎 서식 스토리지 공용 헬퍼(forms.js)가 같은 클라이언트를 쓰도록 넘겨준다(중복 생성 방지).
if (window.SangjuForms) SangjuForms.useClient(sb);
// 📥 신청 접수 공용 헬퍼(apply_client.js)도 같은 클라이언트를 쓰도록 넘겨준다.
if (window.SangjuApply) SangjuApply.useClient(sb);
const $ = (s) => document.querySelector(s);

let ALL = [], CATS = [], SELCATS = new Set(), sortKey = "seq", page = 0;
const PAGE = 12;
// ⛔ IS_GUEST(로그인 없이 입장)는 2026-08-04 «영구 제거»했습니다.
//    이 앱은 시민 신청자의 개인정보(성명·연락처·문의내용)를 다루므로
//    «세션이 있어야만» 화면에 들어갈 수 있습니다. 우회 플래그를 되살리지 마세요.
let LOGGING_OUT = false;   // 로그아웃 진행 중(onAuthStateChange 중복 처리 방지)
// 🔑 비밀번호 변경 진행 중. 이 동안에는 «본인 확인용 재로그인»과 «비밀번호 저장» 때문에
//    세션이 잠깐 갈릴 수 있어, 세션 만료 안내(showSessionExpired)가 끼어들지 않도록 막는다.
//    (LOGGING_OUT 과 같은 자리에서 선언 — onAuthStateChange 콜백이 먼저 실행돼도 TDZ 오류가 없도록)
let PW_CHANGING = false;

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m])); }
function el(t, c) { const e = document.createElement(t); if (c) e.className = c; return e; }

/* ── 담당팀 색 구분 (시민앱과 동일 팔레트·해시 → 같은 팀 = 양앱 같은 색) ──
   팀명을 결정적 해시로 팔레트에 매핑. 연한 배경+진한 글자(대비 4.5:1↑).
   null이면 색 미지정(기존 중립 배지 유지). 팀 수>14면 색 겹침 가능. */
const TEAM_PALETTE = [
  { bg: '#E8F0FE', fg: '#1A4480' }, { bg: '#E6F4EA', fg: '#1E6B33' }, { bg: '#FCE8E6', fg: '#A52714' },
  { bg: '#FEF7E0', fg: '#7A5900' }, { bg: '#F3E8FD', fg: '#6A1B9A' }, { bg: '#E0F7FA', fg: '#00695C' },
  { bg: '#FCE4EC', fg: '#AD1457' }, { bg: '#EFEBE9', fg: '#4E342E' }, { bg: '#E8EAF6', fg: '#283593' },
  { bg: '#F1F8E9', fg: '#33691E' }, { bg: '#FFF3E0', fg: '#B33C00' }, { bg: '#ECEFF1', fg: '#37474F' },
  { bg: '#E0F2F1', fg: '#00796B' }, { bg: '#FFEBEE', fg: '#C2185B' }
];
function teamColor(name) {
  const s = (name || '').trim();
  if (!s || s === '담당팀 확인 필요' || s === '-') return null;
  let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return TEAM_PALETTE[h % TEAM_PALETTE.length];
}

/* ── 접근성 헬퍼 (KWCAG 2.2) ───────────────────────────────── */
// C7: 스크린리더에 결과/오류를 알림(시각 alert와 별개로 보조기기 통지)
function announce(msg) {
  const box = document.getElementById("liveStatus");
  if (!box) return;
  box.textContent = "";
  // 같은 문구 연속 시에도 다시 읽도록 다음 프레임에 주입
  setTimeout(() => { box.textContent = String(msg || ""); }, 30);
}

// C2: 모달 포커스 트랩 — 열 때 첫 포커스, Tab 순환, Esc/닫기 시 복귀.
// 모달별로 한 번만 등록(중복 keydown 방지). open/close는 헬퍼로 통일.
const FOCUS_SEL = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let _lastFocus = null;          // 모달 열기 전 포커스 복귀용
let _activeModal = null;        // 현재 열린 모달 엘리먼트

function _trapKeydown(e) {
  if (!_activeModal) return;
  if (e.key === "Escape") { closeModal(_activeModal); return; }
  if (e.key !== "Tab") return;
  const f = [..._activeModal.querySelectorAll(FOCUS_SEL)].filter((n) => n.offsetParent !== null);
  if (!f.length) { e.preventDefault(); return; }
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
// 트랩 keydown은 문서에 단 한 번만 등록(모달 전환돼도 _activeModal만 갱신)
document.addEventListener("keydown", _trapKeydown);

function openModal(modal) {
  if (!modal) return;
  _lastFocus = document.activeElement;
  _activeModal = modal;
  modal.classList.remove("hidden");
  // 첫 포커스: 닫기 버튼이 아닌 첫 입력요소 우선, 없으면 첫 포커스 대상
  const focusables = [...modal.querySelectorAll(FOCUS_SEL)].filter((n) => n.offsetParent !== null);
  const target = focusables.find((n) => !n.classList.contains("modal-close")) || focusables[0];
  if (target) setTimeout(() => target.focus(), 30);
}
function closeModal(modal) {
  if (!modal) return;
  modal.classList.add("hidden");
  // 🔑 닫을 때 비밀번호 칸은 반드시 비운다. (Esc·바깥클릭·✕ 어느 경로로 닫아도 동일하게 동작하도록
  //    닫기 «한 곳»에서 처리한다. 현재 type="password" 입력칸은 비밀번호 변경 모달에만 있다)
  try { modal.querySelectorAll('input[type="password"]').forEach((n) => { n.value = ""; }); } catch (e) {}
  if (_activeModal === modal) _activeModal = null;
  if (_lastFocus && typeof _lastFocus.focus === "function") { try { _lastFocus.focus(); } catch (e) {} }
  _lastFocus = null;
  // ★ 모달이 열려 있는 동안 도착한 알림은 rtBusy() 때문에 띠가 «숨겨진 채» 카운트만 쌓인다.
  //   닫을 때 다시 계산해 주지 않으면 다음 실시간 이벤트가 올 때까지 알림이 영영 안 뜬다.
  try { syncRtBanners(); } catch (e) { /* 초기화 전이면 무시 */ }
}

// ---------- 버전 정보 + 버전별 개선사항(체인지로그) ----------
// 데이터 단일 소스: version.js의 window.APP_VERSION / window.APP_CHANGELOG.
function renderChangelog() {
  const box = $("#changelogBody");
  if (!box) return;
  const logs = window.APP_CHANGELOG || [];
  box.innerHTML = "";
  logs.forEach((e) => {
    const entry = document.createElement("div");
    entry.className = "cl-entry";

    const head = document.createElement("div");
    head.className = "cl-head";
    const ver = document.createElement("span");
    ver.className = "cl-ver";
    ver.textContent = "v" + (e.version || "");
    head.appendChild(ver);
    if (e.date) {
      const date = document.createElement("span");
      date.className = "cl-date";
      date.textContent = e.date;
      head.appendChild(date);
    }
    entry.appendChild(head);

    if (e.title) {
      const t = document.createElement("div");
      t.className = "cl-title";
      t.textContent = e.title;
      entry.appendChild(t);
    }

    const ul = document.createElement("ul");
    ul.className = "cl-items";
    (e.items || []).forEach((it) => {
      const li = document.createElement("li");
      li.textContent = it;
      ul.appendChild(li);
    });
    entry.appendChild(ul);
    box.appendChild(entry);
  });
}

// ── 진입 관문 ────────────────────────────────────────────────────────────
// 세션이 «있을 때만» 앱으로 들어간다. 없으면 로그인 화면에 머문다.
// (showApp() 을 호출하는 곳은 이 블록과 login() 성공 시점 두 곳뿐이어야 한다)
(async () => {
  let session = null;
  try {
    const res = await sb.auth.getSession();
    session = res && res.data ? res.data.session : null;
  } catch (e) {
    console.warn("[로그인] 세션 확인 실패 — 로그인 화면 유지:", e);
  }
  if (session) { showApp(); return; }
  // 로그인 화면 유지 — 키보드 이용자가 바로 입력할 수 있게 첫 칸에 초점(KWCAG 6.4.3)
  try { $("#email").focus(); } catch (e) {}
})();

// 세션이 끊기면(만료·토큰 갱신 실패·다른 곳에서 로그아웃) 로그인 화면으로 되돌린다.
// reload 하면 #app 이 다시 hidden 인 초기 상태로 돌아가므로 열람하던 자료가 남지 않는다.
//
// ⚠ 무한 새로고침 방지 — 반드시 «앱에 들어와 있을 때»만 반응한다.
//    로그인 화면에서 SIGNED_OUT 이 오면 reload → 또 SIGNED_OUT → reload … 로
//    앱이 통째로 먹통이 된다. 현재 버전(supabase-js 2.112.0)은 세션이 없을 때
//    INITIAL_SESSION 을 보내므로 실제로 그럴 일은 없지만(번들에서 확인함),
//    버전이 올라가도 안전하도록 «화면 상태»로 한 번 더 막는다.
sb.auth.onAuthStateChange((event) => {
  // 토큰이 갱신되거나 새로 로그인하면 «만료 예고» 시각을 다시 잡는다.
  if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") { scheduleExpiryWarning(); return; }
  if (event !== "SIGNED_OUT") return;
  if (LOGGING_OUT) return;                                  // 로그아웃 버튼 경로와 중복 방지
  if (PW_CHANGING) return;                                  // 🔑 비밀번호 변경 중 — 결과는 그 화면이 직접 안내
  if ($("#app").classList.contains("hidden")) return;       // 아직 로그인 화면 → 무시
  showSessionExpired();
});

/* ── 로그인 만료 대응 (KWCAG 6.2.1 «시간 제한») ──────────────────────────
   예전에는 만료되는 «순간» alert 를 띄우고 곧바로 location.reload() 를 실행했다.
   사업을 수정하던 중이면 입력하던 내용이 통째로 사라졌고, 미리 알 수도·연장할 수도 없었다.
   → ① 만료 2분 전에 미리 알리고 «로그인 연장» 을 제공
     ② 이미 만료됐으면 화면을 저절로 되돌리지 않고, 사용자가 누를 때 이동
   ⚠ 위 onAuthStateChange 의 «무한 새로고침 방어»(LOGGING_OUT·#app hidden 확인)는
      그대로 둔다. 여기서도 자동 reload 를 하지 않으므로 루프가 생기지 않는다. */
let EXPIRY_TIMER = null;

function showSessionBanner(text, opts) {
  const box = $("#sessionBanner");
  if (!box) return;
  $("#sessionBannerText").textContent = text;
  $("#sessionExtend").hidden = !(opts && opts.extend);
  $("#sessionGoLogin").hidden = !(opts && opts.goLogin);
  box.hidden = false;
}
function hideSessionBanner() {
  const box = $("#sessionBanner");
  if (box) box.hidden = true;
}

// 만료 2분 전 예고 — 연장 버튼 제공
function showSessionExpiring() {
  showSessionBanner("로그인이 곧 만료됩니다(약 2분 뒤). 계속 작업하시려면 «로그인 연장»을 눌러주세요.",
    { extend: true });
}

// 이미 만료됨 — 자동 이동하지 않는다(작성 중인 내용을 복사할 시간을 준다)
function showSessionExpired() {
  clearTimeout(EXPIRY_TIMER);
  showSessionBanner(
    "로그인이 만료되어 저장·조회가 되지 않습니다. 작성 중인 내용이 있으면 복사해 두신 뒤 «로그인 화면으로»를 눌러주세요.",
    { goLogin: true });
}

// 현재 세션의 만료 시각을 읽어 «2분 전» 예고를 예약한다.
async function scheduleExpiryWarning() {
  clearTimeout(EXPIRY_TIMER);
  let s = null;
  try {
    const res = await sb.auth.getSession();
    s = res && res.data ? res.data.session : null;
  } catch (e) { return; }
  if (!s || !s.expires_at) return;
  hideSessionBanner();                       // 갱신됐으면 이전 경고는 지운다
  const msLeft = s.expires_at * 1000 - Date.now();
  const warnIn = msLeft - 2 * 60 * 1000;
  if (warnIn <= 0) { showSessionExpiring(); return; }
  // setTimeout 은 약 24.8일이 상한이라 그보다 길면 예약하지 않는다(현실적으로 없음)
  if (warnIn < 2147483647) EXPIRY_TIMER = setTimeout(showSessionExpiring, warnIn);
}

async function extendSession() {
  const btn = $("#sessionExtend");
  if (btn) { btn.disabled = true; btn.textContent = "연장 중..."; }
  let ok = false;
  try {
    const res = await sb.auth.refreshSession();
    ok = !(res && res.error);
  } catch (e) { ok = false; }
  if (btn) { btn.disabled = false; btn.textContent = "로그인 연장"; }
  if (ok) {
    hideSessionBanner();
    scheduleExpiryWarning();
  } else {
    // 연장 실패 = 사실상 만료. 그래도 자동 이동은 하지 않는다.
    showSessionExpired();
  }
}

$("#loginBtn").onclick = login;
$("#pw").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
$("#email").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#pw").focus(); });

/* ── 인앱 브라우저(카톡·네이버 등) 대응 ──────────────────────────
   카톡/네이버 등 인앱 웹뷰는 PWA 설치·정상 사용이 어렵다.
   인앱일 때만 상단 배너로 크롬(안드로이드)·사파리(iOS) 전환을 유도한다.
   시민앱(모바일웹/app.js)의 isInApp/isIOS/isAndroid/buildChromeIntent와 동등. */
const INAPP_DISMISS_KEY = "sangju_admin_inapp_dismissed";
function isStandalone() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
         window.navigator.standalone === true;
}
// 카카오톡·네이버·라인·페이스북·인스타·다음 등 주요 인앱 웹뷰 감지(일반 크롬/사파리/삼성=false)
function isInApp() {
  const ua = (navigator.userAgent || "").toLowerCase();
  return /kakaotalk|naver|line\/|fban|fbav|instagram|daumapps|whale|everytimeapp|band|kakaostory/.test(ua);
}
function isIOS() {
  const ua = navigator.userAgent || "";
  return /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ 는 Mac 처럼 보고 → 터치 지원으로 보완 판별
    (/macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}
function isAndroid() {
  return /android/i.test(navigator.userAgent || "");
}
// 현재 주소(/admin/)를 안드로이드 크롬으로 강제로 여는 intent:// URL. 미설치 시 fallback_url 로 폴백.
function buildChromeIntent() {
  const cur = window.location.href;
  const hostPath = window.location.host + window.location.pathname +
                   window.location.search + window.location.hash;
  return "intent://" + hostPath +
    "#Intent;scheme=https;package=com.android.chrome;" +
    "S.browser_fallback_url=" + encodeURIComponent(cur) + ";end";
}
// 현재 주소 복사(클립보드 API 실패 시 임시 input 폴백)
async function copyCurrentUrl() {
  const url = window.location.href;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
    } else { throw new Error("no clipboard api"); }
    announce("주소를 복사했어요. 브라우저에 붙여넣어 열어주세요.");
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand("copy"); announce("주소를 복사했어요."); }
    catch (e2) { announce("주소 복사에 실패했어요. 주소창을 길게 눌러 복사해 주세요."); }
    document.body.removeChild(ta);
  }
}
function initInApp() {
  const banner = $("#inappBanner");
  if (!banner) return;
  let dismissed = false;
  try { dismissed = localStorage.getItem(INAPP_DISMISS_KEY) === "1"; } catch (e) {}
  // 설치 실행(standalone)·일반 브라우저·이미 닫음 → 숨김
  if (isStandalone() || !isInApp() || dismissed) { banner.classList.add("hidden"); return; }

  const txt = $("#inappText"), openBtn = $("#inappOpen"), copyBtn = $("#inappCopy");
  if (isAndroid()) {
    txt.innerHTML = "앱 설치·정상 이용은 <b>크롬</b>에서 됩니다.<br>아래 버튼으로 크롬에서 열어주세요.";
    openBtn.hidden = false; copyBtn.hidden = true;
  } else if (isIOS()) {
    txt.innerHTML = "정상 이용하려면 우측 위 <b>⋯ 메뉴 → ‘Safari로 열기’</b>를 눌러주세요.<br>(주소를 복사해 사파리에 붙여넣어도 됩니다.)";
    openBtn.hidden = true; copyBtn.hidden = false;
  } else {
    txt.innerHTML = "정상 이용은 <b>크롬·사파리 등 기본 브라우저</b>에서 됩니다.<br>주소를 복사해 브라우저에서 열어주세요.";
    openBtn.hidden = true; copyBtn.hidden = false;
  }
  banner.classList.remove("hidden");
}
// 인앱 배너 이벤트(로그인 전에도 동작하도록 즉시 바인딩)
$("#inappOpen").onclick = () => { window.location.href = buildChromeIntent(); };
$("#inappCopy").onclick = copyCurrentUrl;
$("#inappClose").onclick = () => {
  $("#inappBanner").classList.add("hidden");
  try { localStorage.setItem(INAPP_DISMISS_KEY, "1"); } catch (e) {}
};
// 진입 즉시 1회 평가(로그인 화면 상단에서도 노출)
initInApp();

// 로그인 실패 사유를 공무원이 이해할 수 있는 말로 바꾼다.
// (Supabase 원문은 영어라 "Invalid login credentials" 만 보이면 원인 파악이 안 된다)
function loginErrMsg(error) {
  const msg = String((error && error.message) || "").toLowerCase();
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "인터넷에 연결되어 있지 않습니다. 연결 상태를 확인해 주세요.";
  }
  if (/invalid login credentials|invalid credentials/.test(msg)) {
    return "이메일 또는 비밀번호가 맞지 않습니다. 다시 확인해 주세요.";
  }
  if (/email not confirmed/.test(msg)) {
    return "메일 인증이 끝나지 않은 계정입니다. 시스템 담당자에게 문의해 주세요.";
  }
  if (/too many requests|rate limit/.test(msg)) {
    return "로그인 시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (/failed to fetch|network|load failed/.test(msg)) {
    return "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "로그인하지 못했습니다. (" + ((error && error.message) || "알 수 없는 오류") + ")";
}

async function login() {
  const email = $("#email").value.trim(), password = $("#pw").value;
  if (!email || !password) {
    $("#loginErr").textContent = "이메일과 비밀번호를 입력하세요.";
    (!email ? $("#email") : $("#pw")).focus();   // 초점을 비어 있는 칸으로
    return;
  }
  $("#loginBtn").disabled = true;                 // 중복 제출 방지
  $("#loginErr").textContent = "로그인 중...";
  let error = null;
  try {
    const res = await sb.auth.signInWithPassword({ email, password });
    error = res && res.error ? res.error : null;
  } catch (e) {
    error = e;
  }
  $("#loginBtn").disabled = false;
  if (error) {
    // role="alert" aria-live="assertive" 라 화면낭독기가 즉시 읽는다.
    $("#loginErr").textContent = loginErrMsg(error);
    $("#pw").value = "";
    $("#pw").focus();                             // 초점 유실 없이 다시 입력 가능
    return;
  }
  showApp();
}

async function showApp() {
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  bindUI();
  bindProposalsUI();
  bindApplicationsUI();
  // 로그인 만료 예고 예약 + 띠 버튼 연결
  scheduleExpiryWarning();
  $("#sessionExtend").onclick = extendSession;
  $("#sessionGoLogin").onclick = () => { LOGGING_OUT = true; location.reload(); };
  await loadBenefits();
  subscribeRealtime();
  // 정책제안: 탭 진입 시 1회 로드(초기엔 비활성 섹션이라 미로드 → 첫 탭 전환에서 로드)
  subscribeProposalsRealtime();
  // 📥 신청 접수: 공무원 1순위 업무 → 기본(첫) 탭. 즉시 로드 + 실시간 구독.
  subscribeApplicationsRealtime();
  loadApplications();
}

/* ══════════════════════════════════════════════════════════════════════
   🔑 비밀번호 변경 (담당자 본인이 직접)
   ────────────────────────────────────────────────────────────────────
   계정은 시스템 담당자가 Supabase 대시보드에서 만들고 «임시 비밀번호»를 알려 준다.
   그 값을 계속 쓰면 만든 사람도 아는 비밀번호가 되어 «본인만 아는 비밀번호» 원칙
   (개인정보의 안전성 확보조치 기준)에 어긋난다 → 여기서 스스로 바꾼다.

   절차: ① 현재 비밀번호로 본인 확인  ② 복잡도 검사  ③ Supabase 에 새 비밀번호 저장
   ★ ①을 두는 이유: Supabase 는 «세션만 있으면» 현재 비밀번호 없이 바꿀 수 있다.
     자리를 비운 사이 지나가던 사람이 비밀번호를 바꿔 계정을 통째로 가져갈 수 있으므로,
     PC앱(webui/app_web.py change_password)과 같게 현재 비밀번호를 한 번 더 묻는다.
   ══════════════════════════════════════════════════════════════════════ */

/* 비밀번호 복잡도 — PC앱 auth.py password_strength_error() 의 «그대로» 옮긴 판정.
   기준(개인정보의 안전성 확보조치 기준 해설서): 문자 종류 3종 이상이면 8자,
   2종 이상이면 10자. 두 앱이 다른 기준을 쓰면 담당자가 혼란스러우므로
   ⚠ 한쪽만 고치지 말 것(auth.py ↔ 이 함수는 한 쌍이다).
   문자 종류 판정은 파이썬 islower/isupper/isdigit/isalnum 과 맞춘다
   (한글은 대·소문자가 없고 isalnum 이 참 → «특수문자»로 세지 않는다). */
function passwordStrengthError(pw) {
  const s = String(pw == null ? "" : pw);
  if (!s.trim()) return "새 비밀번호를 입력해 주세요.";
  if (/\s/.test(s)) return "비밀번호에 공백은 쓸 수 없습니다.";
  let kinds = 0;
  if (/\p{Ll}/u.test(s)) kinds++;                 // 소문자
  if (/\p{Lu}/u.test(s)) kinds++;                 // 대문자
  if (/\p{Nd}/u.test(s)) kinds++;                 // 숫자
  if (/[^\p{L}\p{N}]/u.test(s)) kinds++;          // 특수문자(글자·숫자가 아닌 것)
  const len = [...s].length;                      // 이모지 등도 1자로 세도록 코드포인트 기준
  if (kinds >= 3 && len >= 8) return "";
  if (kinds >= 2 && len >= 10) return "";
  return "비밀번호가 너무 단순합니다.\n" +
    "· 영문 대문자·소문자·숫자·특수문자 중 3종류 이상을 섞으면 8자 이상\n" +
    "· 2종류만 섞으면 10자 이상\n" +
    "  예) sangju!2026 · Gotgam2026!\n" +
    "(지금 입력: " + len + "자, " + kinds + "종류)";
}

// 비밀번호 변경 실패 사유를 공무원이 이해할 수 있는 말로 바꾼다(loginErrMsg 와 같은 방식).
function pwErrMsg(error) {
  const msg = String((error && error.message) || "").toLowerCase();
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "인터넷에 연결되어 있지 않습니다. 연결 상태를 확인해 주세요.";
  }
  if (/invalid login credentials|invalid credentials/.test(msg)) {
    return "현재 비밀번호가 맞지 않습니다. 다시 확인해 주세요.";
  }
  if (/should be different|same_password|same as the old/.test(msg)) {
    return "지금 쓰는 비밀번호와 같습니다. 다른 값으로 정해 주세요.";
  }
  if (/weak password|password should be at least|password is too short/.test(msg)) {
    return "서버가 요구하는 조건에 못 미치는 비밀번호입니다. 더 길고 복잡하게 정해 주세요.";
  }
  if (/too many requests|rate limit|for security purposes/.test(msg)) {
    return "시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (/session|jwt|token|not authenticated/.test(msg)) {
    return "로그인이 만료되었습니다. 다시 로그인하신 뒤 바꿔 주세요.";
  }
  if (/failed to fetch|network|load failed/.test(msg)) {
    return "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "비밀번호를 바꾸지 못했습니다. (" + ((error && error.message) || "알 수 없는 오류") + ")";
}

function pwSetMsg(text, kind) {
  const box = $("#pwErr");
  if (!box) return;
  box.className = "pw-msg" + (kind ? " " + kind : "");
  box.textContent = text || "";
}

// 화면을 처음 상태로 되돌리고 연다(직전 입력·안내가 남지 않게).
function openChangePw() {
  ["#pwCur", "#pwNew", "#pwChk"].forEach((s) => { const n = $(s); if (n) n.value = ""; });
  const rule = $("#pwNewRule");
  if (rule) { rule.textContent = ""; rule.className = "pw-rule"; }
  pwSetMsg("");
  const btn = $("#pwSave");
  if (btn) { btn.disabled = false; btn.textContent = "🔑 변경하기"; btn.onclick = submitChangePw; }
  openModal($("#pwModal"));   // 첫 초점은 «현재 비밀번호» 칸(모달 공통 규약)
}

async function submitChangePw() {
  const cur = $("#pwCur").value, nw = $("#pwNew").value, chk = $("#pwChk").value;
  // 실패 안내 + 고쳐야 할 칸으로 초점 이동(KWCAG)
  const fail = (msg, sel) => {
    pwSetMsg(msg, "ng");
    announce(msg);
    if (sel) { const n = $(sel); if (n) n.focus(); }
  };
  if (!cur) { fail("현재 비밀번호를 입력해 주세요.", "#pwCur"); return; }
  const ruleErr = passwordStrengthError(nw);
  if (ruleErr) {
    // 여러 줄짜리 «규칙 안내»는 해당 칸 바로 아래에 두고, 맨 아래 결과줄에는 한 줄 요약만 —
    // 같은 긴 안내가 화면에 두 번 뜨면 무엇을 고쳐야 할지 오히려 찾기 어렵다.
    const box = $("#pwNewRule");
    const oneLine = ruleErr.indexOf("\n") < 0;
    if (box) {
      box.textContent = oneLine ? "" : ruleErr;
      box.className = "pw-rule" + (oneLine ? "" : " ng");
    }
    fail(oneLine ? ruleErr : "새 비밀번호가 규칙에 맞지 않습니다. 「새 비밀번호」 칸 아래 안내를 확인해 주세요.", "#pwNew");
    return;
  }
  if (!chk) { fail("새 비밀번호 확인을 입력해 주세요.", "#pwChk"); return; }
  if (nw !== chk) { fail("새 비밀번호 확인이 일치하지 않습니다. 같은 값을 다시 입력해 주세요.", "#pwChk"); return; }
  if (nw === cur) { fail("지금 쓰는 비밀번호와 같습니다. 다른 값으로 정해 주세요.", "#pwNew"); return; }

  const btn = $("#pwSave");
  const label = btn.textContent;
  let needRelogin = false;
  btn.disabled = true; btn.textContent = "변경 중...";
  pwSetMsg("비밀번호를 바꾸는 중입니다...");
  PW_CHANGING = true;
  try {
    // ① 본인 확인 — 지금 로그인한 이메일 + 입력한 현재 비밀번호로 다시 로그인해 본다.
    //    (Supabase 에는 «비밀번호만 확인» 하는 기능이 없다. 성공하면 같은 계정의 새 세션으로 이어진다)
    let email = "";
    try {
      const r = await sb.auth.getSession();
      const ses = r && r.data ? r.data.session : null;
      email = (ses && ses.user && ses.user.email) || "";
    } catch (e) { email = ""; }
    if (!email) {
      needRelogin = true;
      fail("로그인이 만료되었습니다. 다시 로그인하신 뒤 바꿔 주세요.");
      return;
    }
    let vErr = null;
    try {
      const r = await sb.auth.signInWithPassword({ email, password: cur });
      vErr = r && r.error ? r.error : null;
    } catch (e) { vErr = e; }
    if (vErr) {
      $("#pwCur").value = "";
      fail(pwErrMsg(vErr), "#pwCur");
      return;
    }

    // ② 새 비밀번호 저장
    let uErr = null;
    try {
      const r = await sb.auth.updateUser({ password: nw });
      uErr = r && r.error ? r.error : null;
    } catch (e) { uErr = e; }
    if (uErr) { fail(pwErrMsg(uErr), "#pwNew"); return; }

    // ③ 세션이 살아 있는지 확인 — Supabase 설정에 따라 비밀번호를 바꾸면
    //    다른 기기의 로그인을 끊는데, 그때 이 기기까지 끊기는 경우가 있어 결과를 보고 안내를 나눈다.
    let alive = false;
    try {
      const r = await sb.auth.getSession();
      alive = !!(r && r.data && r.data.session);
    } catch (e) { alive = false; }

    ["#pwCur", "#pwNew", "#pwChk"].forEach((s) => { const n = $(s); if (n) n.value = ""; });
    const rule = $("#pwNewRule");
    if (rule) { rule.textContent = ""; rule.className = "pw-rule"; }

    if (alive) {
      scheduleExpiryWarning();     // 새 세션 기준으로 «만료 2분 전» 예고를 다시 잡는다
      pwSetMsg("✅ 비밀번호를 바꿨습니다. 지금 로그인은 그대로 유지되며, 다음 로그인부터 새 비밀번호를 쓰시면 됩니다.", "ok");
      announce("비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 쓰세요.");
    } else {
      needRelogin = true;
      pwSetMsg("✅ 비밀번호를 바꿨습니다. 보안을 위해 로그인이 끊겼으니 새 비밀번호로 다시 로그인해 주세요.", "ok");
      announce("비밀번호를 바꿨습니다. 새 비밀번호로 다시 로그인해 주세요.");
    }
  } finally {
    PW_CHANGING = false;
    btn.disabled = false;
    if (needRelogin) {
      // 저절로 화면을 되돌리지 않는다(KWCAG 6.2.1 «시간 제한») — 누를 때 이동한다.
      btn.textContent = "로그인 화면으로";
      btn.onclick = () => { LOGGING_OUT = true; location.reload(); };
      try { btn.focus(); } catch (e) {}
    } else {
      btn.textContent = label;
    }
  }
}

function bindUI() {
  $("#search").addEventListener("input", debounce(() => { page = 0; render(); }, 300));
  $("#sortSel").addEventListener("change", () => { sortKey = $("#sortSel").value; render(); });
  $("#btnAdd").onclick = () => openEdit(null);
  $("#btnLogout").onclick = async () => {
    LOGGING_OUT = true;                 // onAuthStateChange 가 중복으로 안내하지 않도록
    try { await sb.auth.signOut(); } catch (e) { /* 이미 끊겼어도 화면은 되돌린다 */ }
    location.reload();                  // 초기 상태(로그인 화면)로 — 열람하던 데이터도 사라짐
  };
  // C2: 닫기/바깥클릭은 closeModal로 통일(포커스 복귀). Esc는 _trapKeydown이 일괄 처리.
  $("#mClose").onclick = () => closeModal($("#modal"));
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal($("#modal")); });

  // 🔑 비밀번호 변경 모달 (열기/닫기/바깥클릭) — Esc는 공통 트랩에서 처리
  const pwm = $("#pwModal");
  if (pwm) {
    $("#btnChangePw").onclick = openChangePw;
    $("#pwClose").onclick = () => closeModal(pwm);
    pwm.addEventListener("click", (e) => { if (e.target.id === "pwModal") closeModal(pwm); });
    $("#pwSave").onclick = submitChangePw;
    // 입력 중 규칙 미리 확인 — 「변경하기」를 눌러야 알 수 있던 것을 미리 알려 준다(300ms 디바운스).
    // 안내는 role="status"(polite) 라 타이핑을 방해하지 않는다.
    $("#pwNew").addEventListener("input", debounce(() => {
      const v = $("#pwNew").value, box = $("#pwNewRule");
      if (!box) return;
      if (!v) { box.textContent = ""; box.className = "pw-rule"; return; }
      const err = passwordStrengthError(v);
      box.textContent = err ? err : "✅ 쓸 수 있는 비밀번호입니다.";
      box.className = "pw-rule " + (err ? "ng" : "ok");
    }, 300));
  }

  // 개인정보 처리방침 모달 (열기/닫기/바깥클릭) — Esc는 공통 트랩에서 처리
  const pp = $("#ppModal");
  if (pp) {
    $("#btnPrivacy").onclick = () => openModal(pp);
    $("#ppClose").onclick = () => closeModal(pp);
    pp.addEventListener("click", (e) => { if (e.target.id === "ppModal") closeModal(pp); });
  }

  // 버전 라벨 + 버전별 개선사항(체인지로그) 모달 — Esc는 공통 트랩에서 처리
  const vm = $("#versionModal");
  const vbtn = $("#btnVersion");
  const ver = window.APP_VERSION || "";
  if (vbtn && ver) {
    vbtn.textContent = "v" + ver;                // 단일 소스에서 버전 주입
    // 음성 명령이 «보이는 글자»로 눌리도록 접근명 맨 앞에 화면 텍스트(v0.0.2 등)를 그대로 둔다
    vbtn.setAttribute("aria-label", "v" + ver + " — 버전별 개선사항 보기");
  }
  if (vm && vbtn) {
    renderChangelog();
    vbtn.onclick = () => openModal(vm);
    $("#vmClose").onclick = () => closeModal(vm);
    vm.addEventListener("click", (e) => { if (e.target.id === "versionModal") closeModal(vm); });
  }
}

/* 📌 접수 안내(엑셀 «비고» 열 = benefits.note) — 세 앱 공통 규약
   «비고»에는 "2026년 접수 마감(매년 3~5월 접수)"처럼 지금 신청할 수 있는지가 담긴다.
   안 보이면 이미 마감된 사업을 민원인에게 안내하게 되므로 목록·상세(수정)에 모두 노출한다.
   ★ 아이콘 «📌» + 문구 «접수 안내» 는 시민앱(모바일웹)·PC앱(webui)과 글자 단위로 동일(임의 변경 금지).
   ★ 색만으로 알리지 않는다 — 배경색과 별개로 «📌 접수 안내» 라는 글자를 항상 함께 쓴다.

   ⚠ note 컬럼은 Supabase 대시보드에서 사람이 직접 추가한다(supabase/add_note_column.sql).
     아직 없을 수 있으므로 «있으면 쓰고 없으면 조용히 빠진다»를 원칙으로 한다.
       · 읽기 : select("*") 결과에 키가 없으면 undefined → 배지 미표시(그대로 안전)
       · 쓰기 : 없는 컬럼을 insert/update 에 넣으면 PGRST204 로 «저장 자체»가 실패한다
                → NOTE_OK 가 참일 때만 입력칸을 만들고, 만일을 대비해 저장 실패 시 1회 재시도 */
const NOTE_KEY = "note";
const NOTE_LABEL = "📌 접수 안내";
let NOTE_OK = false;   // benefits.note 컬럼 존재 여부(런타임 감지)

function noteText(r) {
  const v = String((r && r[NOTE_KEY]) || "").replace(/\s+/g, " ").trim();
  return (v && v !== "nan" && v !== "null" && v !== "undefined") ? v : "";
}

// 컬럼 존재 감지: 행이 있으면 키 유무로 판정(추가 요청 0회),
// 행이 하나도 없을 때만 가벼운 probe 질의를 한 번 던진다.
async function detectNoteColumn(rows) {
  if (rows && rows.length) {
    NOTE_OK = Object.prototype.hasOwnProperty.call(rows[0], NOTE_KEY);
    return;
  }
  const { error } = await sb.from("benefits").select(NOTE_KEY).limit(1);
  NOTE_OK = !error;
}

// 저장 payload 에서 note 를 제거해야 하는 오류인지(컬럼 미생성) 판정
function isMissingNoteColumn(error) {
  if (!error) return false;
  const code = String(error.code || "");
  const msg = String(error.message || "").toLowerCase();
  return code === "PGRST204" || (msg.includes("note") && /column|schema cache/.test(msg));
}

async function loadBenefits() {
  const { data, error } = await sb.from("benefits").select("*").order("seq", { nullsFirst: false }).order("id");
  if (error) {
    console.error(error);
    // 원인(연결/권한/미설정)별 안내 + 다시 시도 — "불러오기 실패"만 뜨던 문제 개선
    showLoadError("#list", error, "listRetry", loadBenefits);
    return;
  }
  ALL = data || [];
  await detectNoteColumn(ALL);          // 📌 접수 안내 컬럼이 준비됐는지 확인
  RT_PENDING = 0; syncRtBanners();     // 새로 불러왔으니 «밀린 알림»도 지운다
  CATS = [...new Set(ALL.flatMap((r) => r.categories || []))].sort();
  $("#dbInfo").textContent = `사업 ${ALL.length}건 · 실시간`;
  renderCats();
  render();
}

// ── 실시간 변경 «알림»(자동 갱신 아님) ────────────────────────────────
// 예전에는 새 데이터가 오면 목록을 즉시 갈아끼웠다. 보고 있던 위치가 사라지고,
// 모달을 열어 편집하는 중에도 뒤 목록이 바뀌어 «정지 기능»(KWCAG 6.2.2)이 필요한
// 자동 변경이었다. → 이제는 누적 건수만 띠로 알리고, 갱신은 사용자가 누를 때만 한다.
let RT_PENDING = 0, PRT_PENDING = 0, ART_PENDING = 0;

// 모달이 열려 있으면(=편집 중) 알림 띠도 띄우지 않는다 — 작업 방해 금지
function rtBusy() {
  return ["#modal", "#pModal", "#aModal", "#ppModal", "#versionModal"]
    .some((s) => { const m = $(s); return m && !m.classList.contains("hidden"); });
}

function syncRtBanners() {
  const busy = rtBusy();
  const b = $("#rtBanner"), p = $("#pRtBanner"), a = $("#aRtBanner");
  if (b) {
    const show = RT_PENDING > 0 && !busy;
    if (show) $("#rtText").textContent = `사업 정보 변경 ${RT_PENDING}건이 있습니다`;
    b.hidden = !show;
  }
  if (p) {
    const show = PRT_PENDING > 0 && !busy;
    if (show) $("#pRtText").textContent = `새 제안·변경 ${PRT_PENDING}건이 있습니다`;
    p.hidden = !show;
  }
  if (a) {
    const show = ART_PENDING > 0 && !busy;
    if (show) $("#aRtText").textContent = `새 접수·변경 ${ART_PENDING}건이 있습니다`;
    a.hidden = !show;
  }
}

function subscribeRealtime() {
  sb.channel("benefits-rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "benefits" },
        () => { RT_PENDING += 1; syncRtBanners(); })   // 화면은 그대로, «알림»만
    .subscribe((status) => setRealtimeDot(status === "SUBSCRIBED"));
}

// 실시간 연결 표시 갱신 — 색·글자·title 을 «함께» 바꾼다.
// 예전에는 CSS 클래스만 토글해서, 연결이 끊겨도 aria-label 이 "실시간 연결됨"으로
// 하드코딩돼 화면낭독기에 «거짓 정보»가 전달됐다(그리고 색만으로 상태를 알렸다).
function setRealtimeDot(ok) {
  const box = $("#realtimeDot");
  if (!box) return;
  const msg = ok ? "실시간 연결됨" : "실시간 연결 끊김";
  box.classList.toggle("off", !ok);
  box.title = msg;
  const t = box.querySelector(".rt-dot-text");
  if (t) t.textContent = msg;      // role="status" → 바뀌는 순간 낭독된다
}

function renderCats() {
  const box = $("#catChips"); box.innerHTML = "";
  CATS.forEach((cat) => {
    const c = el("button", "chip" + (SELCATS.has(cat) ? " on" : ""));
    c.type = "button";
    c.textContent = cat;
    // 색(.on)만으로 선택 상태를 알리지 않는다 — renderAStatusChips 와 같은 규약
    c.setAttribute("aria-pressed", SELCATS.has(cat) ? "true" : "false");
    c.onclick = () => { SELCATS.has(cat) ? SELCATS.delete(cat) : SELCATS.add(cat); page = 0; renderCats(); render(); };
    box.appendChild(c);
  });
}

function render() {
  const q = $("#search").value.trim().toLowerCase();
  let rows = ALL.filter((r) => {
    if (SELCATS.size) {
      const rc = r.categories || [];
      if (![...SELCATS].some((c) => rc.includes(c))) return false;
    }
    if (q) {
      const blob = `${r.name || ""} ${r.team || ""} ${r.content || ""} ${r.target || ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
  if (sortKey === "name") rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  $("#count").textContent = `총 ${rows.length}건`;
  const list = $("#list");
  if (!rows.length) { list.innerHTML = '<div class="empty">조건에 맞는 사업이 없습니다.</div>'; $("#pager").innerHTML = ""; return; }
  const pages = Math.ceil(rows.length / PAGE); if (page >= pages) page = pages - 1; if (page < 0) page = 0;
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  list.innerHTML = "";
  slice.forEach((r) => {
    const team = (r.team || "").trim();
    const content = (r.content || "").replace(/\s+/g, " ").trim();
    const note = noteText(r);          // 📌 접수 안내(비고). 컬럼이 없으면 항상 ""
    const card = el("div", "card");
    // C1: 키보드 접근 — 버튼 의미 부여 + Enter/Space 동작 + 접근명
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    // 색만으로 알리지 않도록 접근명에도 «접수 안내»를 함께 넣는다
    card.setAttribute("aria-label",
      `${r.name || "사업"}${note ? `, 접수 안내 ${note}` : ""} 수정`);
    card.innerHTML = `<div class="card-main">
        <div class="card-title">📂 ${esc(r.name)}</div>
        <div class="card-desc">${esc(content.slice(0, 90)) || "—"}</div>
        ${note ? `<div class="card-note">${NOTE_LABEL} · ${esc(note)}</div>` : ""}
      </div>
      <span class="badge ${team ? "" : "warn"}"${team ? ` title="${esc(team)}"` : ""}>${team ? esc(team) : "담당팀 확인 필요"}</span>`;
    // 담당팀 색 구분: 팀명별 결정적 색을 배지에 적용(시민앱과 동일). null이면 중립 유지.
    const tc = teamColor(team);
    if (tc) {
      const bdg = card.querySelector(".badge");
      if (bdg) { bdg.style.background = tc.bg; bdg.style.color = tc.fg; }
    }
    const openIt = () => openEdit(r);
    card.onclick = openIt;
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openIt(); }
    });
    list.appendChild(card);
  });
  renderPager(rows.length, pages);
}

// 페이지 이동(KWCAG 2.2 «레이블 제공»·«명확한 지시») — PC앱 webui/app.js renderPager 와 동일 방식.
//  · 래퍼를 <nav aria-label="페이지 이동"> 으로 두어 보조기기가 영역을 인지
//  · ‹ / › 는 기호뿐이라 화면낭독기가 읽을 수 없음 → aria-label 로 "이전/다음 페이지"
//  · 숫자 버튼은 "N 페이지", 현재 페이지는 aria-current="page"
function renderPager(total, pages) {
  const wrap = $("#pager"); wrap.innerHTML = "";
  if (pages <= 1) return;
  const bar = el("nav", "pager");
  bar.setAttribute("aria-label", "페이지 이동");
  const mk = (label, p, dis, act, aria) => {
    const b = el("button", "page-btn" + (act ? " on" : ""));
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-label", aria);
    if (act) b.setAttribute("aria-current", "page");
    if (dis) b.disabled = true; else b.onclick = () => { page = p; render(); };
    bar.appendChild(b);
  };
  mk("‹", page - 1, page <= 0, false, "이전 페이지");
  let s = Math.max(0, page - 4), e = Math.min(pages, s + 9); s = Math.max(0, e - 9);
  for (let p = s; p < e; p++) mk(String(p + 1), p, false, p === page, `${p + 1} 페이지`);
  mk("›", page + 1, page >= pages - 1, false, "다음 페이지");
  wrap.appendChild(bar);
}

// 추가/수정/삭제
// [화면 라벨, 컬럼명, 여러 줄 여부, 도움말(선택), 강조박스 여부(선택)]
// ※ 📌 접수 안내(note)는 «지금 신청 가능한지»를 좌우하므로 긴 본문 칸보다 «위»에 둔다
//    (PC앱 webui/app.js EDIT_FIELDS 와 같은 순서·같은 라벨).
const FIELDS = [
  ["사업명", "name", false], ["담당팀", "team", false], ["담당 연락처", "contact", false],
  ["담당자 이메일", "manager_email", false],
  [NOTE_LABEL + " (비고)", NOTE_KEY, true,
   "접수 마감·재접수 시기 등 지금 신청할 수 있는지에 대한 안내. 입력하면 목록과 시민 앱에 함께 표시됩니다.", true],
  ["지원 대상", "target", true],
  ["사업 내용", "content", true], ["이용 방법", "method", true], ["필요 서류", "documents", true],
];
// 실제로 그릴 입력칸 — note 컬럼이 아직 없으면 그 칸을 통째로 뺀다.
// (없는 컬럼을 payload 에 담으면 PGRST204 로 «저장 자체»가 실패하기 때문)
function editFields() {
  return FIELDS.filter(([, key]) => key !== NOTE_KEY || NOTE_OK);
}
// 저장/삭제 실패 메시지: RLS(권한) 거부면 «재로그인·계정 권한» 안내로 친절하게.
// ───────── 오류 원인 분류 ─────────
// 무료 플랜 일시정지로 클라우드가 통째로 멈췄을 때 화면엔 "불러오기 실패"만 떠서
// 원인 파악이 불가능했던 사고가 있었다 → 연결/권한/미설정을 문구로 구분한다.
//   conn  : 네트워크·서버 미응답(오프라인, fetch 실패, 5xx, 프로젝트 일시정지)
//   perm  : 권한(RLS)·인증 거부
//   setup : 테이블·함수 미생성(스키마 미적용)
//   other : 그 밖
function errKind(error) {
  if (!error) return "other";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "conn";
  const msg = String(error.message || error || "").toLowerCase();
  const code = String(error.code || error.status || "");
  if (error.name === "TypeError" && msg.indexOf("fetch") >= 0) return "conn";
  if (/failed to fetch|networkerror|network error|load failed|timeout|timed out|econnrefused|fetch failed/.test(msg)) return "conn";
  if (/^(5\d\d|0|429)$/.test(code)) return "conn";
  if (/service unavailable|bad gateway|gateway timeout|temporarily unavailable|paused|infrastructure/.test(msg)) return "conn";
  if (code === "42501" || code === "401" || code === "403" ||
      /row-level security|\brls\b|permission|policy|not authorized|violates|jwt|api key/.test(msg)) return "perm";
  if (code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST205" ||
      /does not exist|could not find the (table|function)|schema cache/.test(msg)) return "setup";
  return "other";
}

// 목록 자리에 넣을 오류 안내 HTML(원인별 문구 + 다시 시도 버튼)
function errBoxHtml(error, retryId) {
  const kind = errKind(error);
  const btn = retryId ? `<button id="${retryId}" class="err-retry" type="button">🔄 다시 시도</button>` : "";
  if (kind === "conn") {
    return `<div class="err-box" role="alert">
      <div class="err-title">⏸ 클라우드 서비스가 일시적으로 응답하지 않습니다.</div>
      <div class="err-desc">잠시 후 다시 시도해 주세요.<br>계속되면 인터넷 연결 또는 Supabase 프로젝트 상태를 확인해 주세요.</div>
      ${btn}</div>`;
  }
  if (kind === "perm") {
    return `<div class="err-box" role="alert">
      <div class="err-title">🔒 접근 권한이 없어 불러오지 못했습니다.</div>
      <div class="err-desc">로그인이 만료되었거나 이 계정에 열람 권한이 없습니다.<br>
        «로그아웃» 후 다시 로그인해 보시고, 그래도 안 되면 시스템 담당자에게 계정 권한을 확인해 주세요.</div>
      ${btn}</div>`;
  }
  if (kind === "setup") {
    return `<div class="err-box" role="alert">
      <div class="err-title">🛠 DB 설정이 아직 적용되지 않았습니다.</div>
      <div class="err-desc">필요한 테이블·함수(SQL)를 먼저 적용해 주세요.</div>
      ${btn}</div>`;
  }
  return `<div class="err-box" role="alert">
    <div class="err-title">불러오지 못했습니다.</div>
    <div class="err-desc">${esc(error && error.message ? error.message : "알 수 없는 오류")}</div>
    ${btn}</div>`;
}

// 오류 박스를 그리고 «다시 시도» 버튼에 재조회 함수를 연결
function showLoadError(boxSel, error, retryId, retryFn) {
  const box = $(boxSel);
  if (!box) return;
  box.innerHTML = errBoxHtml(error, retryId);
  const b = $("#" + retryId);
  if (b) b.onclick = retryFn;
  announce(errKind(error) === "conn"
    ? "클라우드 서비스가 일시적으로 응답하지 않습니다."
    : "목록을 불러오지 못했습니다.");
}

function writeErrMsg(error, verb) {
  // 연결 자체가 안 되는 경우를 권한 문제와 구분(원인 오인 방지)
  if (errKind(error) === "conn") {
    return "⏸ 클라우드 서비스가 일시적으로 응답하지 않습니다.\n잠시 후 다시 시도해 주세요.\n(계속되면 인터넷 연결 또는 Supabase 프로젝트 상태를 확인해 주세요.)";
  }
  const msg = (error && error.message ? error.message : "").toLowerCase();
  const code = error && error.code ? String(error.code) : "";
  const isPerm =
    code === "42501" || // insufficient_privilege (Postgres)
    msg.includes("row-level security") ||
    msg.includes("rls") ||
    msg.includes("permission") ||
    msg.includes("policy") ||
    msg.includes("not authorized") ||
    msg.includes("violates");
  if (isPerm) {
    return "⚠️ 저장 권한이 없습니다.\n로그인이 만료되었거나 이 계정에 수정 권한이 없습니다.\n" +
           "«로그아웃» 후 다시 로그인해 보시고, 그래도 안 되면 시스템 담당자에게 계정 권한을 확인해 주세요.";
  }
  return `${verb} 실패: ` + (error && error.message ? error.message : "알 수 없는 오류");
}

function openEdit(r) {
  $("#mTitle").textContent = r ? "✏ 사업 수정" : "➕ 새 사업 추가";
  let html = "";
  editFields().forEach(([label, key, multi, hint, notice]) => {
    const v = r ? (r[key] || "") : "";
    // C8: field-label → <label for> 로 input/textarea id와 연결
    const fid = `f_${key}`, hid = hint ? `h_${key}` : "";
    const aria = hint ? ` aria-describedby="${hid}"` : "";
    html += `<div class="field${notice ? " notice-field" : ""}">` +
      `<label class="field-label" for="${fid}">${label}</label>` +
      (hint ? `<p class="field-hint" id="${hid}">${esc(hint)}</p>` : ``) +
      (multi ? `<textarea id="${fid}" class="form-textarea" data-k="${key}"${aria}>${esc(v)}</textarea>`
             : `<input id="${fid}" class="form-input" data-k="${key}"${aria} value="${esc(v)}">`) + `</div>`;
  });
  html += `<div class="modal-actions"><button id="mSave" class="top-btn solid">💾 저장</button>` +
    (r ? `<button id="mDel" class="top-btn danger">🗑 삭제</button>` : ``) + `</div>`;
  // 📎 필요서류 서식 — 저장된 사업(r)에서만. 새 사업은 먼저 저장해야 키가 생긴다.
  if (r) {
    html += `<div class="forms-section" id="formsSection">
      <div class="field-label">📎 필요서류 서식</div>
      <p class="field-hint">시민이 상세 화면에서 내려받을 서식 파일입니다. 허용: hwp·hwpx·pdf·doc(x)·xls(x)·ppt(x)·jpg·png·zip·txt · 최대 10MB.</p>
      <ul class="forms-list" id="formsList" aria-live="polite"><li class="forms-empty">불러오는 중…</li></ul>
      <div class="forms-upload">
        <input type="file" id="formsFile" class="forms-file"
          accept=".hwp,.hwpx,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.zip,.txt"
          aria-label="등록할 서식 파일 선택">
        <button type="button" id="formsUpload" class="top-btn solid">⬆ 서식 등록</button>
      </div>
      <p class="forms-status" id="formsStatus" role="status" aria-live="polite"></p>
    </div>`;
  }
  $("#mBody").innerHTML = html;
  $("#mSave").onclick = async () => {
    const obj = {};
    document.querySelectorAll("#mBody [data-k]").forEach((e) => { obj[e.dataset.k] = e.value; });
    if (!(obj.name || "").trim()) { announce("사업명을 입력하세요."); alert("사업명을 입력하세요."); const nm = $("#f_name"); if (nm) nm.focus(); return; }
    if (r) {
      // 낙관적 잠금: 내가 연 이후 다른 담당자가 먼저 수정했는지 updated_at으로 확인
      let { data, error } = await sb.from("benefits")
        .update(obj).eq("id", r.id).eq("updated_at", r.updated_at).select();
      // 📌 접수 안내 컬럼이 그사이 사라졌거나 감지가 어긋난 경우 — note 를 빼고 1회만 재시도.
      // (사업 내용 전체가 저장 실패로 날아가는 것보다, 접수 안내만 못 담는 편이 낫다)
      if (error && isMissingNoteColumn(error) && NOTE_KEY in obj) {
        NOTE_OK = false; delete obj[NOTE_KEY];
        ({ data, error } = await sb.from("benefits")
          .update(obj).eq("id", r.id).eq("updated_at", r.updated_at).select());
      }
      if (error) { announce(writeErrMsg(error, "저장")); alert(writeErrMsg(error, "저장")); return; }
      if (!data || !data.length) {
        announce("다른 담당자가 먼저 수정했습니다. 새로고침합니다.");
        alert("⚠️ 다른 담당자가 먼저 이 사업을 수정했습니다.\n최신 내용으로 새로고침하니, 다시 확인 후 수정해 주세요.");
        closeModal($("#modal"));
        await loadBenefits();
        return;
      }
    } else {
      let { error } = await sb.from("benefits").insert(obj);
      if (error && isMissingNoteColumn(error) && NOTE_KEY in obj) {
        NOTE_OK = false; delete obj[NOTE_KEY];
        ({ error } = await sb.from("benefits").insert(obj));
      }
      if (error) { announce(writeErrMsg(error, "저장")); alert(writeErrMsg(error, "저장")); return; }
    }
    closeModal($("#modal"));
    announce("저장되었습니다.");
    await loadBenefits();
  };
  if (r) $("#mDel").onclick = async () => {
    if (!confirm("이 사업을 삭제하시겠습니까?")) return;
    const res = await sb.from("benefits").delete().eq("id", r.id);
    if (res.error) { announce(writeErrMsg(res.error, "삭제")); alert(writeErrMsg(res.error, "삭제")); return; }
    closeModal($("#modal"));
    announce("삭제되었습니다.");
    await loadBenefits();
  };
  if (r) initFormsSection(r);
  openModal($("#modal"));
}

/* ── 📎 필요서류 서식 등록/삭제 (편집 모달 내부) ─────────────────────
   저장소 규약: _workspace/서식스토리지_클라이언트_규약.md
   실제 Storage·테이블 접근은 공용 헬퍼 window.SangjuForms 가 담당.
   forms_storage.sql 미실행이면 listForms 가 조용히 [] → "등록된 서식 없음". */
function fSetStatus(msg, isErr) {
  const el = $("#formsStatus");
  if (el) { el.textContent = msg || ""; el.classList.toggle("err", !!isErr); }
  if (msg) announce(msg);
}
async function refreshFormsList(r) {
  const list = $("#formsList");
  if (!list || !window.SangjuForms) return;
  let rows = [];
  try { rows = await SangjuForms.listForms(r); } catch (e) { rows = []; }
  if (!rows.length) {
    list.innerHTML = `<li class="forms-empty">등록된 서식이 없습니다.</li>`;
    return;
  }
  list.innerHTML = rows.map((row) => {
    const nm = String(row.file_name || "서식");
    const ext = (nm.split(".").pop() || "").toUpperCase();
    const size = SangjuForms.formatSize(row.size);
    const meta = (ext ? ext + " 파일" : "파일") + (size ? " · " + size : "");
    const url = String(row.public_url || "");
    const nameHtml = url
      ? `<a class="forms-item-name" href="${esc(url)}" target="_blank" rel="noopener noreferrer">📄 ${esc(nm)}</a>`
      : `<span class="forms-item-name">📄 ${esc(nm)}</span>`;
    return `<li class="forms-item" data-id="${esc(String(row.id))}">
        <span class="forms-item-main">${nameHtml}<span class="forms-item-meta">${esc(meta)}</span></span>
        <button type="button" class="forms-del" aria-label="${esc(nm)} 서식 삭제">🗑 삭제</button>
      </li>`;
  }).join("");
  // 삭제 버튼 바인딩(행 데이터는 클로저로 잡아둔다)
  const byId = {};
  rows.forEach((row) => { byId[String(row.id)] = row; });
  list.querySelectorAll(".forms-item").forEach((li) => {
    const row = byId[li.dataset.id];
    const btn = li.querySelector(".forms-del");
    if (btn) btn.onclick = async () => {
      if (!confirm(`'${row.file_name}' 서식을 삭제하시겠습니까?`)) return;
      btn.disabled = true;
      fSetStatus("삭제 중…");
      try {
        await SangjuForms.deleteForm(row);
        fSetStatus("서식을 삭제했습니다.");
        await refreshFormsList(r);
      } catch (e) {
        btn.disabled = false;
        const m = (e && e.message) || "삭제에 실패했습니다.";
        fSetStatus(m, true); alert(m);
      }
    };
  });
}
function initFormsSection(r) {
  const fileInput = $("#formsFile");
  const upBtn = $("#formsUpload");
  refreshFormsList(r);
  if (!upBtn || !fileInput) return;
  upBtn.onclick = async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) { fSetStatus("등록할 파일을 선택해 주세요.", true); return; }
    const bad = SangjuForms.validateFile(file);
    if (bad) { fSetStatus(bad, true); alert(bad); return; }
    upBtn.disabled = true;
    fSetStatus("업로드 중…");
    try {
      await SangjuForms.uploadForm(r, file);
      fileInput.value = "";
      fSetStatus("서식을 등록했습니다.");
      await refreshFormsList(r);
    } catch (e) {
      const m = (e && e.message) || "업로드에 실패했습니다.";
      fSetStatus(m, true); alert(m);
    } finally {
      upBtn.disabled = false;
    }
  };
}

/* ============================================================
   🗳 정책제안 관리 (Phase A) — proposals / proposal_reports
   기존 사업관리·로그인·게스트·실시간 무손상. 추가 모듈.
   ============================================================ */
const P_STATUSES = ["접수", "검토중", "반영", "불채택", "보류"];
const REPLY_REQUIRED = new Set(["반영", "불채택"]); // 전환 시 답변/사유 필수
let PALL = [], PCATS = [], P_SELCAT = new Set(), P_STATUS = "전체";
let pSort = "new", pPage = 0, P_LOADED = false;
let P_REPORTS = {}; // proposal_id -> 신고 건수
let pCurrentTab = "benefits";

function bindProposalsUI() {
  // 실시간 알림 띠의 «새로고침» — 목록 갱신은 오직 이 클릭으로만 일어난다
  const rtb = $("#rtBtn"); if (rtb) rtb.onclick = () => { RT_PENDING = 0; syncRtBanners(); loadBenefits(); };
  const prtb = $("#pRtBtn"); if (prtb) prtb.onclick = () => { PRT_PENDING = 0; syncRtBanners(); loadProposals(); };
  const artb = $("#aRtBtn"); if (artb) artb.onclick = () => { ART_PENDING = 0; syncRtBanners(); loadApplications(); };

  // 탭: 클릭 + 좌우/Home/End 화살표 이동(WAI-ARIA tablist 표준 조작).
  // PC앱(webui)과 같은 규약 — 탭바는 Tab 키 «한 번»으로 진입하고(로빙 tabindex),
  // 그 안에서는 화살표로 이동한다. 마우스 없이도 탭을 모두 쓸 수 있게 하는 것이 목적.
  const WHICH = ["applications", "benefits", "proposals"];
  const TABS = [$("#tabApplications"), $("#tabBenefits"), $("#tabProposals")];
  TABS.forEach((t, i) => {
    t.onclick = () => switchTab(WHICH[i]);
    t.addEventListener("keydown", (e) => {
      let j = -1;
      if (e.key === "ArrowRight") j = (i + 1) % TABS.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + TABS.length) % TABS.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = TABS.length - 1;
      if (j < 0) return;
      e.preventDefault();
      TABS[j].focus();
      TABS[j].click();
    });
  });
  $("#pSearch").addEventListener("input", debounce(() => { pPage = 0; renderProposals(); }, 300));
  $("#pSortSel").addEventListener("change", () => { pSort = $("#pSortSel").value; renderProposals(); });
  $("#pmClose").onclick = () => closeModal($("#pModal"));
  $("#pModal").addEventListener("click", (e) => { if (e.target.id === "pModal") closeModal($("#pModal")); });
  // Esc는 공통 트랩(_trapKeydown)에서 처리 — 중복 등록 제거
}

function switchTab(which) {
  pCurrentTab = which;
  // 탭 3종: 신청 접수 · 사업 관리 · 정책제안 관리. 선택된 하나만 보이고 나머지는 숨긴다.
  const MAP = {
    applications: { tab: "#tabApplications", sec: "#secApplications" },
    benefits:     { tab: "#tabBenefits",     sec: "#secBenefits" },
    proposals:    { tab: "#tabProposals",    sec: "#secProposals" },
  };
  Object.keys(MAP).forEach((k) => {
    const on = k === which;
    const t = $(MAP[k].tab), s = $(MAP[k].sec);
    if (t) {
      t.classList.toggle("on", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
      // 로빙 tabindex: 선택된 탭만 Tab 키 순서에 남긴다(탭바 전체가 Tab 한 번으로 진입)
      t.tabIndex = on ? 0 : -1;
    }
    // class(스타일) + hidden 속성(보조기기·검사기) 둘 다 맞춰 준다.
    if (s) { s.classList.toggle("hidden", !on); s.hidden = !on; }
  });
  // 건너뛰기 링크는 유일한 <main id="main"> 으로 고정 — 탭이 바뀌어도 목적지가 항상 유효하다.
  if (which === "proposals" && !P_LOADED) loadProposals();
  if (which === "applications" && !A_LOADED) loadApplications();
}

async function loadProposals() {
  // 공무원은 숨김(is_hidden) 글도 모두 본다 → 필터 없이 전체 조회
  const { data, error } = await sb.from("proposals").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    showLoadError("#pList", error, "pListRetry", loadProposals);
    return;
  }
  PALL = data || [];
  PRT_PENDING = 0; syncRtBanners();    // 새로 불러왔으니 «밀린 알림»도 지운다
  PCATS = [...new Set(PALL.map((r) => r.category).filter(Boolean))].sort();
  P_LOADED = true;
  await loadReportCounts();
  renderPStatusChips();
  renderPCatChips();
  renderProposals();
}

// 신고 건수 집계(신고 확인 표시용). 권한 없으면 조용히 건너뜀.
async function loadReportCounts() {
  P_REPORTS = {};
  try {
    const { data, error } = await sb.from("proposal_reports").select("proposal_id");
    if (error) { return; }
    (data || []).forEach((r) => { P_REPORTS[r.proposal_id] = (P_REPORTS[r.proposal_id] || 0) + 1; });
  } catch (e) { /* 무시 */ }
}

function subscribeProposalsRealtime() {
  sb.channel("proposals-rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "proposals" },
        () => { if (P_LOADED) { PRT_PENDING += 1; syncRtBanners(); } })   // 화면은 그대로, «알림»만
    .subscribe();
}

function renderPStatusChips() {
  const box = $("#pStatusChips"); box.innerHTML = "";
  ["전체", ...P_STATUSES].forEach((st) => {
    const c = el("button", "chip" + (P_STATUS === st ? " on" : ""));
    c.type = "button";
    c.textContent = st;
    c.setAttribute("aria-pressed", P_STATUS === st ? "true" : "false");   // 색만으로 알리지 않음
    c.onclick = () => { P_STATUS = st; pPage = 0; renderPStatusChips(); renderProposals(); };
    box.appendChild(c);
  });
}

function renderPCatChips() {
  const box = $("#pCatChips"); box.innerHTML = "";
  PCATS.forEach((cat) => {
    const c = el("button", "chip" + (P_SELCAT.has(cat) ? " on" : ""));
    c.type = "button";
    c.textContent = cat;
    c.setAttribute("aria-pressed", P_SELCAT.has(cat) ? "true" : "false"); // 색만으로 알리지 않음
    c.onclick = () => { P_SELCAT.has(cat) ? P_SELCAT.delete(cat) : P_SELCAT.add(cat); pPage = 0; renderPCatChips(); renderProposals(); };
    box.appendChild(c);
  });
}

function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s); if (isNaN(d)) return String(s).slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function renderProposals() {
  const q = $("#pSearch").value.trim().toLowerCase();
  let rows = PALL.filter((r) => {
    if (P_STATUS !== "전체" && (r.status || "접수") !== P_STATUS) return false;
    if (P_SELCAT.size && !P_SELCAT.has(r.category)) return false;
    if (q) {
      const blob = `${r.title || ""} ${r.body || ""} ${r.author_nick || ""} ${r.region || ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
  if (pSort === "like") rows.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
  else rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  $("#pCount").textContent = `총 ${rows.length}건`;
  const list = $("#pList");
  if (!rows.length) { list.innerHTML = '<div class="empty">조건에 맞는 제안이 없습니다.</div>'; $("#pPager").innerHTML = ""; return; }

  const pages = Math.ceil(rows.length / PAGE);
  if (pPage >= pages) pPage = pages - 1; if (pPage < 0) pPage = 0;
  const slice = rows.slice(pPage * PAGE, pPage * PAGE + PAGE);
  list.innerHTML = "";
  slice.forEach((r) => {
    const st = r.status || "접수";
    const reps = P_REPORTS[r.id] || 0;
    const card = el("div", "pcard" + (r.is_hidden ? " hidden-row" : ""));
    // C1: 키보드 접근 — 버튼 의미 + Enter/Space + 상태 포함 접근명
    // C9: 이모지 단독 의미(🚩신고/🚫블라인드 등)를 접근명 텍스트로 보강
    const aLabel = [
      `상태 ${st}`,
      r.category ? `분야 ${r.category}` : "",
      r.is_hidden ? "블라인드 처리됨" : "",
      reps ? `신고 ${reps}건` : "",
      `제목 ${r.title || ""}`,
    ].filter(Boolean).join(", ") + " — 검토 열기";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", aLabel);
    card.innerHTML = `<div class="pcard-main">
        <div class="pcard-top">
          <span class="st-badge st-${esc(st)}">${esc(st)}</span>
          ${r.category ? `<span class="cat-tag">${esc(r.category)}</span>` : ""}
          ${r.is_hidden ? `<span class="hide-tag"><span aria-hidden="true">🚫</span> 블라인드</span>` : ""}
          ${reps ? `<span class="report-tag"><span aria-hidden="true">🚩</span> 신고 ${reps}</span>` : ""}
        </div>
        <div class="pcard-title">${esc(r.title)}</div>
        <div class="pcard-meta">
          <span class="like-tag"><span aria-hidden="true">👍</span> 공감 ${r.like_count || 0}</span>
          <span><span aria-hidden="true">🙍</span> ${esc(r.author_nick || "익명")}${r.region ? " · " + esc(r.region) : ""}</span>
          <span><span aria-hidden="true">🗓</span> ${esc(fmtDate(r.created_at))}</span>
        </div>
      </div>`;
    const openIt = () => openProposal(r);
    card.onclick = openIt;
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openIt(); }
    });
    list.appendChild(card);
  });
  renderPPager(rows.length, pages);
}

// 정책제안 목록 페이지 이동 — 위 renderPager 와 동일한 접근성 규약(nav·aria-label·aria-current)
function renderPPager(total, pages) {
  const wrap = $("#pPager"); wrap.innerHTML = "";
  if (pages <= 1) return;
  const bar = el("nav", "pager");
  bar.setAttribute("aria-label", "페이지 이동");
  const mk = (label, p, dis, act, aria) => {
    const b = el("button", "page-btn" + (act ? " on" : ""));
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-label", aria);
    if (act) b.setAttribute("aria-current", "page");
    if (dis) b.disabled = true; else b.onclick = () => { pPage = p; renderProposals(); };
    bar.appendChild(b);
  };
  mk("‹", pPage - 1, pPage <= 0, false, "이전 페이지");
  let s = Math.max(0, pPage - 4), e = Math.min(pages, s + 9); s = Math.max(0, e - 9);
  for (let p = s; p < e; p++) mk(String(p + 1), p, false, p === pPage, `${p + 1} 페이지`);
  mk("›", pPage + 1, pPage >= pages - 1, false, "다음 페이지");
  wrap.appendChild(bar);
}

async function openProposal(r) {
  $("#pmTitle").textContent = "🗳 정책제안 검토";
  const st = r.status || "접수";
  const reps = P_REPORTS[r.id] || 0;
  const optHtml = P_STATUSES.map((s) => `<option value="${s}"${s === st ? " selected" : ""}>${s}</option>`).join("");

  $("#pmBody").innerHTML = `
    <div class="pcard-top mb-10">
      <span class="st-badge st-${esc(st)}">${esc(st)}</span>
      ${r.category ? `<span class="cat-tag">${esc(r.category)}</span>` : ""}
      ${r.is_hidden ? `<span class="hide-tag"><span aria-hidden="true">🚫</span> 블라인드</span>` : ""}
    </div>
    <div class="field"><div class="field-label">제목</div><div class="field-value">${esc(r.title)}</div></div>
    <div class="field"><div class="field-label">작성</div><div class="field-value"><span aria-hidden="true">🙍</span> ${esc(r.author_nick || "익명")}${r.region ? " · " + esc(r.region) : ""} · <span aria-hidden="true">🗓</span> ${esc(fmtDate(r.created_at))} · <span aria-hidden="true">👍</span> 공감 ${r.like_count || 0}</div></div>
    <div class="field"><div class="field-label">내용</div><div class="pm-body-text">${esc(r.body || "")}</div></div>
    ${reps ? `<div class="field"><div class="field-label"><span aria-hidden="true">🚩</span> 신고 ${reps}건</div><div id="pmReports" class="pm-reports" role="status" aria-live="polite">불러오는 중…</div></div>` : ""}
    <div class="field">
      <label class="field-label" for="pmStatus">진행 상태 변경</label>
      <select id="pmStatus" class="st-select">${optHtml}</select>
    </div>
    <div class="field">
      <label class="field-label" for="pmReply"><span aria-hidden="true">💬</span> 담당부서 답변 / 사유 <span class="req-note">(반영·불채택 전환 시 필수)</span></label>
      <textarea id="pmReply" class="form-textarea" placeholder="시민에게 공개되는 공식 답변·사유를 입력하세요.">${esc(r.admin_reply || "")}</textarea>
    </div>
    <div class="field">
      <label class="toggle-line"><input type="checkbox" id="pmHidden"${r.is_hidden ? " checked" : ""}> <span aria-hidden="true">🚫</span> 블라인드(부적절 글 숨김) — 체크 시 시민에게 안 보임</label>
    </div>
    <div class="modal-actions">
      <button id="pmSave" class="nav-btn">💾 저장</button>
    </div>`;

  if (reps) loadReportDetail(r.id);

  $("#pmSave").onclick = async () => {
    const newStatus = $("#pmStatus").value;
    const reply = ($("#pmReply").value || "").trim();
    const isHidden = $("#pmHidden").checked;
    // 반영·불채택 전환 시 답변 필수
    if (REPLY_REQUIRED.has(newStatus) && !reply) {
      const m = `'${newStatus}' 상태로 변경하려면 담당부서 답변/사유를 반드시 입력해야 합니다.`;
      announce(m); alert(m);
      $("#pmReply").focus();
      return;
    }
    const patch = {
      status: newStatus,
      admin_reply: reply || null,
      is_hidden: isHidden,
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("proposals").update(patch).eq("id", r.id);
    if (error) { announce(writeErrMsg(error, "저장")); alert(writeErrMsg(error, "저장")); return; }
    closeModal($("#pModal"));
    announce("정책제안이 저장되었습니다.");
    await loadProposals();
  };

  openModal($("#pModal"));
}

async function loadReportDetail(proposalId) {
  const box = $("#pmReports");
  if (!box) return;
  const { data, error } = await sb.from("proposal_reports")
    .select("reason, created_at").eq("proposal_id", proposalId).order("created_at", { ascending: false });
  if (error) { box.textContent = "신고 내역 조회 권한이 없습니다."; return; }
  if (!data || !data.length) { box.textContent = "신고 내역 없음"; return; }
  box.innerHTML = data.map((x) =>
    `<div class="pm-rep-item">• ${esc(x.reason || "(사유 없음)")} <span class="muted-date">(${esc(fmtDate(x.created_at))})</span></div>`
  ).join("");
}

/* ============================================================
   📥 신청 접수 관리 (「앱 직접 접수(실시간)」 ②단계) — applications
   시민앱 신청이 Supabase 로 «직접» 들어와 여기서 실시간 접수·처리된다.
   공용 헬퍼: window.SangjuApply (apply_client.js). 상태값 4종은 PC와 동일.
   메일(Web3Forms→PC 자동접수) 경로와 «독립» — 이 모듈은 클라우드 접수만 다룬다.
   ============================================================ */
// ⚠ 상태값은 «접수/심사중/승인/반려» 4값(PC config.APPLICATION_STATUSES·SQL CHECK 와 동일)
const A_STATUSES = (window.SangjuApply && SangjuApply.STATUSES) || ["접수", "심사중", "승인", "반려"];
let AALL = [], A_STATUS = "전체", aPage = 0, A_LOADED = false;

function bindApplicationsUI() {
  const s = $("#aSearch");
  if (s) s.addEventListener("input", debounce(() => { aPage = 0; renderApplications(); }, 300));
  const c = $("#amClose"); if (c) c.onclick = () => closeModal($("#aModal"));
  const m = $("#aModal");
  if (m) m.addEventListener("click", (e) => { if (e.target.id === "aModal") closeModal($("#aModal")); });
  // Esc·포커스 트랩은 공통 _trapKeydown 이 처리(중복 등록 없음)
}

async function loadApplications() {
  let data;
  try {
    data = await SangjuApply.listApplications();
  } catch (err) {
    console.error(err);
    // 원인(연결/권한/테이블 미생성)별 안내 + 다시 시도 — 테이블 미실행이어도 앱은 안 깨진다
    showLoadError("#aList", err, "aListRetry", loadApplications);
    $("#aCount").textContent = "";
    $("#aPager").innerHTML = "";
    return;
  }
  AALL = data || [];
  A_LOADED = true;
  ART_PENDING = 0; syncRtBanners();   // 새로 불러왔으니 «밀린 알림»도 지운다
  renderAStatusChips();
  renderApplications();
}

function subscribeApplicationsRealtime() {
  // 시민앱에서 신청하면 즉시 여기로 온다 → 화면을 갈아엎지 않고 «N건» 알림 띠만 올린다.
  if (!window.SangjuApply) return;
  SangjuApply.subscribeApplications(() => {
    if (A_LOADED) { ART_PENDING += 1; syncRtBanners(); }
  });
}

function renderAStatusChips() {
  const box = $("#aStatusChips"); if (!box) return;
  box.innerHTML = "";
  ["전체", ...A_STATUSES].forEach((st) => {
    const c = el("button", "chip" + (A_STATUS === st ? " on" : ""));
    c.type = "button";
    c.textContent = st;
    // 색만으로 필터 상태를 알리지 않도록 접근명에 «선택됨»을 함께 넣는다
    c.setAttribute("aria-pressed", A_STATUS === st ? "true" : "false");
    c.onclick = () => { A_STATUS = st; aPage = 0; renderAStatusChips(); renderApplications(); };
    box.appendChild(c);
  });
}

// 신청일시: 날짜+시각(KST 표시). created_at 은 UTC 이므로 로컬(KST) 로 변환해 보여준다.
function fmtDateTime(s) {
  if (!s) return "";
  const d = new Date(s); if (isNaN(d)) return String(s).slice(0, 16);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderApplications() {
  const list = $("#aList"); if (!list) return;
  const q = ($("#aSearch") ? $("#aSearch").value : "").trim().toLowerCase();
  let rows = AALL.filter((r) => {
    if (A_STATUS !== "전체" && (r.status || "접수") !== A_STATUS) return false;
    if (q) {
      const blob = `${r.benefit_name || ""} ${r.applicant_name || ""} ${r.phone || ""} ${r.receipt_no || ""} ${r.team || ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
  // 최신순(신청일시 내림차순) — listApplications 가 이미 정렬하지만 필터 후에도 유지
  rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  $("#aCount").textContent = `총 ${rows.length}건`;
  if (!rows.length) {
    list.innerHTML = '<div class="empty">조건에 맞는 신청이 없습니다.</div>';
    $("#aPager").innerHTML = "";
    return;
  }

  const pages = Math.ceil(rows.length / PAGE);
  if (aPage >= pages) aPage = pages - 1;
  if (aPage < 0) aPage = 0;
  const slice = rows.slice(aPage * PAGE, aPage * PAGE + PAGE);
  list.innerHTML = "";
  slice.forEach((r) => {
    const st = r.status || "접수";
    const card = el("div", "pcard");
    // 키보드 접근: role=button + Enter/Space. 상태·사업명·신청자를 접근명에 포함(색 의존 금지).
    const aLabel = [
      `상태 ${st}`,
      `사업 ${r.benefit_name || ""}`,
      `신청자 ${r.applicant_name || ""}`,
      r.receipt_no ? `접수번호 ${r.receipt_no}` : "",
    ].filter(Boolean).join(", ") + " — 접수 처리 열기";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", aLabel);
    card.innerHTML = `<div class="pcard-main">
        <div class="pcard-top">
          <span class="st-badge ast-${esc(st)}">${esc(st)}</span>
          ${r.team ? `<span class="cat-tag">${esc(r.team)}</span>` : ""}
          ${r.receipt_no ? `<span class="rc-tag"><span aria-hidden="true">🧾</span> ${esc(r.receipt_no)}</span>` : ""}
        </div>
        <div class="pcard-title">${esc(r.benefit_name || "(사업명 없음)")}</div>
        <div class="pcard-meta">
          <span><span aria-hidden="true">🙍</span> ${esc(r.applicant_name || "")}</span>
          ${r.phone ? `<span><span aria-hidden="true">📞</span> ${esc(r.phone)}</span>` : ""}
          <span><span aria-hidden="true">🗓</span> ${esc(fmtDateTime(r.created_at))}</span>
        </div>
        ${r.memo ? `<div class="pcard-memo"><span aria-hidden="true">💬</span> ${esc(r.memo)}</div>` : ""}
      </div>`;
    const openIt = () => openApplication(r);
    card.onclick = openIt;
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openIt(); }
    });
    list.appendChild(card);
  });
  renderAPager(rows.length, pages);
}

// 신청 접수 페이지 이동 — 정책제안·사업목록과 동일한 접근성 규약(nav·aria-label·aria-current)
function renderAPager(total, pages) {
  const wrap = $("#aPager"); if (!wrap) return;
  wrap.innerHTML = "";
  if (pages <= 1) return;
  const bar = el("nav", "pager");
  bar.setAttribute("aria-label", "페이지 이동");
  const mk = (label, p, dis, act, aria) => {
    const b = el("button", "page-btn" + (act ? " on" : ""));
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-label", aria);
    if (act) b.setAttribute("aria-current", "page");
    if (dis) b.disabled = true; else b.onclick = () => { aPage = p; renderApplications(); };
    bar.appendChild(b);
  };
  mk("‹", aPage - 1, aPage <= 0, false, "이전 페이지");
  let s = Math.max(0, aPage - 4), e = Math.min(pages, s + 9); s = Math.max(0, e - 9);
  for (let p = s; p < e; p++) mk(String(p + 1), p, false, p === aPage, `${p + 1} 페이지`);
  mk("›", aPage + 1, aPage >= pages - 1, false, "다음 페이지");
  wrap.appendChild(bar);
}

async function openApplication(r) {
  $("#amTitle").textContent = "📥 신청 접수 처리";
  const st = r.status || "접수";
  const optHtml = A_STATUSES.map((s) => `<option value="${s}"${s === st ? " selected" : ""}>${s}</option>`).join("");

  $("#amBody").innerHTML = `
    <div class="pcard-top mb-10">
      <span class="st-badge ast-${esc(st)}">${esc(st)}</span>
      ${r.receipt_no ? `<span class="rc-tag"><span aria-hidden="true">🧾</span> ${esc(r.receipt_no)}</span>` : ""}
    </div>
    <div class="field"><div class="field-label">사업명</div><div class="field-value">${esc(r.benefit_name || "")}</div></div>
    <div class="field"><div class="field-label">신청자</div><div class="field-value"><span aria-hidden="true">🙍</span> ${esc(r.applicant_name || "")}${r.phone ? ` · <span aria-hidden="true">📞</span> <a href="tel:${esc((r.phone || "").replace(/[^0-9+]/g, ""))}">${esc(r.phone)}</a>` : ""}</div></div>
    <div class="field"><div class="field-label">담당팀</div><div class="field-value">${esc(r.team || "-")}${r.manager_email ? ` · ${esc(r.manager_email)}` : ""}</div></div>
    <div class="field"><div class="field-label">문의사항</div><div class="pm-body-text">${esc(r.memo || "(없음)")}</div></div>
    <div class="field"><div class="field-label">신청일시</div><div class="field-value"><span aria-hidden="true">🗓</span> ${esc(fmtDateTime(r.created_at))}${r.source ? ` · ${esc(r.source)}` : ""}</div></div>
    <div class="field">
      <label class="field-label" for="amStatus">처리 상태 변경</label>
      <select id="amStatus" class="st-select">${optHtml}</select>
    </div>
    <div class="field">
      <label class="field-label" for="amMemo"><span aria-hidden="true">📝</span> 처리메모(공무원 기록용)</label>
      <textarea id="amMemo" class="form-textarea" placeholder="처리 경과·안내 내용을 기록하세요.">${esc(r.admin_memo || "")}</textarea>
    </div>
    <div class="modal-actions">
      <button id="amDelete" class="nav-btn danger" type="button">🗑 삭제</button>
      <button id="amSave" class="nav-btn" type="button">💾 저장</button>
    </div>`;

  $("#amSave").onclick = async () => {
    const newStatus = $("#amStatus").value;
    const memo = ($("#amMemo").value || "").trim();
    try {
      await SangjuApply.updateApplication(r.id, { status: newStatus, admin_memo: memo || null });
    } catch (err) {
      const m = writeErrMsg(err, "저장");
      announce(m); alert(m); return;
    }
    closeModal($("#aModal"));
    announce("신청 접수가 저장되었습니다.");
    await loadApplications();
  };

  $("#amDelete").onclick = async () => {
    if (!confirm(`이 신청(접수번호 ${r.receipt_no || "-"})을 삭제할까요?\n되돌릴 수 없습니다.`)) return;
    try {
      await SangjuApply.deleteApplication(r.id);
    } catch (err) {
      const m = writeErrMsg(err, "삭제");
      announce(m); alert(m); return;
    }
    closeModal($("#aModal"));
    announce("신청이 삭제되었습니다.");
    await loadApplications();
  };

  openModal($("#aModal"));
}
