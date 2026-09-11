// ============================================================
//  SOLUTION ARCHIVE — AI Office 설정
// ============================================================
//  이 파일은 SolutionArchive 리포에서 실제로 도는 워크플로(Claude Code
//  서브에이전트 루프 + GitHub Actions 무인 크론 4종 + 파이프라인들)를
//  ai-office 픽셀 오피스 포맷에 맞게 12개 부서로 옮겨 적은 것이다.
//  부서 task/report 문구는 CLAUDE.md·HANDOVER-LOG·이번 세션에서 실제로
//  관찰한 동작을 근거로 썼다 — 지어낸 기능은 없다.
//
//  ⚠️ 딱 2가지 규칙
//   1. 부서 id는 절대 바꾸지 마세요. 시뮬레이션 엔진이 이 id로 움직입니다.
//      → 바꿔도 되는 건 name(부서 이름) · icon · short 입니다.
//   2. 부서는 12개를 유지하세요. 사무실 배치가 4열 3행 = 12칸 고정입니다.
// ============================================================

/** 회사 기본 정보 */
export const COMPANY = {
  name: "SOLUTION ARCHIVE",
  logoLetter: "S",
  titlePrefix: "솔루션아카이브",
  titleAccent: "AI Office",
  pageTitle: "SolutionArchive — AI 에이전트 오피스",
  description:
    "기획→구현→검증→자가수정→보고까지 도는 Claude Code 서브에이전트 루프와 4개 무인 크론(CMO 데일리·인사이트·리뷰수집·노션피드백)이 실제로 하는 일을 부서로 옮긴 픽셀 오피스",
  windowLabel: "solution_archive.exe — 대표실",
  reportName: "SOLUTION ARCHIVE",
} as const;

/** 대표 — 최종 승인·머지 권한을 쥔 사람 */
export const CEO_PROFILE = {
  name: "남헌",
  callsign: "대표님",
  role: "대표 · 최종 승인 · 머지 권한 단독 보유",
  hair: "#42283a",
  shirt: "#ff8fc0",
  accent: "#fff3b0",
  skin: "#ffdcc4",
  thoughts: [
    "머지는 내가 직접 한다 — 에이전트는 PR까지만.",
    "확인 불가를 정상으로 보고하면 안 돼.",
    "안전장치 걸린 걸 성공으로 읽지 마라.",
  ],
};

/**
 * 부서 12개 — 왼쪽 6개는 기능 개발 루프(architect→implementer→qa→debugger→
 * reporter), 오른쪽 6개는 실제 도는 무인 크론·파이프라인이다.
 */
export const DEPARTMENTS = [
  {
    id: "research",
    name: "기획·설계팀",
    short: "architect.plan",
    icon: "📐",
    task: "기능 의도 → 영향범위·스키마안·수용기준(AC)·리스크등급",
    report: "🔴 리스크면 여기서 멈추고 승인부터 받아요.",
  },
  {
    id: "brand",
    name: "구현팀",
    short: "implementer.dev",
    icon: "🛠️",
    task: "feat/* 브랜치에 구현 + 비파괴 마이그레이션",
    report: "main엔 직접 안 건드려요. 브랜치에서만.",
  },
  {
    id: "strategy1",
    name: "QA 검증팀",
    short: "qa.verify",
    icon: "🔍",
    task: "preview 실측 검증 — 상태코드만으로 판정 안 함",
    report: "확인 불가·0건·정상을 절대 안 섞어요.",
  },
  {
    id: "qa",
    name: "디버깅팀",
    short: "debugger.fix",
    icon: "🩹",
    task: "FAIL 로그 → 근본원인 진단 → 패치 → 재검증 요청",
    report: "증상만 지우지 않고 원인부터 봐요.",
  },
  {
    id: "strategy2",
    name: "보고팀",
    short: "reporter.brief",
    icon: "📝",
    task: "CTO 관점 요약 — 변경·리스크등급·승인요청",
    report: "절대 스스로 머지 안 해요. 승인만 요청.",
  },
  {
    id: "reels",
    name: "CMO 데일리팀",
    short: "cmo-daily.loop",
    icon: "📣",
    task: "매일 UTC 20:17 — 콘텐츠 초안·케이스 적립 10스텝",
    report: "draft/pending_review로만 쌓아요. 발행은 안 해요.",
  },
  {
    id: "carousel",
    name: "인사이트팀",
    short: "insight.loop",
    icon: "💡",
    task: "매일 UTC 18:41 — ingest·analyze·patternize·measure·reflect",
    report: "패턴은 원 관측 키로, 도메인 추정 아니에요.",
  },
  {
    id: "partner",
    name: "리뷰수집팀",
    short: "review.collect",
    icon: "⭐",
    task: "매일 UTC 17:37 — 다나와·앱스토어·HN 리뷰 파싱",
    report: "안전장치(상한·조기종료) 걸리면 정상이 아니라 확인 대상이에요.",
  },
  {
    id: "finance",
    name: "노션연동팀",
    short: "notion.sync",
    icon: "🔗",
    task: "매일 UTC 12:07 — 노션 피드백 pull/push 동기화",
    report: "읽지 못한 규칙은 허용이 아니라 판단 불가로 처리해요.",
  },
  {
    id: "review",
    name: "케이스스터디팀",
    short: "case.study",
    icon: "📚",
    task: "무브 단위로 케이스 적립 — 전부 draft로만",
    report: "승인·등급변경은 사람만 해요. 자동 승인 경로는 없어요.",
  },
  {
    id: "ops",
    name: "콘텐츠발행팀",
    short: "threads.draft",
    icon: "✍️",
    task: "브랜드별 writing-protocol 기반 초안 생성",
    report: "발행 API는 아예 안 써요 — 사람이 직접 눌러요.",
  },
  {
    id: "secretary",
    name: "경쟁분석팀",
    short: "analyze.pipe",
    icon: "📊",
    task: "경쟁사 리뷰·앵글 추출 → 검수 큐",
    report: "모든 팀 상태를 모아 대표가 결정할 것만 추려요.",
  },
] as const;

/**
 * 직원 명단. 리드는 그 루프/파이프라인을 대표하는 이름(가능하면 실제
 * git author·워크플로 이름에서 따옴), 멤버는 그 안의 하위 단계.
 */
/** 위 DEPARTMENTS 에 실제로 존재하는 부서 id 만 허용한다 */
export type DeptId = (typeof DEPARTMENTS)[number]["id"];

export type StaffEntry = {
  dept: DeptId;
  rank: "lead" | "member";
  name: string;
  role: string;
  colors: [string, string, string];
  thoughts: string[];
  callsign?: string;
};

export const STAFF_LIST: StaffEntry[] = [
  // ① 기획·설계팀 (architect)
  { dept: "research", rank: "lead", name: "Architect", role: "기획·설계 서브에이전트", callsign: "설계AI",
    colors: ["#6b3d34", "#fff3b0", "#ff8fc0"],
    thoughts: ["코드는 안 써요. 영향범위부터 그려요.", "스키마 변경은 최소화 — 뷰보다 읽기 전용을 먼저.", "AC는 PASS/FAIL을 실제로 뭘로 판정하는지까지 씁니다."] },
  { dept: "research", rank: "member", name: "실측 담당", role: "존재·도달 확인",
    colors: ["#2f2a3d", "#c9b8ff", "#b8f0dd"],
    thoughts: ["MCP가 다른 프로젝트를 보고 있진 않은지 먼저 확인.", "테이블 없음과 0건은 다른 사건이에요."] },

  // ② 구현팀 (implementer)
  { dept: "brand", rank: "lead", name: "Implementer", role: "구현 서브에이전트", callsign: "구현AI",
    colors: ["#372b4a", "#c9b8ff", "#c9b8ff"],
    thoughts: ["main엔 손 안 대요. feat/* 브랜치에서만.", "새 의존성 필요하면 먼저 알려요.", "AC 하나하나 직접 실행해서 확인합니다."] },
  { dept: "brand", rank: "member", name: "마이그레이션 담당", role: "비파괴 스키마 변경",
    colors: ["#3c3a4f", "#ffe6f2", "#c9b8ff"],
    thoughts: ["파괴적 변경은 여기서 안 해요.", "적용은 사람 몫 — 파일만 만들어요."] },

  // ③ QA 검증팀 (qa-verifier)
  { dept: "strategy1", rank: "lead", name: "QA Verifier", role: "preview 검증 서브에이전트", callsign: "검증AI",
    colors: ["#c26e4b", "#ff8fc0", "#fff3b0"],
    thoughts: ["HTTP 200은 시작일 뿐, 내용 표지까지 봐요.", "Vercel·Supabase 로그도 같이 수집합니다."] },
  { dept: "strategy1", rank: "member", name: "로그 수집 담당", role: "런타임 로그 대조",
    colors: ["#7b4a2f", "#b8f0dd", "#ff8fc0"],
    thoughts: ["에러 없다고 존재 확인 끝난 거 아니에요.", "count===null 도 확인 불가로 봐요."] },

  // ④ 디버깅팀 (debugger)
  { dept: "qa", rank: "lead", name: "Debugger", role: "근본원인 진단 서브에이전트", callsign: "디버그AI",
    colors: ["#2d4b46", "#b8f0dd", "#b8f0dd"],
    thoughts: ["증상만 지우는 패치는 안 해요.", "QA랑 최대 4회전, 그 이상이면 에스컬레이션."] },
  { dept: "qa", rank: "member", name: "재현 담당", role: "실패 재현·격리",
    colors: ["#463227", "#ffe6f2", "#b8f0dd"],
    thoughts: ["안전장치가 걸렸으면 그 안쪽부터 봐요.", "부품 테스트 통과가 통합 근거는 아니에요."] },

  // ⑤ 보고팀 (reporter)
  { dept: "strategy2", rank: "lead", name: "Reporter", role: "CTO 관점 보고 서브에이전트", callsign: "보고AI",
    colors: ["#8b534a", "#fff3b0", "#ff8fc0"],
    thoughts: ["절대 제가 머지하지 않아요.", "리스크등급이랑 근거를 같이 씁니다."] },
  { dept: "strategy2", rank: "member", name: "요약 담당", role: "변경 요약·스크린샷",
    colors: ["#33304a", "#ff8fc0", "#b8f0dd"],
    thoughts: ["넓은 표 대신 항목당 한 줄로.", "PR 링크는 꼭 남겨요."] },

  // ⑥ CMO 데일리팀 (daily-cmo-loop.yml)
  { dept: "reels", rank: "lead", name: "cmo-daily-bot", role: "CMO 데일리 루프", callsign: "CMO봇",
    colors: ["#2c2638", "#ff8fc0", "#ff8fc0"],
    thoughts: ["매일 UTC 20:17, 10스텝 돌아요.", "dry-run은 성과 숫자에서 빼요."] },
  { dept: "reels", rank: "member", name: "케이스 적립 담당", role: "case_studies INSERT(draft만)",
    colors: ["#4a3a2a", "#fff3b0", "#b8f0dd"],
    thoughts: ["전부 review_status=draft로만 들어가요.", "자동 승인 경로는 존재하지 않아요."] },

  // ⑦ 인사이트팀 (nightly-insight-loop.yml)
  { dept: "carousel", rank: "lead", name: "insight-loop-bot", role: "나이틀리 인사이트 루프", callsign: "인사이트봇",
    colors: ["#d88d68", "#c9b8ff", "#c9b8ff"],
    thoughts: ["매일 UTC 18:41 — 5단계 돌아요.", "등급은 도메인 추정 말고 원 관측 키로."] },
  { dept: "carousel", rank: "member", name: "패턴화 담당", role: "patternize·reflect",
    colors: ["#3a2f4d", "#ffe6f2", "#ff8fc0"],
    thoughts: ["반복할 패턴 1개, 중단할 패턴 1개.", "측정 안 된 패턴은 승격 안 해요."] },

  // ⑧ 리뷰수집팀 (nightly-review-collect.yml)
  { dept: "partner", rank: "lead", name: "review-collect-bot", role: "나이틀리 리뷰 수집", callsign: "리뷰봇",
    colors: ["#563a32", "#b8f0dd", "#b8f0dd"],
    thoughts: ["매일 UTC 17:37 — 다나와·앱스토어·HN.", "상한에 걸렸으면 몇 페이지째인지 같이 남겨요."] },
  { dept: "partner", rank: "member", name: "robots.txt 담당", role: "수집 허용범위 확인",
    colors: ["#452d3f", "#c9b8ff", "#fff3b0"],
    thoughts: ["robots.txt 못 받으면 허용이 아니라 판단 불가예요.", "그럴 땐 안 가요."] },

  // ⑨ 노션연동팀 (nightly-notion-feedback.yml)
  { dept: "finance", rank: "lead", name: "notion-sync-bot", role: "나이틀리 노션 피드백", callsign: "노션봇",
    colors: ["#313b56", "#fff3b0", "#fff3b0"],
    thoughts: ["매일 UTC 12:07 스케줄 활성이에요.", "발행본 마커 이전/이후를 구분해서 읽어요."] },
  { dept: "finance", rank: "member", name: "diff 기록 담당", role: "notion_sync_log 적재",
    colors: ["#4b3b2c", "#b8f0dd", "#c9b8ff"],
    thoughts: ["pushed/pulled 시각을 같이 남겨요.", "diff_status로 뭐가 바뀌었는지 추적해요."] },

  // ⑩ 케이스스터디팀
  { dept: "review", rank: "lead", name: "case-study-bot", role: "케이스 적립·근거등급", callsign: "케이스봇",
    colors: ["#9c5c72", "#ff8fc0", "#ff8fc0"],
    thoughts: ["등급은 도메인 말고 원 관측 키로 매겨요.", "regrade는 근거에서 계산 — 그래도 실행은 사람이."] },
  { dept: "review", rank: "member", name: "근거 수집 담당", role: "case_evidence 적재",
    colors: ["#2e3a4a", "#ffe6f2", "#b8f0dd"],
    thoughts: ["무브 단위로 쪼개서 남겨요.", "승인은 제 권한 밖이에요."] },

  // ⑪ 콘텐츠발행팀 (Threads 엔진)
  { dept: "ops", rank: "lead", name: "content-draft-bot", role: "브랜드별 초안 생성", callsign: "콘텐츠봇",
    colors: ["#3b3b49", "#b8f0dd", "#b8f0dd"],
    thoughts: ["writing-protocol 기반으로만 써요.", "발행 API 자체가 환경에 없어요 — 사람이 눌러요."] },
  { dept: "ops", rank: "member", name: "성과 수집 담당", role: "collect-metrics·collect-replies",
    colors: ["#573049", "#fff3b0", "#ff8fc0"],
    thoughts: ["연결 안 된 걸 연결됐다고 표시 안 해요.", "지연된 수집은 따로 표시해요."] },

  // ⑫ 경쟁분석팀 (app/analyze 파이프라인)
  { dept: "secretary", rank: "lead", name: "analyze-pipeline-bot", role: "경쟁사 리뷰·앵글 추출", callsign: "분석봇",
    colors: ["#7a453c", "#c9b8ff", "#c9b8ff"],
    thoughts: ["추출된 앵글은 검수 큐로 먼저 보내요.", "대표가 결정할 것만 추려서 올려요."] },
  { dept: "secretary", rank: "member", name: "검수 담당", role: "angle review",
    colors: ["#334a3a", "#ffe6f2", "#fff3b0"],
    thoughts: ["막힌 건 먼저 보고해요.", "중복 설명은 다 지워요."] },
];

/**
 * 외부 연동을 아직 안 붙인 팀 → 화면에 "연동 대기"로 표시됩니다.
 * 키는 부서 id, 값은 "무엇을 기다리는지"를 사람 말로 적은 한 줄.
 *
 * 지금은 비어 있다 — 12개 팀 중 연동 대기로 확정된 팀이 없다는 뜻이고,
 * 그래서 화면·보고서 어디에도 "연동 대기" 행이 뜨지 않는다.
 * 엔진(app/game/sim.ts)의 차단 부서 목록과 사유는 전부 이 객체에서 유도되므로,
 * 대기 팀이 생기면 여기 한 줄만 추가하면 된다.
 *   예) research: "설계 참조용 Notion DB 연결 대기",
 */
export const PENDING_INTEGRATIONS: Record<string, string> = {};

/**
 * 하루 시나리오 문구. 엔진(app/game/sim.ts)은 흐름만 돌리고,
 * 화면에 보이는 단계 이름·대사·로그는 전부 여기서 읽는다.
 * 부서가 실제로 하는 일을 바꾸고 싶으면 DEPARTMENTS 와 여기만 고치면 된다.
 */
export const SCENARIO = {
  /** 상단 진행바에 뜨는 하루 단계 — 엔진의 phaseIndex 와 1:1 이라 순서·개수를 바꾸지 말 것 */
  phases: [
    "출근 대기",
    "07:00 전원 출근",
    "기능 의도 접수 · 설계",
    "연동 대기 점검",
    "preview 실측 검증",
    "FAIL 근본원인 진단",
    "수용기준 정리",
    "대표 승인 대기",
    "CTO 관점 보고서 작성",
    "무인 크론 루프 가동",
    "초안 staging · 케이스 적립",
    "비서실 최종 브리핑",
    "업무 종료",
  ],

  /** 부서별 오늘 작업 라벨(진행 중 표시)과 끝냈을 때 리드가 하는 말 */
  steps: {
    research: { label: "영향범위·스키마안·수용기준(AC) 작성", done: "AC 7개 뽑았고 리스크는 🟡입니다." },
    strategy1: { label: "preview 실측 · 런타임 로그 대조", done: "7개 중 6개 PASS, 1개는 데이터가 비어 확인 불가예요." },
    qa: { label: "FAIL 재현 · 근본원인 패치", done: "증상이 아니라 원인을 고쳤어요. 재검증 요청했습니다." },
    strategy2: { label: "변경·리스크등급·승인요청 정리", done: "보고서 올렸어요. 머지는 대표님 몫입니다." },
    reels: { label: "CMO 데일리 10스텝", done: "" },
    carousel: { label: "ingest→analyze→patternize→measure→reflect", done: "" },
    ops: { label: "브랜드별 writing-protocol 초안 staging", done: "" },
    review: { label: "무브 단위 케이스 적립 (전부 draft)", done: "" },
  } as Record<string, { label: string; done: string }>,

  /** 아침 인수인계 회의 — [부서 id, 대사] */
  handoff: {
    title: "오늘 작업 인수인계",
    lines: [
      ["research", "기능 의도 1건 설계 끝냈어요. 영향 파일은 3개입니다."],
      ["strategy1", "AC부터 볼게요. 상태코드만으로는 판정 안 합니다."],
      ["qa", "FAIL 나오면 바로 재현해서 원인 잡을게요."],
    ] as [string, string][],
  },

  /** 수용기준 확정 — 승인 안건을 올리는 장면 */
  summary: {
    dept: "strategy1",
    line: "수용기준 정리 끝났어요. 승인 안건 1건 올립니다.",
    log: "수용기준 확정 — 대표 결재 안건 1건 생성",
  },

  /** 대표 승인 장면 */
  approval: {
    title: "PR 머지 승인",
    /** 회의실에 들어가는 부서 리드 — 마지막이 보고를 올리는 비서실 */
    crew: ["strategy1", "strategy2", "secretary"],
    /** 결재를 기다리는 동안 "승인 대기"로 표시되는 부서 */
    pendingDept: "strategy2",
    badge: "PR 1건 · 리스크 🟡",
    headline: "preview 실측 PASS — 머지 여부만 결정하시면 됩니다",
    reasons: ["① AC 6/7 PASS", "② 데이터 로직 무변경", "③ 새 의존성 0개"],
    leadLine: "7개 중 6개 PASS, 나머지 1개는 데이터가 비어 확인 불가입니다.",
    secretaryLine: "대표님, 오늘 결정하실 건 이거 하나예요.",
    ceoLine: "확인해볼게요.",
    approvedLine: "승인! 머지합시다.",
    approvedLog: "대표 승인 완료 — 머지 후 배포 확인으로 넘어갑니다.",
    decision: {
      approved: "PR 머지 승인 — 배포 확인까지 진행",
      pending: "PR 머지 승인 여부 (결재 대기 중)",
      none: "오늘 대표 결재 안건 없음",
    },
    next: {
      approved: "머지된 변경이 프로덕션에 실제로 반영됐는지 확인",
      pending: "승인 안건 재검토",
    },
  },

  /** 보고서를 다음 팀으로 넘기는 장면 — [보내는 부서, 받는 부서] */
  deliveries: [
    { from: "strategy2", to: "reels", line: "오늘 보고서 넘길게요. 데일리에 반영해주세요.", reply: "받았습니다. 10스텝 돌릴게요." },
    { from: "strategy2", to: "carousel", line: "측정 결과도 같이 넘깁니다.", reply: "패턴화까지 돌려볼게요." },
  ],

  /** 진행 로그 문구 */
  logs: {
    debugRound: "자가수정 1회전 — 패치 후 QA 재검증 요청 (최대 4회전)",
    cronDone: "무인 크론 2종 완료 — 산출물은 전부 draft/pending_review 로만 적재",
    archived: "케이스·초안 적립 완료 — 승인·등급 변경 경로는 사람만",
  },
} as const;

/**
 * 결과 보관함 링크. SolutionArchive는 Supabase가 정본이라 별도 보관함
 * 링크 없음 — 비워두면 화면에서 링크 버튼이 숨겨집니다.
 */
export const STORAGE_LINK = "";
