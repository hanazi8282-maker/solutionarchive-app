// [꼬리표] 장별 꼬리표(ss_move_tags) 묶음·요약. 순수 함수 — DB 조회는 호출자가 한다.
// 행동 라벨(action_kind)은 모델이 자유롭게 지은 영어 snake_case 라서 그대로 묶으면 쪼개진다 → 고정 묶음으로 접는다.
export const ACTION_BUCKETS: [string, RegExp][] = [
  ['paid_ads', /paid|ads|ppc|sponsor|retarget/],
  ['outbound', /cold|outreach|dm_|_dm|door|linkedin|cold_call|demo_call/],
  ['referral_partner', /referral|affiliate|word_of_mouth|partner|wholesale|reseller|integration/],
  ['community', /community|forum|reddit|slack|discord|facebook_group/],
  ['social_media', /twitter|instagram|tiktok|social|influencer|youtube|video|build_in_public|podcast/],
  ['launch_press', /product_hunt|launch|press|pr_/],
  ['marketplace_listing', /marketplace|app_store|listing|directory|aso/],
  ['email_leadmagnet', /email|newsletter|lead_magnet|free_tool|webinar|waitlist/],
  ['content_seo', /seo|content|blog|keyword|landing|educational|guide|ebook|case_study/],
]
export const bucketOf = (actionKind: string): string => ACTION_BUCKETS.find(([, re]) => re.test(actionKind))?.[0] ?? 'other'

export type TagRow = { action_kind: string; customer: string; result_class: string; result_ko: string | null; why_worked_ko: string | null; condition_ko: string | null }
export type Summary = { bucket: string; customer: string; n: number; won: number; failedOrMixed: number; enough: boolean; hasFailure: boolean; lines: string[] }

/** 한 묶음(행동 묶음 × 손님 종류)의 "N곳이 했고 M곳이 됐다" 요약. 10곳 미만이면 enough=false(결론서 본문에 쓰지 않고 내부 기록만). */
export function summarize(rows: TagRow[], bucket: string, customer: string): Summary {
  const m = rows.filter((r) => bucketOf(r.action_kind) === bucket && r.customer === customer && ['positive', 'mixed', 'negative'].includes(r.result_class))
  const won = m.filter((r) => r.result_class === 'positive').length
  const bad = m.filter((r) => r.result_class !== 'positive')
  const lines = [
    `비슷한 손님(${customer})에게 ${bucket} 방식을 쓴 ${m.length}곳 중 ${won}곳이 결과를 냈고 ${bad.length}곳은 안 됐거나 반쯤만 됐다.`,
    ...bad.slice(0, 3).map((r) => `- 안 된/섞인 예: ${r.result_ko ?? '결과 요약 없음'}${r.why_worked_ko ? ` (이유: ${r.why_worked_ko})` : ''}`),
    '※ 이 사례들은 성공담 위주로 모인 자료라 "된 비율"은 실제보다 높게 보인다(잘 안 된 곳은 글로 덜 남는다).',
  ]
  return { bucket, customer, n: m.length, won, failedOrMixed: bad.length, enough: m.length >= 10, hasFailure: bad.length > 0, lines }
}
