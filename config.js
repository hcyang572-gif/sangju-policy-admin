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

// 둘러보기로 들어온 사람의 «계정» 표기. 화면·기록 어디에 남더라도
// 「그냥 담당자」로 보이지 않게 «게스트»라는 사실이 글자로 드러나야 한다.
// ⚠ PC앱 config.py 의 GUEST_ACCOUNT_LABEL 과 글자 단위로 같다.
const GUEST_ACCOUNT_LABEL = "게스트(테스트 둘러보기)";
