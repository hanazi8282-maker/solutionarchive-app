// 상황 값 목록 — v71cq §4: 유료 상황 질문의 선택지와 ss_moves(꼬리표)의 "상황" 칸이 **같은 값**을 쓴다(그래야 답이 바로 같은 상황의 행동 줄을 꺼낸다).
// 여기가 정본 한 곳이다. 5-c 꼬리표 작업(단계·팀 규모·월 매출대·손님 종류·값대)은 이 목록의 키·값을 그대로 쓴다. 값 문자열을 바꾸면 저장된 답과 꼬리표가 어긋나므로 바꾸지 말고 추가만 한다.
// import 없음 — scripts/lead-selftest.mjs 가 바로 불러 검사한다.

export type SituationQ = { key: string; label: string; options: readonly string[]; multi?: boolean; tagged: boolean }

/** tagged=true 인 5개가 ss_moves "상황" 칸(§5-c 4번)과 공유하는 값이다. 나머지는 이 회사만의 사정이라 꼬리표에는 없다. */
export const SITUATION: readonly SituationQ[] = [
  { key: 'stage', label: '지금 단계', tagged: true, options: ['출시 전', '매출 0', '첫 매출 뒤', '성장 중'] },
  { key: 'team_size', label: '팀 규모', tagged: true, options: ['1명', '2~3명', '4~10명', '11명 이상'] },
  { key: 'revenue_band', label: '월 매출', tagged: true, options: ['0원', '월 100만원 미만', '월 100~500만원', '월 500~2,000만원', '월 2,000만원 이상'] },
  { key: 'customer_type', label: '주로 파는 손님', tagged: true, options: ['개인 소비자', '1인·프리랜서', '소규모 회사(10명 이하)', '중견·대기업', '기타'] },
  { key: 'price_band', label: '값대', tagged: true, options: ['무료', '월 1만원 미만', '월 1~5만원', '월 5~20만원', '월 20만원 이상', '건별·맞춤'] },
  { key: 'billing', label: '결제 방식', tagged: false, options: ['월 구독', '한 번 결제', '쓴 만큼 결제', '아직 정하지 않았다'] },
  { key: 'customers_now', label: '지금 쓰는 손님 수', tagged: false, options: ['0명', '1~10명', '11~100명', '100명 이상'] },
  { key: 'main_channel', label: '손님이 가장 많이 오는 곳', tagged: false, options: ['검색', '광고', '소개·입소문', '커뮤니티·SNS', '직접 영업', '제휴·마켓', '아직 없다'] },
  { key: 'bottleneck', label: '지금 가장 큰 고민', tagged: false, options: ['방문하는 사람이 적다', '와서 가입을 안 한다', '가입하고 쓰다 만다', '써 보고 돈은 안 낸다', '어디가 문제인지 모르겠다'] },
  { key: 'tried', label: '이미 해 본 것(여러 개 가능)', tagged: false, multi: true, options: ['광고', '블로그·콘텐츠', '커뮤니티·제휴', '값 조정', '기능 추가', '무료 체험·데모', '직접 영업', '아직 없다'] },
  { key: 'tried_result', label: '해 본 것의 결과', tagged: false, options: ['효과가 있었다', '조금 있었다', '효과가 없었다', '아직 모른다', '해 본 적 없다'] },
  { key: 'hours_week', label: '한 주에 쓸 수 있는 시간', tagged: false, options: ['5시간 이하', '6~15시간', '16~30시간', '30시간 이상'] },
  { key: 'budget_month', label: '한 달에 쓸 수 있는 돈', tagged: false, options: ['0원', '50만원 미만', '50~200만원', '200만원 이상'] },
  { key: 'goal', label: '이번 달 목표', tagged: false, options: ['첫 유료 손님 만들기', '유료 손님 늘리기', '떠나는 손님 줄이기', '값 올리기', '아직 모르겠다'] },
] as const

export const SITUATION_NOTE_MAX = 300

export type SituationAnswers = Record<string, string | string[]> & { note?: string }

/** 폼 → 검증된 답. 모든 질문에 답해야 하고(여러 개 가능한 질문은 하나 이상), 값은 목록 안의 것만 받는다. 메모는 선택. */
export function parseSituation(get: (key: string) => string[]): { ok: true; answers: SituationAnswers } | { ok: false; missing: string } {
  const answers: SituationAnswers = {}
  for (const q of SITUATION) {
    const vals = get(q.key).map((v) => String(v))
    const good = vals.filter((v) => (q.options as readonly string[]).includes(v))
    if (good.length === 0 || good.length !== vals.length) return { ok: false, missing: q.key }
    if (!q.multi && good.length !== 1) return { ok: false, missing: q.key }
    answers[q.key] = q.multi ? [...new Set(good)] : good[0]
  }
  const note = (get('note')[0] ?? '').trim().slice(0, SITUATION_NOTE_MAX)
  if (note) answers.note = note
  return { ok: true, answers }
}
