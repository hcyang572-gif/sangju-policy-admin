// Supabase 연결 설정 (anon key = 공개용, RLS로 보호됨)
const SUPABASE_URL = "https://nalpuhtdruovzulcagtj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hbHB1aHRkcnVvdnp1bGNhZ3RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxODk2MjIsImV4cCI6MjA5Nzc2NTYyMn0.hBALnDwobaCMlbaW-ANhG1Uwjf5eNcNxWed11b7mY2M";

// ── 🧪 테스트 기간 «둘러보기(로그인 없이 진입)» 스위치 ──────────────────────
// 아직 정식 서비스가 아닌 시범·시연 기간 동안만 로그인 화면에 «둘러보기(테스트)»
// 버튼을 내보낸다. 정식 서비스로 넘어갈 때는 «이 한 줄만» false 로 바꾸면
// 버튼도, 게스트 진입 통로도 함께 닫힌다(다른 파일은 손댈 필요가 없다).
// ⚠ PC앱 config.py 의 TEST_MODE_ALLOW_GUEST 와 «같은 뜻·같은 이름»이다. 함께 내린다.
//
// 둘러보기로 들어온 사람이 할 수 있는 일 (권한 수준 = 일반 담당자, 읽기만)
//   · 볼 수 있다 : 사업 목록·상세, 시민 정책제안
//   · 볼 수 없다 : 신청 접수 목록(시민의 이름·연락처가 든 개인정보라 서버가 막는다)
//   · 못 한다   : 저장·수정·삭제 일체, 계정 관리·비밀번호 변경
// ★ 화면에서 감추는 것은 «안내»일 뿐이고, 실제 차단은 Supabase RLS 가 한다
//   (로그인하지 않은 접속은 applications 를 읽지도 쓰지도 못한다).
const TEST_MODE_ALLOW_GUEST = true;

/* ── 🧪 둘러보기로 들어온 사람이 «저장»까지 할 수 있는가 ────────────────────
   2026-08-25 양호창님 —
     「시연 및 테스트를 위해서 비로그인으로 접속하더라도 **삭제기능들을 제외하고는**
      대부분의 기능을 모두 둘러볼 수 있어야 해.」
   그 지시를 담는 스위치다. true 로 바꾸면 —
     · 열린다 : 새 사업 올리기 · 사업/제안/접수 저장 · 서식 등록 · 일괄 상태 변경 · 댓글 감추기
     · 막힌다 : 삭제 «전부»(사업·접수·제안·서식·댓글) + 계정 관리·비밀번호 변경
       ⛔ 삭제는 이 스위치와 «무관하게» 언제나 막힌다. app.js guestNoDelete() 참조.

   ⛔⛔ 지금 false 인 까닭 — 서버가 아직 허락하지 않는다 (2026-08-25 실측)
     이 앱은 브라우저에서 **anon 키**로 서버에 말한다. 실제 응답으로 확인한 결과,
     지금 서버는 anon 의 쓰기를 표마다 «전부» 회수해 두었다 —
         benefits / proposals / applications / proposal_comments / admin_audit
         → INSERT·UPDATE·DELETE 모두 HTTP 401 · 42501 permission denied
     이 상태에서 단추만 열면 게스트가 저장을 누를 때마다 서버가 거절한다.
     그것은 이 저장소가 가장 경계하는 「눌러 봐야 실패하는 단추」다.
     그래서 서버가 열리기 전까지는 false 로 두고, 왜 없는지를 화면에 글자로 말한다.

   ⇒ 켜는 절차 (양호창님 · Supabase 대시보드)
     ① 🩷자물쇠(security-privacy)와 함께 «어디까지 열지»를 정한다.
        ⚠ applications 는 시민의 이름·연락처가 든 표다. anon 에게 UPDATE 를 주면
          인터넷의 누구나 그 값을 고칠 수 있게 된다 — 시연 편의와 맞바꿀 것인지
          반드시 판단이 필요하다(지금 진행 중인 「익명조회 닫기」와 정반대 방향이다).
        ※ 더 안전한 대안 : 둘러보기를 anon 이 아니라 «시연 전용 계정»으로 로그인시키면
          RLS 의 authenticated 정책이 그대로 적용되어 표 권한을 손댈 필요가 없다.
     ② 정한 만큼 GRANT 를 넣는다.
     ③ 이 줄을 true 로 바꾸고 배포한다. 화면 코드는 손댈 필요가 없다.
   ⚠ PC앱(config.py)에는 이 스위치가 필요 없다 — 파이썬이 관리자 전용 키(service-role)로 말해
     RLS 를 지나가므로, 같은 지시라도 그쪽은 곧바로 열린다. */
const TEST_MODE_GUEST_CAN_WRITE = true;

/* ── 🧪 둘러보기가 «시연 전용 계정»으로 로그인할지 ────────────────────────
   2026-08-25 — anon 키로는 서버가 쓰기를 전부 막으므로(위 설명), 저장까지 시연하려면
   «진짜 계정»으로 들어가는 편이 안전하고 깔끔하다. 표 권한(GRANT)을 인터넷 전체에
   열지 않아도 되기 때문이다 — RLS 의 authenticated 정책이 그대로 적용된다.

   ⛔⛔ 값이 비어 있으면 «옛날 그대로» anon 둘러보기로 들어간다. 그것이 기본이고 정상이다.
     양호창님이 대시보드에서 계정을 만드시기 «전»에는 여기를 비워 두어야 한다.
     아래 두 값을 채우고 TEST_MODE_GUEST_CAN_WRITE 를 true 로 바꾸면 저장까지 열린다.

   ⭐⭐ 절대 조건 (2026-08-25 양호창님)
     「시연과 테스트를 위해서 게스트모드로 비로그인 접속은 그대로 잘 돌아가야 해.」
     → 계정이 없든, 비밀번호가 틀렸든, 서버가 답을 안 하든 —
       둘러보기는 «어떤 경우에도» 들어가지고 목록·상세·통계가 보여야 한다.
       그래서 app.js tryGuestSignIn() 은 실패를 삼키고 조용히 anon 으로 내려앉는다.
       ⛔ 그 폴백을 「로그인 실패했습니다」로 바꿔 진입을 막지 마세요 —
          시연이 그 자리에서 끝납니다.

   ⚠ 비밀번호가 이 파일에 «그대로» 적힌다. 이 저장소는 공개(public)이므로
     반드시 «시연 전용·가짜 자료만 든» 계정이어야 하고, 담당자 계정을 쓰면 안 된다.
     실서비스 전환 때는 TEST_MODE_ALLOW_GUEST 와 함께 이 값도 비운다.
   ⚠ 이메일을 바꾸면 supabase/둘러보기_계정_260825.sql 의 guest_account_email() 도
     «같은 값»으로 바꿔야 한다(서버가 이 계정을 알아보는 기준이다). */
/* ⛔⛔⛔ 여기 아래 두 줄에 «시연 계정의 아이디와 비밀번호»가 그대로 적혀 있습니다.
     이 저장소(sangju-policy-admin)는 **공개(public)** 이고, 배포되면
     https://hcyang572-gif.github.io/sangju-policy-admin/config.js 주소로
     **누구나 브라우저에서 그대로 읽을 수 있습니다.** 숨겨지지 않습니다.

   그래서 이 계정은 반드시 다음 조건을 지켜야 합니다 —
     · 오직 «시연·시험용»이며, 들어 있는 자료가 전부 가짜일 때만 쓴다.
     · 담당자 계정·개인 계정을 절대 여기에 적지 않는다.
     · 삭제 권한이 없다(서버 정책 _guest_no_delete + 화면 guestNoDelete).

   ⭐⭐ 실서비스 전환 «전에» 반드시 할 일 (2026-08-25 · 빠트리면 사고입니다)
     ① Supabase 대시보드에서 이 시연 계정을 **삭제**한다.
     ② 아래 두 줄의 값을 **빈 문자열로 되돌린다**(그러면 anon 둘러보기로 내려앉는다).
     ③ TEST_MODE_ALLOW_GUEST 와 TEST_MODE_GUEST_CAN_WRITE 를 **false** 로 내린다.
     ④ 배포해서 공개본에서도 값이 사라진 것을 눈으로 확인한다.
     ⚠ 값을 지우기만 하고 계정을 안 지우면, 옛 배포본을 받아 둔 사람이 그대로 쓸 수 있습니다.
        ①과 ②는 «둘 다» 해야 합니다. */
const GUEST_LOGIN_EMAIL = "demo-guest@sangju-policy-demo.kr";
const GUEST_LOGIN_PASSWORD = "scoop8184!";

// 둘러보기로 들어온 사람의 «계정» 표기. 화면·기록 어디에 남더라도
// 「그냥 담당자」로 보이지 않게 «게스트»라는 사실이 글자로 드러나야 한다.
// ⚠ PC앱 config.py 의 GUEST_ACCOUNT_LABEL 과 글자 단위로 같다.
const GUEST_ACCOUNT_LABEL = "게스트(테스트 둘러보기)";
