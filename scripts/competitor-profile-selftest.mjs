#!/usr/bin/env node
// 경쟁사 프로필 셀프테스트 — lib/analysis/competitor-profile.ts 순수 함수 + 배선 대조. 네트워크·DB·LLM 없음.
//   node scripts/competitor-profile-selftest.mjs
//
// 왜 있나: 근거는 모델이 아니라 코드가 단다. 여기가 접히면 (1) 모르는 원문 번호가 링크가 되거나 (2) 근거 없는 주장이
// 남아 화면의 가장 믿음직한 자리에 앉는다. 둘 다 화면만 봐서는 정상처럼 보인다(§7.2).

import { readFileSync } from 'node:fs'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'
import {
  PROFILE_MIGRATION, PROFILE_PROMPT_VERSION, PROFILE_SYSTEM_PROMPT, REQUIRED_SECTIONS, SECTIONS,
  buildProfilePrompt, evidenceLinkOf, evidenceRefOf, inputWindow, needsProfile, resolveProfile, validateProfile,
} from '../lib/analysis/competitor-profile.ts'
import { mockResponse } from '../lib/analysis/mock.ts'

let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

// ── 1. 프롬프트 — 외부 텍스트 고지 · 템플릿 여섯 섹션 · 번호 ────────────
t('시스템 프롬프트가 외부 텍스트 고지를 싣는다', PROFILE_SYSTEM_PROMPT.includes(UNTRUSTED_INPUT_NOTICE))
t('여섯 섹션 이름이 전부 프롬프트에 있다', SECTIONS.every((s) => PROFILE_SYSTEM_PROMPT.includes(`- ${s}:`)))
t('시사점은 1인 SaaS 창업가·판매자 대상', /1인 SaaS 창업가·판매자/.test(PROFILE_SYSTEM_PROMPT))

const hn = { id: '3f2a1c9b-0000-4000-8000-000000000001', source_key: 'hackernews', source_name: 'Hacker News', raw_text: '[HN: Ask HN: Which analytics? · https://news.ycombinator.com/item?id=41234567] Plausible is simpler than GA4 but pricier.', product_ref: null, created_at: '2026-09-01T00:00:00Z' }
const dw = { id: 'a1b2c3d4-0000-4000-8000-000000000002', source_key: 'danawa', source_name: '다나와', raw_text: '펌프가 자주 막힌다. 향은 좋다.', product_ref: '252495223', created_at: '2026-09-10T00:00:00Z' }
const ap = { id: 'b2c3d4e5-0000-4000-8000-000000000003', source_key: 'appstore', source_name: 'App Store', raw_text: '구독료가 비싸다', product_ref: '123', created_at: '2026-09-12T00:00:00Z' }
const manual = { id: 'c3d4e5f6-0000-4000-8000-000000000004', source_key: null, source_name: null, raw_text: '직접 붙여넣은 후기', product_ref: null, created_at: null }
const yt = { id: 'd4e5f6a7-0000-4000-8000-000000000005', source_key: 'youtube', source_name: 'YouTube', raw_text: '[YouTube 댓글 · dQw4w9WgXcQ] 좋아요', product_ref: 'v:dQw4w9WgXcQ' }
const ph = { id: 'e5f6a7b8-0000-4000-8000-000000000006', source_key: 'producthunt', source_name: 'Product Hunt', raw_text: '[Product Hunt 댓글 · plausible-analytics] nice', product_ref: null }

const built = buildProfilePrompt(
  { product_elevator_pitch: 'Plausible: 가벼운 웹 분석', competitor_url: null, purpose: 'x', business_model: 'SAAS' },
  [{ input: hn, text: hn.raw_text }, { input: dw, text: dw.raw_text }, { input: manual, text: manual.raw_text }],
  { collected: 5, irrelevant: 2 },
)
t('원문마다 [#n] 번호가 붙는다', /### \[#1\] \(Hacker News\)/.test(built.user) && /### \[#2\] \(다나와\)/.test(built.user) && /### \[#3\] \(직접 입력\)/.test(built.user))
t('refIndex 가 번호→원문을 갖는다', built.refIndex.get(1)?.id === hn.id && built.refIndex.get(3)?.id === manual.id && built.refIndex.size === 3)
t('수집·무관 제외 건수를 프롬프트에 적는다', /원문 3건 \(수집 5건 중 관련도 상위 · 목적 무관 판정 2건 제외\)/.test(built.user))
t('null URL 을 문자열 "null" 로 끼우지 않는다', !/URL: null/.test(built.user) && /URL: \(없음\)/.test(built.user))

// ── 2. 근거 해석 — 소스별 링크 / "소스 · id" ─────────────────────────
t('HN → 스레드 URL', evidenceLinkOf(hn) === 'https://news.ycombinator.com/item?id=41234567')
t('다나와 → 상품 페이지(리뷰별 URL 없음)', evidenceLinkOf(dw) === 'https://prod.danawa.com/info/?pcode=252495223')
t('App Store → 링크 없음(null, 지어내지 않는다)', evidenceLinkOf(ap) === null)
t('YouTube → 영상 URL', evidenceLinkOf(yt) === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
t('Product Hunt → 글 URL', evidenceLinkOf(ph) === 'https://www.producthunt.com/posts/plausible-analytics')
t('직접 입력 → 링크 없음', evidenceLinkOf(manual) === null)
t('라벨 = 소스 이름 · id 앞 8자', evidenceRefOf(ap).label === 'App Store · b2c3d4e5')
t('소스 이름 없으면 source_key, 그것도 없으면 "직접 입력"', evidenceRefOf({ ...ap, source_name: null }).label === 'appstore · b2c3d4e5' && evidenceRefOf(manual).label === '직접 입력 · c3d4e5f6')

// ── 3. 파서 — 모르는 번호 버림 · 근거 없는 주장 버림 · 중복 ─────────────
const out = JSON.stringify({ sections: {
  at_a_glance: [{ claim: '가벼운 웹 분석 도구', refs: [1] }, { claim: '지어낸 주장', refs: [9] }, { claim: '근거 없음', refs: [] }],
  positioning: [{ claim: 'GA4 보다 단순하다', refs: ['#1', 1, 2] }],
  pricing: [{ claim: 'GA4 보다 비싸다', refs: [1] }],
  strengths: [{ claim: '향이 좋다', refs: [2] }, { claim: '향이 좋다', refs: [2] }],
  weaknesses: [{ claim: '펌프가 막힌다', refs: [2, 3] }],
  implications: [{ claim: '펌프 품질을 첫 화면에', refs: [2] }],
} })
const r = resolveProfile(out, built.refIndex)
t('모르는 번호(9)를 단 주장은 버린다', r.sections.at_a_glance.length === 1 && r.unknownRefs === 1)
t('근거 없는 주장을 버리고 센다', r.droppedClaims === 2)
t('"#1" 문자열 번호도 읽고 같은 원문은 한 번만 단다', r.sections.positioning[0].evidence.length === 2)
t('근거에 input_id·label·link 가 실린다', r.sections.positioning[0].evidence[0].input_id === hn.id && r.sections.positioning[0].evidence[0].link?.includes('41234567') === true)
t('같은 주장은 한 번만', r.sections.strengths.length === 1)
t('인용된 원문 수를 센다', r.citedInputs === 3)
t('직접 입력 근거는 링크 없이 라벨만', r.sections.weaknesses[0].evidence[1].link === null && r.sections.weaknesses[0].evidence[1].label === '직접 입력 · c3d4e5f6')
t('JSON 이 아니면 던지지 않고 주장 0개', resolveProfile('이건 JSON 이 아니다', built.refIndex).citedInputs === 0)
t('sections 껍데기 없이 와도 읽는다', resolveProfile(JSON.stringify({ strengths: [{ claim: 'x', refs: [1] }] }), built.refIndex).sections.strengths.length === 1)

// ── 4. 3상태 검증 ────────────────────────────────────────────────────
t('버린 주장이 있으면 unverified', validateProfile(r).status === 'unverified' && /근거 없는 주장 2개/.test(validateProfile(r).reason))
const clean = resolveProfile(JSON.stringify({ sections: Object.fromEntries(SECTIONS.map((s) => [s, [{ claim: s, refs: [1] }]])) }), built.refIndex)
t('필수 섹션 전부·버림 0 이면 ok', validateProfile(clean).status === 'ok' && validateProfile(clean).reason === null)
const noPricing = resolveProfile(JSON.stringify({ sections: Object.fromEntries(SECTIONS.map((s) => [s, s === 'pricing' || s === 'positioning' ? [] : [{ claim: s, refs: [1] }]])) }), built.refIndex)
t('pricing·positioning 이 비어도 ok(원문에 없을 수 있다)', validateProfile(noPricing).status === 'ok')
const noStrengths = resolveProfile(JSON.stringify({ sections: { at_a_glance: [{ claim: 'a', refs: [1] }] } }), built.refIndex)
t('필수 섹션이 비면 unverified 이고 사유에 이름이 있다', validateProfile(noStrengths).status === 'unverified' && /strengths/.test(validateProfile(noStrengths).reason))
t('주장 0개면 failed', validateProfile(resolveProfile('{}', built.refIndex)).status === 'failed')
t('전부 근거 없어 버렸으면 failed 사유에 그 수', /전부 근거 번호가 없어/.test(validateProfile(resolveProfile(JSON.stringify({ sections: { strengths: [{ claim: 'x', refs: [] }] } }), built.refIndex)).reason))
t('REQUIRED_SECTIONS 는 SECTIONS 의 부분집합', REQUIRED_SECTIONS.every((s) => SECTIONS.includes(s)))

// ── 5. 캐시 판단 · 시간 창 ───────────────────────────────────────────
t('스냅샷 없으면 만든다', needsProfile(null) === true)
t('같은 버전이면 안 만든다', needsProfile({ prompt_version: PROFILE_PROMPT_VERSION }) === false)
t('버전이 다르면 만든다', needsProfile({ prompt_version: 'cp-v0' }) === true)
const w = inputWindow([hn, dw, manual])
t('시간 창 = created_at min/max(없는 것은 건너뜀)', w.from === '2026-09-01T00:00:00.000Z' && w.to === '2026-09-10T00:00:00.000Z')
t('전부 시각 없으면 null', inputWindow([manual]).from === null)

// ── 6. mock 프로바이더 — 파이프라인 배선 시험용 응답이 ok 를 낸다 ─────────
const mock = resolveProfile(mockResponse('competitor-profile', ''), new Map([[1, hn], [2, dw]]))
t('mock 응답은 ok(필수 섹션 전부·근거 있음)', validateProfile(mock).status === 'ok')

// ── 7. 배선 — 함수가 옳아도 안 쓰면 소용없다 ──────────────────────────
const run = read('../lib/analysis/extract-run.ts')
t('extract-run 이 status=extracted 뒤에 프로필을 만든다', run.indexOf("status: 'extracted'") < run.indexOf('generateCompetitorProfile(supabase, projectId, provider'))
t('프로필은 try/catch 안 — 실패가 추출을 failed 로 뒤집지 않는다', /try \{\s*\n\s*profile = await generateCompetitorProfile/.test(run))
t('프로필 결과를 outcome 에 싣는다', /profile: ProfileOutcome \| null/.test(run) && /costUsd,\s*\n\s*profile,\s*\n\s*\}/.test(run))
const db = read('../lib/analysis/competitor-profile-db.ts')
t('DB 모듈이 extract 와 같은 무관 판정 제외(dropIrrelevant)를 쓴다', /dropIrrelevant\(inputs, relevanceError \? null :/.test(db))
t('호출 라벨이 competitor-profile(mock 분기와 같다)', /'competitor-profile'\)/.test(db))
t('저장 실패를 성공으로 접지 않는다', /status: 'failed', reason: `저장 실패/.test(db))
t('끄기 스위치 COMPETITOR_PROFILE=off 는 skipped + 사유', /COMPETITOR_PROFILE=off/.test(db))
const auto = read('extract-auto.mjs')
t('extract-auto 가 프로필 스텝을 extract 스텝과 같은 단위(seconds·cost_usd)로 남긴다', /stepKey: `profile-\$\{target\.projectId\}`/.test(auto) && /seconds: Math\.round\(p\.durationMs \/ 1000\), cost_usd: p\.costUsd/.test(auto))
t('프로필이 안 돌았으면 failed 로 남긴다(행 없음 ≠ 안 돌았음)', /프로필 단계가 돌지 않았다/.test(auto))
t('프로필 한도면 배치를 멈춘다', /if \(p\?\.quotaExhausted\) \{[\s\S]{0,400}break/.test(auto))
const mig = read(`../supabase/migrations/${PROFILE_MIGRATION}`)
t('마이그 파일이 있고 RLS ENABLE+FORCE', /ENABLE ROW LEVEL SECURITY/.test(mig) && /FORCE {2}ROW LEVEL SECURITY/.test(mig))
t('status 3상태 CHECK 와 본문↔상태 CHECK', /status IN \('ok', 'unverified', 'failed'\)/.test(mig) && /\(status = 'failed'\) = \(sections IS NULL\)/.test(mig))
t('trigger 어휘 CHECK', /trigger IN \('extract', 'backfill', 'manual'\)/.test(mig))
t('롤백 파일이 있다', /DROP TABLE IF EXISTS public\.competitor_profile_snapshots/.test(read(`../supabase/migrations/${PROFILE_MIGRATION.replace('.sql', '_rollback.sql')}`)))
t('build-check 가 이 셀프테스트를 돌린다', /competitor-profile-selftest\.mjs/.test(read('../.github/workflows/build-check.yml')))
const card = read('../app/analyze/[id]/result/competitor-profile-card.tsx')
t('화면이 테이블 없음(마이그 미적용)과 조회 실패를 가른다', /PGRST205/.test(card) && /없다는 뜻이 아니다/.test(card))
t('화면이 이전 스냅샷 날짜를 나열한다', /이전 스냅샷/.test(card))
t('결과 화면에 카드가 꽂혀 있다', /<CompetitorProfileCard supabase=\{supabase\} projectId=\{id\} \/>/.test(read('../app/analyze/[id]/result/page.tsx')))

console.log(`\n${fail === 0 ? '✅' : '❌'} 경쟁사 프로필 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
