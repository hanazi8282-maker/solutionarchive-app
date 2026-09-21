#!/usr/bin/env node
// 페인 유형 낱말 규칙 셀프테스트 (config/pain-terms.json). 네트워크·DB 없음.
//   있음 / 없음 / legacy 면제 / 낱말이 toTerms 토큰화를 살아남는가(질의 쪽에서 사라지면 규칙이 헛돈다)

import { hasPainTerm, PAIN_TERMS, PAIN_TERM_LEGACY_KEYS, validateDraft } from '../lib/cases/draft.ts'
import { toTerms } from '../lib/cases/advisor.ts'
import { parseFailedAnglesTable } from './failed-angles-sync.mjs'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`) }
}

// ── 있음 / 없음 ──
t('가격 포함', hasPainTerm('셀럽 이름값으로 매스 유통 — 가격 대비 품질 근거 없음'), true)
t('조사 붙어도 부분 문자열로 잡힘', hasPainTerm('용기가 불편하다'), true)
t('영문 대소문자 무시', hasPainTerm('Premium PRICE positioning'), true)
t('없음', hasPainTerm('레이저로 면도날을 대체한다'), false)
t('빈 문자열', hasPainTerm(''), false)
t('null', hasPainTerm(null), false)

// ── 낱말이 질의 토큰화를 살아남는가 ──
// 매칭은 질의를 toTerms 로 쪼갠 토큰이 코퍼스 문장에 "포함"되는지 본다. 낱말이 불용어(효과·개선)거나
// 1글자(향)면 질의 쪽에서 토큰이 사라져 코퍼스에 아무리 넣어도 못 만난다.
const dead = PAIN_TERMS.filter((term) => !toTerms(term).includes(term))
t(`전 낱말 ${PAIN_TERMS.length}개가 toTerms 를 통과 (죽는 낱말: ${dead.join(', ') || '없음'})`, dead.length, 0)
t('낱말 중복 없음', new Set(PAIN_TERMS).size, PAIN_TERMS.length)

// ── 실패 앵글 원장: 새 키는 막고 legacy 는 면제 ──
const H = '| case_key | product_category | claimed_angle | outcome | evidence_source | source_tier | is_estimate |\n|---|---|---|---|---|---|---|\n'
const row = (key, angle) => `${H}| ${key} | x | ${angle} | x | x | 공개 보도 | false |`
let threw = false
try { parseFailedAnglesTable(row('new-key', '레이저로 대체')) } catch { threw = true }
t('새 키 + 낱말 없음 → throw', threw, true)
t('새 키 + 낱말 있음 → 통과', parseFailedAnglesTable(row('new-key', '가격 대비 품질')).length, 1)
t('legacy 키 + 낱말 없음 → 면제', parseFailedAnglesTable(row('quibi-mobile-shortform', '레이저로 대체')).length, 1)
t('legacy 24건 고정', PAIN_TERM_LEGACY_KEYS.size, 24)

// ── 케이스 초안: 무브 claim 에도 같은 규칙 ──
const draft = (claim) => ({
  slug: 'x', brand_name: 'X', moves: [{ lever: 'PRICING', claim, outcome_direction: 'positive' }], evidence: [],
})
const errs = (d) => validateDraft(d).filter((i) => i.level === 'error').map((i) => i.message)
t('claim 낱말 없음 → error', errs(draft('구독으로 묶었다')).some((m) => m.includes('pain-terms.json')), true)
t('claim 낱말 있음 → error 없음', errs(draft('하루 가격 하나로 구독을 묶었다')).some((m) => m.includes('pain-terms.json')), false)

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) process.exitCode = 1
