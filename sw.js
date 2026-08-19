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
const ASSET_V = "0.4.1";

const CACHE = "sangju-admin-v24";   // v24: 0.4.1 - 배포해도 옛 화면이 남던 캐시 결함 수정 반영, 자원버전 0.4.1, PC앱 접근성 개선과 별개로 공무원앱도 동일 수정 적용

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
  vq("stats.js"),              // 「이달의 접수」 도넛 채우기(시각 레이어)
  vq("a2hs.js"),               // 「홈 화면에 추가」 안내(시각 레이어)
  "manifest.json",
];
// 없어도 화면 골격은 뜨는 자원(그림). 실패해도 설치를 막지 않는다.
const OPTIONAL = [
  "assets/icon-admin-192.png",
  "assets/icon-admin-512.png",
  "assets/icon-admin-maskable-512.png",  // 안드로이드 «잘리는» 아이콘용(안전영역 안쪽에만 그림)
  "assets/sangsang1.png",
  "assets/gotgam.png",
  "assets/slogan-stack.png",   // 2026 시정구호(로그인 화면 · 2줄형)
  "assets/slogan-wide.png",    // 2026 시정구호(앱 헤더 · 1줄형)
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

// 문서 network-first: HTTP 캐시를 건너뛰고(서버 재검증) 받아온다. 실패 시 캐시 폴백.
async function documentFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(new Request(req.url, {
      cache: "no-cache",
      credentials: "same-origin",
      redirect: "follow",
    }));
    if (res && res.ok && res.type === "basic") {
      cache.put(u("index.html"), res.clone());
      cache.put(u("./"), res.clone());
    }
    return res;
  } catch (e) {
    const cached = (await cache.match(req)) || (await cache.match(u("index.html")));
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
