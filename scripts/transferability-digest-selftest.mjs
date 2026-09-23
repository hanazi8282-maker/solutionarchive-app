#!/usr/bin/env node
// scripts/transferability-feedback-digest.mjs 의 집계 순수함수 회귀. 네트워크·DB 없음.
//   node scripts/transferability-digest-selftest.mjs
//
// 왜 여기에 검사가 붙나: 이 다이제스트는 사람이 쓴 사유를 **조사 프롬프트로** 되돌린다.
// 날짜 경계가 하루 밀리면 어제 사유가 영영 안 들어가는데, 파일은 "0건"으로 멀쩡해 보인다.
// 그 0건을 사람이 "어제 사유가 없었다"로 읽는 것이 CLAUDE.md §7.1 이 경고하는 사고다.

import { LATEST_DAYS, entriesForDay, renderDay, renderLatest, shiftDay } from './transferability-feedback-digest.mjs'

let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }

const row = (o = {}) => ({
  id: o.id ?? 'm1',
  lever: o.lever ?? 'CHANNEL',
  transferability: o.transferability ?? 'LOW',
  transferability_reason: o.reason ?? '자체 공장이 있어야 한다',
  // `??` 를 쓰면 `at: null` 케이스가 기본값으로 되살아난다 — 그러면 "시각 없음" 검사가 검사하지 않는다.
  transferability_reason_at: 'at' in o ? o.at : '2026-09-23T01:00:00Z', // KST 09-23 10:00
  case_studies: { slug: o.slug ?? 'brand-a', brand_name: o.brand ?? 'Brand A', reader_problem: o.rp ?? 'NO_DISTRIBUTION' },
})

// ── 1. 날짜 이동 ────────────────────────────────────────────────────────
t('shiftDay: 하루 전', shiftDay('2026-09-23', -1) === '2026-09-22')
t('shiftDay: 월 경계를 넘는다', shiftDay('2026-10-01', -1) === '2026-09-30')
t('shiftDay: 파싱 불가는 null(오늘로 접지 않는다)', shiftDay('어제', -1) === null)

// ── 2. 하루치 추출 — 기준은 사유 시각이고 KST 경계를 지킨다 ──────────────
const rows = [
  row({ id: 'a' }),                                                     // KST 09-23
  row({ id: 'b', at: '2026-09-22T15:00:00Z', slug: 'brand-b' }),        // KST 09-23 00:00 — 경계 안쪽
  row({ id: 'c', at: '2026-09-22T14:59:00Z', slug: 'brand-c' }),        // KST 09-22 23:59 — 전날
  row({ id: 'd', reason: '   ' }),                                      // 공백뿐 → 사유 아님
  row({ id: 'e', at: null, slug: 'brand-e' }),                          // 시각 없음 → 그날로 접지 않는다
]
const d23 = entriesForDay(rows, '2026-09-23')
t('KST 경계: 09-23 은 2건(UTC 15:00 포함)', d23.length === 2)
t('전날 1건은 09-22 로 간다', entriesForDay(rows, '2026-09-22').length === 1)
t('사유 공백·시각 없음은 어느 날에도 안 들어간다', entriesForDay(rows, '2026-09-24').length === 0
  && !d23.some((e) => e.slug === 'brand-e'))
t('슬러그 순 정렬', d23[0].slug === 'brand-a' && d23[1].slug === 'brand-b')

// ── 3. 누락 필드 — 미기재를 지어내지 않고 "미기재"로 적는다 ───────────────
const bare = entriesForDay([{ id: 'x', transferability_reason: '규제 업종이다', transferability_reason_at: '2026-09-23T01:00:00Z' }], '2026-09-23')
t('케이스 조인이 비어도 죽지 않고 미기재로 채운다', bare.length === 1
  && bare[0].brand === '브랜드 미기재' && bare[0].readerProblem === '미지정' && bare[0].transferability === '미판정')

// ── 4. 하루치 마크다운 — 0건과 파일 없음을 가른다 ────────────────────────
const zero = renderDay('2026-09-24', [])
t('0건 파일은 "0건"을 본문에 적는다', zero.includes('**0건**') && zero.includes('2026-09-24'))
t('0건 파일은 "파일이 없는 것과 다르다"를 말한다', zero.includes('파일이 없는 것과 다르다'))
const doc = renderDay('2026-09-23', d23)
t('본문에 사유 원문이 들어간다', doc.includes('자체 공장이 있어야 한다') && doc.includes('총 2건'))
t('본문에 "규칙이 아니라 참고"가 있다', doc.includes('규칙이 아니라 참고'))

// ── 5. latest.md — 창 안의 날짜만, 합계가 맞아야 한다 ────────────────────
const window = Array.from({ length: LATEST_DAYS }, (_, i) => shiftDay('2026-09-23', -i))
  .map((day) => ({ day, entries: entriesForDay(rows, day) }))
const latest = renderLatest(window, '2026-09-23')
t('latest 합계 3건(09-23 2건 + 09-22 1건)', latest.includes('총 3건'))
t('latest 는 LOW/MEDIUM 을 나눠 센다', latest.includes('LOW 3'))
t('latest 는 빈 날 절을 만들지 않는다', !latest.includes('## 2026-09-21'))
t('latest 맨 위가 "참고, 규칙 아님"', latest.startsWith('# 최근 이식성 반려 사유 (참고, 규칙 아님)'))
const empty = renderLatest([{ day: '2026-09-23', entries: [] }], '2026-09-23')
t('latest 0건도 조회 정상임을 명시', empty.includes('**0건**') && empty.includes('조회는 정상'))

// ── 6. 배선 — 케이스 조사 프롬프트에 실제로 들어가는가 ────────────────────
// 조용히 안 붙어도 프롬프트는 멀쩡해 보이고 루프는 예전처럼 돈다. 그래서 여기서 확인한다.
const { TRANSFERABILITY_FEEDBACK_FILE, researchPrompt } = await import('./cmo-daily.mjs')
t('배선 경로가 다이제스트 출력 경로와 같다', TRANSFERABILITY_FEEDBACK_FILE === 'ops/state/transferability-feedback/latest.md')
const item = { brand_name: '미정', market: null, target_bottleneck: null, reason: 'coverage_gap', notes: null }
const withFile = researchPrompt(item, '2026-09-23', [], 'package.json') // 존재하는 아무 파일
t('파일이 있으면 프롬프트에 경로와 "규칙이 아니라 참고"가 들어간다',
  withFile.includes('package.json') && withFile.includes('규칙이 아니라 참고다'))
const noFile = researchPrompt(item, '2026-09-23', [], 'ops/state/이런파일은없다.md')
t('파일이 없으면 Read 지시를 아예 넣지 않는다', !noFile.includes('참고 자료:') && !noFile.includes('이런파일은없다'))
t('배선과 무관한 본문은 그대로다', noFile.includes('sa-cmo-researcher.md') && withFile.includes('sa-cmo-researcher.md'))

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
