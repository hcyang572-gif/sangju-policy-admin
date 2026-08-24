/* 상주정책(공무원용) — 서비스워커 (PWA 설치 + 오프라인 로딩)
 * 경로는 모두 상대경로(self.registration.scope 기준 = /sangju-policy-mobile/admin/)로 다뤄
 * 시민앱 서비스워커와 캐시·범위가 완전히 분리되도록 CACHE 이름을 다르게 둔다.
 *
 * ═══ v23 에서 고친 «구조적 캐시 결함» (시민앱 v30 과 같은 방식) ═════
 * 증상: 캐시 이름을 올려도 이용자에게 옛 화면이 계속 나온다.
 * 원인: ① GitHub Pages 응답이 Cache-Control: max-age=600 이라 정적 자원이
 *          브라우저 HTTP 캐시에 10분 남는다.
 *       ② 프리캐시가 그 HTTP 캐시를 그대로 타서 «캐시 이름은 새것,
 *          담긴 내용은 옛것» 이 된다. Request 의 {cache:"reload"} 는
 *          일부 브라우저(특히 iOS 사파리)가 무시한다.
 *       ③ index.html 이 cache-first 라 새 HTML 이 영영 안 내려온다.
 * 대책: ① 프리캐시를 «1회용 쿼리(swcb)를 붙여 fetch → 정식 키로 put» 로 바꿔
 *          어떤 브라우저에서도 HTTP 캐시를 확실히 우회한다.
 *       ② 자원 URL 에 배포 버전 쿼리(?v=ASSET_V)를 붙인다.
 *          ⚠ index.html 의 참조 문자열과 아래 목록이 «글자 단위로» 같아야 한다.
 *       ③ 문서(navigate) 요청은 network-first(실패 시 캐시)로 바꿨다.
 * ══════════════════════════════════════════════════════════════════ */
// ⚠ v17: 로그인 필수화(게스트 우회 제거) + 2026 시정구호.
// ⚠ v18: 🔑 비밀번호 변경 화면 추가(index.html·app.js·style.css).
// ⚠ v20: 💬 시민 안내문(citizen_reply) 입력칸 추가(app.js·style.css·apply_client.js).
// ⚠ v22: 확정 디자인 시안 A「감빛 온기」 전면 적용(style.css 팔레트·index.html 브랜드 표기·
//    「이달의 접수」 도넛·tap.js/stats.js/a2hs.js 신설·PWA 아이콘 교체).

// 배포 버전 — 버전정보.json 의 "version" 및 version.js 의 APP_VERSION 과 항상 같은 값.
// ⚠ 손으로 고치지 말고 루트의 `py -3 자원버전_동기화.py` 를 돌리면
//    이 값과 index.html 의 ?v= 쿼리가 한 번에 맞춰진다.
const ASSET_V = "0.7.1";

// v26 사유 (2026-08-19, 🔵손길) — index.html·style.css·app.js 를 «셋 다» 고쳤다.
//   ① 폰(≤599px) «가로 띠» 로그인 배경을 낮춰 아이브로 대비를 4.45 → 5.90:1 로 올림 (style.css)
//   ② 브라우저 기본 confirm() 6곳을 앱 안 확인 창(#askModal)으로 통일 (index.html + app.js)
//   ★ ②는 «마크업(#askModal) 이 있어야만» 새 app.js 가 제대로 동작한다. 캐시 이름을 올리지 않으면
//     설치된 공무원앱이 옛 index.html + 새 app.js 로 짝이 어긋나 확인 창이 기본 confirm() 으로 떨어진다.
// v27 사유 (2026-08-19, 🔵손길) — 로그인 폼 카드의 «그리드 열» 결함 수정 (style.css 만 변경).
//   .login-card / .login-form / .login-field 는 열을 적지 않은 display:grid 라 암시적 열이 auto 였다.
//   auto 열의 최솟값은 «가장 넓은 항목의 내용 폭»이라, 시정구호 <img>(원본 1201px)의 폭이
//   CSS 로 눌리지 않는 순간 열이 1201px 로 벌어지고 width:100% 인 입력칸·로그인 버튼만
//   화면 밖으로 잘려 나갔다(라벨·안내문은 글자가 왼쪽에 남아 멀쩡해 보임).
//   → 세 곳 모두 grid-template-columns:minmax(0,1fr) 로 열을 못 박아 구조적으로 막았다.
//   함께 고친 것 — ESSENTIAL 프리캐시에 icons.js 추가(v0.4.0 부터 빠져 있던 결함),
//   푸터 문구 「오류 문의」→「불편신고」(index.html), version.js 문구를 시민앱 기준으로 통일.
//   ★ 캐시 이름을 반드시 올려야 하는 이유 — 이 결함이 «보이던» 상태가 곧 옛 캐시 상태였다.
//     설치된 공무원앱이 v26 캐시의 옛 style.css 를 계속 쓰면 잘림이 그대로 남는다.
// v28 사유 (2026-08-19, 🔵손길) — index.html·style.css·app.js 를 «셋 다» 고쳤다.
//   ① 헤더에서 「실시간 연결됨」 알약 제거 + 계정 버튼을 제목과 «같은 줄»로 (index.html + style.css + app.js)
//   ② 탭 3개 시각 구분 강화(바탕·테두리·밑줄·굵기 네 가지 단서) + 각 화면 안내문에 탭 이름 (index.html + style.css)
//   ③ 접수 처리 상태 칩: 「전체」를 맨 앞으로, 「처리 대기」 삭제 (app.js)
//   ④ 분야 칩을 «행·열 맞는 격자»로 (index.html + style.css)
//   ⑤ 새 사업 등록에 서식 첨부(저장 시 함께 올림) + 분야 «필수 복수 선택» (app.js + style.css)
//   ⑥ 사업 목록 최신순 정렬 (index.html + app.js)
//   ⑦ 접수 상세에서 시민 첨부파일 열람·내려받기 (app.js + style.css)
//   ★ ①③④⑤ 는 «마크업과 스크립트가 짝»이라야 동작한다. 캐시 이름을 올리지 않으면
//     설치된 공무원앱이 옛 index.html + 새 app.js 로 어긋나 분야 칩·첨부 칸이 그려지지 않는다.
// v29 사유 (2026-08-19) — 접수 처리 화면 «상단 요약» 배치 교정. index.html·style.css·stats.js 셋을 고쳤다.
//   ① 시정방침 위치 교정 + 요약 지표 카드 축소(.top-slogan / .kpi)
//   ② 「이달의 접수」 도넛 카드 오른쪽이 통째로 비던 결함 —
//      도넛 옆에 「접수 많은 사업」·「담당팀별 접수」 요약 카드 두 장을 세워 한 줄을 채웠다.
//      수치는 stats.js 가 이미 들어와 있는 접수 목록에서 «세기»만 한다(지어낸 값 없음).
//      범례도 도넛 «옆»에 서도록 기준폭을 낮춰(260→190px) 카드 높이를 줄였다.
//   ★ 캐시 이름을 반드시 올려야 하는 이유 — 새 순위 카드는 «마크업(#aTopBizList 등) 과 스크립트가 짝»이다.
//     설치된 공무원앱이 옛 index.html + 새 stats.js 를 물면 도넛 옆이 예전처럼 빈 채로 남는다.
//   ★ v31 (2026-08-19) — 요약 카드 「오늘 접수·심사중·이달 승인·이달 반려」를 «눌러서 그 건만 보기».
//     카드가 <div> → <button data-scope> 로 바뀌었고(index.html), 좁혀보기 판정은 stats.js 의
//     window.sjScopes 한 곳에 있으며 app.js 가 그것을 가져다 목록을 거른다.
//     ⚠ 마크업·스크립트가 «짝»이다 — 옛 index.html + 새 app.js 를 물면 카드가 눌리지 않는다.
//        그래서 캐시 이름을 반드시 올린다.
// v32 사유 (2026-08-19, 🔵손길 전수 점검) — style.css·app.js 를 «둘 다» 고쳤다.
//   ① style.css 의 «깨진 주석» 수정 — .field-err 규칙이 CSS 파서에게 통째로 버려지고 있었다.
//      (주석이 한 줄 일찍 닫혀 뒤 두 줄이 본문으로 흘러 선택자가 망가졌다)
//      증상: 「분야를 하나 이상 골라 주세요」 경고가 빨간 상자·왼쪽 띠 없이 맨 글자로만 떴다.
//   ② 모달이 열린 동안 «뒤 본문»이 스크롤되던 결함 — body.modal-open 으로 잠근다(app.js + style.css 짝).
//   ③ esc() 가 홑따옴표를 막지 않던 것 · 서식 링크 href 를 http(s)·상대경로로 한정(app.js).
//   ④ 비밀번호 «변경하기» 단추의 자물쇠 아이콘이 저장 뒤 사라지던 것(app.js).
//   ★ ①②는 «마크업·CSS·스크립트가 짝»이라 캐시 이름을 올리지 않으면 설치된 공무원앱이
//     옛 style.css 를 계속 물어 결함이 그대로 남는다.
// v33 사유 (2026-08-20, 🔵손길 시연 전 전수 점검) — v32 는 «이미 배포됐다»(공개 저장소 커밋
//   a8638a6 「버전 0.4.6 배포」, 2026-08-20 00:13). 그 뒤 app.js·apply_client.js·style.css·
//   index.html 을 또 고쳤는데 캐시 이름이 v32 그대로면, 설치된 공무원앱은 «옛 app.js»를
//   캐시에서 계속 꺼내 쓴다(항목 7 «배포 후 옛 화면 잔존»의 정확한 원인).
//   v32 뒤에 들어간 변경 —
//     ① 실시간이 끊긴 동안 20초 폴백 조회(app.js rtChannelStatus/rtPollTick/bindRtRecovery)
//        ⇒ 시연장 와이파이가 흔들려도 새 접수가 화면에 나타난다. «이것이 안 실리면 시연 사고»다.
//     ② 서식 내려받기 링크의 접근명에 «새 창에서 열림 · 파일형식 · 용량» 포함(app.js)
//     ③ 접수 저장·삭제, 제안 저장, 사업 삭제의 «연타(중복 제출) 방어»(app.js)
//     ④ 표 행의 담당팀 배지가 «…» 없이 뚝 잘리던 것 · 「접수 많은 사업」 줄이 4줄로
//        부풀던 것 · 제목 text-wrap:balance(규격서 §16) (style.css)
//     ⑤ 푸터 버전 대체표기 v0.4.5 → v0.4.6 (index.html)
//   ★ ③④는 «마크업·CSS·스크립트가 짝»이라 캐시 이름을 올리지 않으면 결함이 그대로 남는다.
// v34 사유 (2026-08-20, 🔵손길) — v33 은 «아직 배포되지 않았다». 같은 회차에 아래가 더 들어갔으므로
//   이름을 한 번만 더 올리고 사유를 합쳐 적는다(회차마다 한 칸씩만 올린다).
//   ⛔ ①「눌렀을 때 물방울처럼 퍼지던 파동」을 세 앱에서 «영구 제거»(양호창님 지시).
//        style.css 의 .tap-ripple/::after/@keyframes tapWave 와 tap.js 의 ripple() 을 걷어냈다.
//        남긴 것 — :active 축소(style.css)와 햅틱 vibrate(tap.js). 둘은 «눌렀다»는 되먹임이다.
//   ② 재미·동기부여 3종 — 완료 문구 「… · 오늘 N번째」, 도넛 아래 「오늘 처리 N건」,
//      「심사중」 0건일 때 «다 비웠습니다» + 상상주도 캐릭터(규격서 §14② 결손 보충).
//   ③ 일하는 손을 더는 것 3종 — ⏳ 7일 경과 배지, 📋 접수번호 복사, 머리행 고정(sticky).
//   ④ 큰 기능 4종 — ☑ 여러 건 일괄 상태 변경(확인창·부분실패 보고·건별 감사기록),
//      💬 시민 안내문 상용구 3개, 🏢 담당팀 기억 필터(+항상 뜨는 안내 띠), 🖨 접수 1건 인쇄.
//   ⑤ 🔔 새 접수 소리 알림(계정 메뉴 · ⛔ 기본 꺼짐).
//   ★ ②③④⑤ 는 모두 «마크업(index.html)·CSS·스크립트가 짝»이다 — 캐시 이름을 올리지 않으면
//     설치된 공무원앱이 옛 index.html 에 새 app.js 를 물어 일괄 처리 띠·고르기 칸이 그려지지 않는다.
// v35 사유 (2026-08-20, 🔵손길) — v34 도 «아직 배포 전»이지만 새 «자원 파일»이 하나 늘었으므로
//   반드시 한 칸 더 올린다. 프리캐시 목록이 바뀌면 캐시 이름을 올려야 한다(그것이 이 파일의 규약).
//   ⑥ 📍 읍·면·동 표시·집계 — 접수 목록·상세에 읍·면·동을 보여 주고,
//      「이달의 접수」 요약 패널에 «읍·면·동별 신청 현황» 막대를 더했다.
//      ★ 25개 지역 목록은 JS 에 베끼지 않고 data.json 에서 받는다(build_data.py 196행 규약).
//        → OPTIONAL 에 data.json 이 새로 들어갔다. 이것이 캐시 이름을 올리는 «직접적인» 이유다.
const CACHE = "sangju-admin-v43";   // v43: 0.7.1 — 정책제안 ⓘ 안내 문단 제거.
                                     // v42: 0.7.0 — 신청사업 현황 4열 격자·접수번호 배지 제거,
                                     //   댓글 답글 쓰기 제거, 접기 화살표(⌄↔⌃) 통일, 터치 표적 44px 복구,
                                     //   접근성(명도대비·SVG 아이콘) 개선(app.js·stats.js·style.css·
                                     //   index.html 변경, 2026-08-25 배포).
                                     // v41: 0.6.0 — 헤더 고정(sticky)·정책제안 삭제·25분야, 댓글 실시간 반영,
                                     //   처리방침 §30 파기 조항 신설 등 반영(app.js·stats.js·forms.js·
                                     //   apply_client.js·index.html 변경, 2026-08-24 21시 배포).
                                     // v40: 앱 아이콘 A안 교체 — icon-admin-*-v3.png(2026-08-24, 🔵손길).
//                                    v39: 테스트 모드 «로그인 없이 둘러보기»(2026-08-21, 📱모바일).
// (v38: data.js 사본 프리캐시 — 행정망 .json 차단 대비, 2026-08-21, 📱모바일)
//                                    v37: 요약 카드 색 토큰 + 클릭 좁혀보기 되돌리기(2026-08-21, 🔴검수).
//                <button data-scope>→<div> 로 되돌아가 클릭 바인딩(toggleAScope)이 사라졌다 —
//                옛 index.html(버튼)+새 app.js(바인딩 없음) 조합이면 카드가 눌리지 않는 채 남는다.
// v36: 첨부 파기 규칙 통일 + 알림창 출처 표기 제거(2026-08-20).
//                첨부 삭제 실패 시 접수 삭제도 함께 멈추도록 PC앱 정본에 맞춰 통일하고,
//                admin_audit insert 실패 감지, alert() 출처 노출 제거·모달 배경 inert 처리.
//      v35: 읍·면·동 표시·집계 + data.json 프리캐시
//                + 정책제안 조회를 select("*") → «쓰는 칸만»(P_COLS) 으로 좁힘.
//                  PIN 해시(pin_hash)가 공무원 브라우저까지 딸려 오지 않게 한다.
//                  ⚠ 이 묶음(v30·v31)이 아직 배포 전이라 이름을 또 올리지 않고 사유만 덧붙인다.
// 🟣나루에게 — 상향 요청 (2026-08-19, 🔵손길)
//   배포 시 `py -3 자원버전_동기화.py` 로 ASSET_V·index.html 의 ?v= 도 함께 올려 주세요.
//   (CACHE 이름만 올리면 캐시는 새로 받지만, 브라우저 HTTP 캐시에 남은 ?v=0.4.2 자원이 걸릴 수 있습니다)
//      [0.4.2 예정] documentFirst 가 하위 경로 문서까지 «앱 홈 캐시 키»에 덮어쓰던
//      결함을 시민앱과 대칭으로 수정(루트 문서일 때만 루트 키에 저장). 지금은 하위 페이지가
//      없지만 나중에 생기면 그대로 터지는 잠재 결함이라 미리 막는다.

// scope(예: https://hcyang572-gif.github.io/sangju-policy-mobile/admin/)를 기준으로
// 절대 URL을 만들어 둔다. (서브경로에서도 안전)
const SCOPE = self.registration.scope;
const u = (p) => new URL(p, SCOPE).toString();
// 버전 쿼리를 붙인 경로 — index.html 의 참조와 반드시 같은 문자열이어야 한다.
const vq = (p) => p + "?v=" + ASSET_V;

// 이것이 없으면 앱이 «옛 화면»으로 뜨는 자원 — 반드시 새로 받아야 한다.
const ESSENTIAL = [
  "./",
  "index.html",
  vq("style.css"),
  vq("app.js"),
  vq("config.js"),
  vq("version.js"),
  vq("forms.js"),
  vq("apply_client.js"),
  vq("sw-register.js"),        // CSP 때문에 인라인에서 분리한 서비스워커 등록 코드
  vq("tap.js"),                // 눌림 파동 + 햅틱(시각 레이어)
  vq("icons.js"),              // ★ v27 추가 — v0.4.0 부터 빠져 있던 결함. index.html 이 필수로 부르는데
                               //   목록에 없어, 설치 후 오프라인·불안정망에서 아이콘이 이모지·빈자리로 남았다.
  vq("stats.js"),              // 「이달의 접수」 도넛 채우기(시각 레이어)
  vq("a2hs.js"),               // 「홈 화면에 추가」 안내(시각 레이어)
  "manifest.json",
];
// 없어도 화면 골격은 뜨는 자원(그림). 실패해도 설치를 막지 않는다.
const OPTIONAL = [
  "assets/icon-admin-192-v3.png",
  "assets/icon-admin-512-v3.png",
  "assets/icon-admin-maskable-512-v3.png",  // 안드로이드 «잘리는» 아이콘용(안전영역 안쪽에만 그림)
  "assets/sangsang1.png",
  "assets/gotgam.png",
  "assets/slogan-stack.png",   // 2026 시정구호(2줄형 원본)
  "assets/slogan-wide.png",    // 2026 시정구호(1줄형 · 앱 헤더 + 로그인 폼 면, 둘 다 원색 그대로)
  // 📍 읍·면·동 목록(regions·region_groups·region_etc). 이것이 없으면 «차트만» 빠지고
  //    목록·상세·저장은 그대로 돈다 → ESSENTIAL 이 아니라 여기(OPTIONAL)에 둔다.
  //    ⚠ 이 파일은 시민앱 build_data.py 가 cloudui 에도 «같은 내용»으로 써 준다. 손으로 고치지 말 것.
  "data.json",
  // data.json 과 «같은 내용»의 사본. 행정망(업무망) 프록시가 .json 을 막을 때 app.js 가 대신 읽는다.
  // build_data.py 가 둘을 함께 쓰므로 갈라지지 않는다.
  "data.js",
  // ⚠ assets/slogan-white.png(흰 단색본)은 2026-08-19 화면에서 폐기됐다 — 안 쓰는 파일은 캐시하지 않는다.
  //   공식 상징물의 색을 바꾼 것이라 되살리지 말 것(규격서 §18). 파일·생성기는 남아 있다.
  // 🟣나루 — 이 목록이 바뀌었으니 배포 때 CACHE 이름(버전)을 한 칸 올려 주세요.
];

/* 자원 하나를 «HTTP 캐시를 확실히 우회해» 받아 캐시에 담는다.
 * 받아올 때는 1회용 쿼리(swcb=CACHE)를 붙이고, 담을 때는 그것을 뗀 정식 키로 담는다. */
async function precacheOne(cache, path) {
  const key = u(path);
  const bust = key + (key.includes("?") ? "&" : "?") + "swcb=" + CACHE;
  const res = await fetch(new Request(bust, { cache: "reload", credentials: "same-origin" }));
  if (!res || !res.ok) throw new Error("HTTP " + (res ? res.status : "?"));
  await cache.put(key, res);
  return true;
}

// 설치: 자원을 «네트워크에서 새로» 받아 담는다. 하나가 실패해도 설치는 계속한다.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      let ok = 0, fail = 0;
      await Promise.all(
        ESSENTIAL.map(async (p) => {
          try { await precacheOne(cache, p); ok++; }
          catch (e) { fail++; console.error("[admin-sw] 핵심 자원 프리캐시 실패:", p, e); }
        })
      );
      await Promise.all(
        OPTIONAL.map(async (p) => {
          try { await precacheOne(cache, p); ok++; }
          catch (e) { fail++; console.warn("[admin-sw] 보조 자원 프리캐시 실패(무시):", p, e); }
        })
      );
      console.log("[admin-sw] " + CACHE + " 프리캐시 완료 — 성공 " + ok + " · 실패 " + fail);
      await self.skipWaiting();
    })()
  );
});

// 활성화: 이 앱의 현재 캐시(CACHE) 외 '관리자' 옛 캐시만 정리.
// 시민앱 캐시(sangju-*)는 같은 origin이라도 건드리지 않는다(앱 분리).
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("sangju-admin-") && k !== CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// 메시지: 새 워커 즉시 적용 요청 처리
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// fetch: 크롬 설치조건 충족을 위해 핸들러 등록.
//  - GET 이외 / 타 출처(Supabase·CDN 등) 요청은 가로채지 않고 통과(네트워크 그대로).
//  - 이 서비스워커는 자신의 scope(/admin/) 하위만 제어한다(브라우저 기본 동작).
//  - 문서(navigate): network-first (최신 HTML 우선) + 실패 시 캐시 폴백.
//  - 그 외 동일 출처 정적 자원: cache-first (?v= 쿼리로 배포마다 URL 이 달라짐).
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // 동일 출처가 아니면(Supabase API·CDN 등) 그대로 네트워크로 통과
  if (url.origin !== self.location.origin) return;

  // 화면(HTML) — 항상 최신 우선
  if (req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html")) {
    event.respondWith(documentFirst(req));
    return;
  }

  // 정적 자원 — cache-first
  event.respondWith(cacheFirst(req));
});

// 이 앱의 «루트 문서»인지 판별한다 — documentFirst 가 루트 키에 캐시해도 되는 경우.
// ⚠ scope 아래에는 루트 말고도 «/» 로 끝나는 다른 페이지가 있다(예: 시민앱 안내 페이지 /start/).
//    fetch 라우팅은 pathname.endsWith("/") 만 보므로 그런 페이지도 documentFirst 를 탄다.
//    예전엔 성공 응답을 무조건 u("index.html")·u("./") 에 넣었는데, 그러면 이용자가
//    /start/ 를 한 번만 열어도 «앱 홈의 캐시된 HTML 이 안내 페이지로 덮어써져»
//    오프라인·불안정 네트워크에서 앱 홈에 안내 페이지가 뜬다(카톡 공유 경로에서 흔함).
//    → 루트일 때만 루트 키에 담고, 하위 페이지는 «아예 담지 않는다»(프리캐시 대상도 아님).
//    이 조건을 «성공하면 무조건 캐시»로 단순화하지 말 것.
const SCOPE_PATH = new URL(SCOPE).pathname;
function isAppRoot(href) {
  try {
    const p = new URL(href).pathname;
    return p === SCOPE_PATH || p === SCOPE_PATH + "index.html";
  } catch (e) {
    return false;
  }
}

// 문서 network-first: HTTP 캐시를 건너뛰고(서버 재검증) 받아온다. 실패 시 캐시 폴백.
async function documentFirst(req) {
  const cache = await caches.open(CACHE);
  const root = isAppRoot(req.url);          // 루트 문서일 때만 루트 키를 건드린다
  try {
    const res = await fetch(new Request(req.url, {
      cache: "no-cache",
      credentials: "same-origin",
      redirect: "follow",
    }));
    if (res && res.ok && res.type === "basic" && root) {
      cache.put(u("index.html"), res.clone());
      cache.put(u("./"), res.clone());
    }
    return res;
  } catch (e) {
    // 루트가 아닌 문서(/start/ 등)는 «자기 URL 로 담긴 것만» 폴백한다.
    // 앱 홈 HTML 을 대신 내주면 주소는 /start/ 인데 내용은 앱인 «가짜 화면»이 된다.
    const cached = (await cache.match(req)) || (root ? await cache.match(u("index.html")) : null);
    if (cached) return cached;
    throw e;
  }
}

// cache-first: 캐시에 있으면 즉시 반환, 없으면 네트워크 후 캐시에 보관
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
    return res;
  } catch (e) {
    if (req.mode === "navigate") {
      const fallback = await cache.match(u("index.html"));
      if (fallback) return fallback;
    }
    throw e;
  }
}
