#!/usr/bin/env node
// 추출 입력 선별(T1) + 야간 자동 실행 대상 선정 셀프테스트. 네트워크·DB·LLM 없음.
//   node scripts/analyze-extract-select-selftest.mjs
//
// 이 검사가 있는 이유: 선별은 "무엇을 안 읽을지" 를 정하는 코드다. 틀려도 추출은 성공으로
// 끝나고, 속성이 엉뚱하게 나올 뿐이라 아무도 눈치채지 못한다(§7.2). 그래서 점수·정렬·상한과
// 버린 건수(droppedInputs)를 픽스처로 고정한다.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { MAX_CHARS_TOTAL, painHits, selectInputs } from '../lib/analysis/extract-select.ts'
import { describePick, pickAutoTargets } from '../lib/analysis/extract-auto.ts'
import { isQuotaFailure, ProviderHttpError, AllGeminiModelsExhaustedError } from '../lib/analysis/llm.ts'
import { LlmBudgetExceededError } from '../lib/analysis/budget.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }

const day = (n) => new Date(Date.parse('2026-09-23T00:00:00Z') - n * 86_400_000).toISOString()
/** 길이 밴드(80~2000) 안쪽 본문 만들기. */
const body = (text, len = 200) => text + '가'.repeat(Math.max(0, len - text.length))

// ── 1. 상한 이하면 전부 쓴다 ─────────────────────────────────────
const small = [
  { raw_text: body('가격이 비싸다'), collected_at: day(1) },
  { raw_text: body('그냥 그렇다'), collected_at: day(2) },
  { raw_text: body('용기 펌프가 불편'), collected_at: day(3) },
]
const r1 = selectInputs(small)
t('12만 자 이하 = 전부 선택', r1.selected.length === 3)
t('전부 썼으면 droppedInputs=0', r1.droppedInputs === 0)

// ── 2. 페인 낱말이 많으면 오래됐어도 먼저 ────────────────────────
// 예전 동작(created_at 오름차순)이면 반대 순서가 나온다 — 이 케이스가 그 회귀를 잡는다.
const mixed = [
  { raw_text: body('오늘 날씨가 좋다'), collected_at: day(0) },            // 히트 0, 최신
  { raw_text: body('가격 대비 세정력 자극 향기 용기'), collected_at: day(90) }, // 히트 다수, 오래됨
]
const r2 = selectInputs(mixed)
t('페인 히트가 최신성을 이긴다', r2.selected[0].input === mixed[1])
// 낱말 가짓수다 — 겹치는 낱말(세정/세정력)은 둘 다 센다. 가중치일 뿐이라 의도한 동작이다.
t('painHits 는 낱말 가짓수', painHits('가격 세정력 자극') === 4 && painHits('무관한 문장') === 0)

// ── 3. 총량 상한 — 넘치면 밀어내고 그 수를 센다 ──────────────────
// 8,000자(입력당 상한) × 20건 = 16만 자 > 12만 자 → 15건만 들어간다.
const big = Array.from({ length: 20 }, (_, i) => ({
  raw_text: '자극'.repeat(6000), // slice 후 8,000자
  collected_at: day(i),
}))
const r3 = selectInputs(big)
t('상한을 넘지 않는다', r3.usedChars <= MAX_CHARS_TOTAL)
t('상한까지 채운다 (8,000×15 = 12만)', r3.selected.length === 15)
t('밀린 건수를 droppedInputs 로 돌려준다', r3.droppedInputs === 5)
t('동점이면 최신 우선', r3.selected[0].input === big[0] && !r3.selected.includes(big[19]))

// ── 4. 결정적 — 입력 순서가 달라도 같은 집합 ─────────────────────
const shuffled = [...mixed].reverse()
const r4 = selectInputs(shuffled)
t('같은 입력 → 같은 선택(순서 무관)', r4.selected[0].input === mixed[1] && r4.droppedInputs === 0)

// ── 5. 폐기된 원문은 싣지 않되 버린 수에는 잡힌다 ────────────────
const purged = [
  { raw_text: null, collected_at: day(0) },
  { raw_text: body('가격 불만'), collected_at: day(5) },
]
const r5 = selectInputs(purged)
t('raw_text null 은 선택 안 함', r5.selected.length === 1)
t('선택 못 한 건 droppedInputs 로 보인다', r5.droppedInputs === 1)

// ── 6. 길이 밴드 — 같은 조건이면 밴드 안쪽이 먼저, 긴 글이 뒤를 막지 않는다 ──
const band = [
  { raw_text: '가격', collected_at: day(1) },              // 2자 = 밴드 밖
  { raw_text: body('가격', 500), collected_at: day(1) },   // 밴드 안
]
t('밴드 안쪽이 먼저', selectInputs(band).selected[0].input === band[1])
const blocker = [
  { raw_text: '가격'.repeat(4000), collected_at: day(0) },  // 8,000자
  { raw_text: body('가격', 300), collected_at: day(0) },
]
const r6 = selectInputs(blocker, { maxCharsTotal: 1000 })
t('상한을 넘기는 후보는 건너뛰고 다음을 담는다', r6.selected.length === 1 && r6.selected[0].input === blocker[1])

// ── 7. 야간 자동 실행 대상 선정 ──────────────────────────────────
const cands = [
  { projectId: 'a', newInputs: 300 },
  { projectId: 'b', newInputs: 99 },
  { projectId: 'c', newInputs: 1200 },
  { projectId: 'd', newInputs: 100 },
  { projectId: 'e', newInputs: null }, // 세지 못했다
]
const p1 = pickAutoTargets(cands, { minNew: 100, max: 2 })
t('신규 많은 순', p1.targets.map((x) => x.projectId).join() === 'c,a')
t('기준 미만 제외', p1.belowMin === 1)
t('확인 불가는 따로 센다(0 으로 접지 않는다)', p1.unknown === 1)
t('상한에 걸린 나머지를 센다', p1.eligible === 3 && p1.remaining === 1)
t('상한 도달을 말로 구분한다', describePick(p1, 100, 2).includes('남은 대상 1건'))

const p0 = pickAutoTargets([{ projectId: 'x', newInputs: 3 }], { minNew: 100, max: 3 })
t('대상 0 은 "대상 0건" 이라고 말한다', p0.targets.length === 0 && describePick(p0, 100, 3).includes('대상 0건'))
const tie = pickAutoTargets([{ projectId: 'z', newInputs: 100 }, { projectId: 'y', newInputs: 100 }], { minNew: 100, max: 1 })
t('동수 tie-break 는 결정적(projectId 사전순)', tie.targets[0].projectId === 'y')

// ── 8. "오늘은 다시 불러도 같다" 판정 ────────────────────────────
t('429 는 멈춤', isQuotaFailure(new ProviderHttpError(429, 'x')) === true)
t('503 는 멈춤', isQuotaFailure(new ProviderHttpError(503, 'x')) === true)
t('모델 전부 소진은 멈춤', isQuotaFailure(new AllGeminiModelsExhaustedError(['m'])) === true)
t('예산 초과는 멈춤', isQuotaFailure(new LlmBudgetExceededError('x')) === true)
t('그 밖의 실패는 계속', isQuotaFailure(new ProviderHttpError(400, 'x')) === false && isQuotaFailure(new Error('파싱 실패')) === false)

// ── 9. 호출부가 정말 이 함수를 쓰는가 ────────────────────────────
const read = (p) => readFileSync(`${ROOT}${p}`, 'utf8')
const run = read('lib/analysis/extract-run.ts')
const auto = read('scripts/extract-auto.mjs')
const wf = read('.github/workflows/nightly-extract.yml')

// T2(목적 무관 판정) 제외를 먼저 걸고 그 결과를 선별에 넘긴다 — 순서가 뒤집히면 무관 리뷰가
// 점수 상위를 차지한 채 그대로 프롬프트에 들어간다.
t('extract-run 이 selectInputs 를 쓴다', /from '\.\/extract-select\.ts'/.test(run) && /selectInputs\(relevance\.kept/.test(run))
t('extract-run 에 오래된 순 자르기가 남아 있지 않다', !/truncatedInputs/.test(run))
t('extract-run 이 droppedInputs 를 돌려준다', /droppedInputs,? model/.test(run) || /droppedInputs,/.test(run))
t('extract-run 이 폐기 원문을 제외한다', /\.is\('purged_at', null\)/.test(run))
t('야간 배치가 pickAutoTargets 를 쓴다', /pickAutoTargets\(/.test(auto))
t('야간 배치는 force 를 쓰지 않는다(검수값 보호)', !/force/.test(auto) && /claimExtraction\(supabase, target\.projectId, false\)/.test(auto))
t('야간 배치가 한도면 멈춘다', /quotaExhausted/.test(auto) && /break/.test(auto))
t('워크플로가 스케줄로 돈다', /cron: '33 18 \* \* \*'/.test(wf) && /scripts\/extract-auto\.mjs/.test(wf))
t('워크플로에 dry-run 스위치가 있다', /dry_run/.test(wf) && /'--dry'/.test(wf))

console.log(`\n${fail === 0 ? '✅' : '❌'} 추출 선별·자동 실행 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
