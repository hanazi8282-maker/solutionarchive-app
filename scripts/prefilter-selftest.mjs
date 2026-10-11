#!/usr/bin/env node
// T2 앞 사전필터(v31 항목 5) 셀프테스트. 네트워크·DB·LLM 없음.
//   node scripts/prefilter-selftest.mjs
//
// 이 검사가 있는 이유: 필터는 "무엇을 안 읽을지" 를 정한다. 잘못 걸러도 파이프라인은 초록으로 끝나고
// 불만 하나가 조용히 사라진다(§7.2). 그래서 규칙마다 양성·음성, 보호 규칙, shadow 무해성, 설정 완화를 고정한다.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  CATEGORY_RULE_FORBIDDEN, applyPrefilter, areaOfProject, buildFalseDropSample, falseDropRate, loadPrefilterConfig,
  parsePrefilterConfig, prefilterInputs, sampleFlagged,
} from '../lib/analysis/prefilter.ts'

let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }

// 실제 설정 파일을 그대로 쓴다 — 셀프테스트용 사본이 따로 있으면 두 벌이 갈라진다.
const loaded = loadPrefilterConfig(undefined, {})
t('설정 파일을 읽는다', loaded.cfg !== null && loaded.error === null)
const raw = JSON.parse(fs.readFileSync(new URL('../config/prefilter-rules.json', import.meta.url), 'utf8'))
const cfg = loaded.cfg
t('기본 모드는 shadow', cfg.mode === 'shadow')

const P = 'proj-1'
let seq = 0
const inp = (raw_text, extra = {}) => ({ id: `i${String(++seq).padStart(4, '0')}`, raw_text, source_key: 'danawa', rating: null, collected_at: `2026-10-0${1 + (seq % 8)}T00:00:00Z`, ...extra })
const rule = (rows, c = cfg, pid = P) => prefilterInputs(rows, c, pid).map((v) => v.rule)
const one = (row, c, pid) => rule([row], c, pid)[0]

// ── 1. 제외 규칙 양성 ───────────────────────────────────────────
t('빈 글 → empty', one(inp('')) === 'empty')
t('공백만 → empty', one(inp('   \n\t ')) === 'empty')
t('머리말만 → empty', one(inp('[SRC: https://example.com/a]\n')) === 'empty')
t('평점만 본문 없음 → rating_only', one(inp('', { rating: 5 })) === 'rating_only')
t('기호만 → symbols_only', one(inp('...!!! ~~~ ???')) === 'symbols_only')
t('이모지만 → emoji_only', one(inp('👍👍🔥')) === 'emoji_only')
t('스팸 광고 템플릿 → ad_template', one(inp('고수익 부업 하루 30만원 보장 텔레그램 @money_king 문의')) === 'ad_template')
t('카지노 광고 → ad_template', one(inp('안전한 카지노 사이트 추천합니다 가입코드 777')) === 'ad_template')
{
  const spam = '이 제품 정말 좋아요 강력 추천합니다 링크에서 구매하세요'
  const rows = [inp(spam, { collected_at: '2026-10-01T00:00:00Z' }), inp(spam, { collected_at: '2026-10-02T00:00:00Z' }), inp(spam.replace(/ /g, '  '), { collected_at: '2026-10-03T00:00:00Z' })]
  const r = rule(rows)
  t('동일 본문 중복 — 첫 건 통과 · 나머지 duplicate', r[0] === null && r[1] === 'duplicate' && r[2] === 'duplicate')
  const rev = rule([...rows].reverse())
  t('중복 원본은 가장 이른 수집분(입력 순서 무관)', rev[2] === null && rev[0] === 'duplicate')
  t('짧은 동일 한 줄은 중복 규칙 밖(흔한 표현)', rule([inp('가격대비만족'), inp('가격대비만족')]).every((x) => x === null))
}

// ── 2. 절대 거르지 않는 것(음성) ────────────────────────────────
t('짧은 불만 "느려요" 통과', one(inp('느려요')) === null)
t('"환불" 통과', one(inp('환불')) === null)
t('"먹통" 통과', one(inp('먹통')) === null)
t('"별로" 통과', one(inp('별로')) === null)
t('"해지 안 됨" 통과', one(inp('해지 안 됨')) === null)
t('"crashes" 통과', one(inp('crashes')) === null)
t('"refund" 통과', one(inp('refund pls')) === null)
{
  const dupComplaint = '앱이 계속 먹통이 되고 환불도 안 해줍니다 진짜 최악'
  t('불만 낱말이 든 중복 본문도 통과', rule([inp(dupComplaint), inp(dupComplaint)]).every((x) => x === null))
  t('불만 낱말이 든 광고 비슷한 글도 통과', one(inp('카지노 광고 너무 많이 떠서 짜증')) === null)
}
t('평점 2 + 짧은 본문 통과', one(inp('음', { rating: 2 })) === null)
t('평점 3 + 기호 본문도 통과(본문 있음)', one(inp('...', { rating: 3 })) === null)
t('평점 1 + 중복 본문 통과', rule([inp('그냥 그런 제품이었습니다 다음엔 다른 거 살게요', { rating: 5 }), inp('그냥 그런 제품이었습니다 다음엔 다른 거 살게요', { rating: 1 })])[1] === null)
t('평점 5 + 기호만은 걸림(보호 아님)', one(inp('!!!', { rating: 5 })) === 'symbols_only')
t('영어 글 통과(중복이어도)', rule([inp('Great tool for meeting notes and summaries'), inp('Great tool for meeting notes and summaries')]).every((x) => x === null))
t('보호 사유 기록 — complaint_word', prefilterInputs([inp('느려요')], cfg, P)[0].protectedBy === 'complaint_word')
t('보호 사유 기록 — english', prefilterInputs([inp('Works fine on my iPhone')], cfg, P)[0].protectedBy === 'english')

// ── 3. 길이만으로 거르지 않는다(9/23 실측) ──────────────────────
t('짧은 일반 글(5자)은 통과', one(inp('좋네요 굿')) === null)
t('80자 미만 일반 글 통과', one(inp('배송 빠르고 포장 꼼꼼했어요')) === null)

// ── 4. 카테고리 규칙 — 지정 소스에만 ────────────────────────────
{
  const withTerms = parsePrefilterConfig({ ...raw, category_rule: { ...raw.category_rule, projects: { [P]: { product: ['오랄비'], category: ['칫솔'] } } } }, {}).cfg
  const blogMiss = inp('오늘 점심은 김치찌개 먹었다 맛있었다', { source_key: 'kakao_blog' })
  t('카카오 블로그 — 제품명·카테고리어 없음 → category_miss', one(blogMiss, withTerms) === 'category_miss')
  t('카카오 카페 — 둘 다 있음 → 통과', one(inp('오랄비 칫솔 써보니 손잡이가 무겁다', { source_key: 'kakao_cafe' }), withTerms) === null)
  t('카카오 블로그 — 제품명만 → 걸림(require both)', one(inp('오랄비 매장 다녀왔다', { source_key: 'kakao_blog' }), withTerms) === 'category_miss')
  for (const src of CATEGORY_RULE_FORBIDDEN) {
    t(`카테고리 규칙이 ${src} 에 안 걸림`, one(inp('오늘 점심은 김치찌개 먹었다 맛있었다', { source_key: src }), withTerms) === null)
  }
  const forced = parsePrefilterConfig({ ...raw, category_rule: { sources: ['kakao_blog', 'appstore', 'googleplay', 'hackernews'], require: 'both', projects: { [P]: { product: ['오랄비'], category: ['칫솔'] } } } }, {})
  t('설정에 금지 소스를 적어도 무시 + 경고', CATEGORY_RULE_FORBIDDEN.every((s) => !forced.cfg.category.sources.includes(s)) && forced.warnings.some((w) => w.includes('금지 소스')))
  t('설정에 금지 소스를 적어도 앱스토어 통과', one(inp('오늘 점심은 김치찌개 먹었다 맛있었다', { source_key: 'appstore' }), forced.cfg) === null)
  t('낱말 미설정 프로젝트는 카테고리 규칙 안 돎', one(blogMiss, withTerms, 'other-project') === null)
  const either = parsePrefilterConfig({ ...raw, category_rule: { ...raw.category_rule, require: 'either', projects: { [P]: { product: ['오랄비'], category: ['칫솔'] } } } }, {}).cfg
  t('require=either 로 완화하면 제품명만 있어도 통과', one(inp('오랄비 매장 다녀왔다', { source_key: 'kakao_blog' }), either) === null)
}

// ── 5. shadow 는 아무것도 거르지 않는다 / enforce 만 뺀다 ───────
{
  const rows = [inp(''), inp('👍'), inp('느려요'), inp('카지노 사이트 추천 가입코드')]
  const verdicts = prefilterInputs(rows, cfg, P)
  const reviews = rows.map((r) => ({ input_id: r.id, text: r.raw_text }))
  const sh = applyPrefilter(reviews, verdicts, 'shadow')
  t('shadow — kept = 전부', sh.kept.length === reviews.length)
  t('shadow — wouldDrop 은 표시', sh.wouldDrop.length === 3)
  const en = applyPrefilter(reviews, verdicts, 'enforce')
  t('enforce — 걸린 것만 뺀다', en.kept.length === 1 && en.kept[0].input_id === rows[2].id)
}

// ── 6. 모드·소스 — 설정/env ──────────────────────────────────────
t('env PREFILTER_MODE=enforce 가 이긴다', parsePrefilterConfig(raw, { PREFILTER_MODE: 'enforce' }).cfg.mode === 'enforce')
t('어휘 밖 모드는 shadow(오타로 enforce 안 됨)', parsePrefilterConfig(raw, { PREFILTER_MODE: 'enforec' }).cfg.mode === 'shadow')
{
  const onlyYt = parsePrefilterConfig(raw, { PREFILTER_SOURCES: 'youtube' }).cfg
  t('PREFILTER_SOURCES 밖 소스는 판정 안 함', one(inp('👍', { source_key: 'danawa' }), onlyYt) === null && one(inp('👍', { source_key: 'youtube' }), onlyYt) === 'emoji_only')
  t('apply_sources 목록이면 source_key 없는 입력은 대상 밖', one(inp('👍', { source_key: null }), onlyYt) === null)
}
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prefilter-'))
  const bad = path.join(dir, 'bad.json')
  fs.writeFileSync(bad, '{ not json')
  const r = loadPrefilterConfig(bad, {})
  t('설정 못 읽으면 cfg=null + error(호출부가 필터를 끈다)', r.cfg === null && typeof r.error === 'string')
  fs.rmSync(dir, { recursive: true, force: true })
}
t('깨진 광고 정규식은 그 패턴만 빠지고 경고', (() => { const r = parsePrefilterConfig({ ...raw, ad_patterns: ['(', '카지노'] }, {}); return r.cfg.adPatterns.length === 1 && r.warnings.length === 1 })())

// ── 7. 설정 완화로 결과가 바뀐다(코드 수정 없이) ─────────────────
{
  const row = inp('안전한 카지노 사이트 추천합니다 가입코드 777')
  t('완화 전: 광고 템플릿에 걸림', one(row, cfg) === 'ad_template')
  const noAd = parsePrefilterConfig({ ...raw, ad_patterns: [] }, {}).cfg
  t('ad_patterns 비우면 통과', one(row, noAd) === null)
  const moreWords = parsePrefilterConfig({ ...raw, complaint_words: [...raw.complaint_words, '가입코드'] }, {}).cfg
  t('보호 낱말을 늘리면 통과', one(row, moreWords) === null)
  const dupRows = [inp('이 제품 정말 좋아요 강력 추천합니다 링크에서 구매하세요'), inp('이 제품 정말 좋아요 강력 추천합니다 링크에서 구매하세요')]
  const noDup = parsePrefilterConfig({ ...raw, duplicate_min_chars: 1000 }, {}).cfg
  t('duplicate_min_chars 를 올리면 중복도 통과', rule(dupRows, noDup).every((x) => x === null))
  const noRating = parsePrefilterConfig({ ...raw, low_rating_max: 0 }, {}).cfg
  t('low_rating_max 를 바꾸면 결과가 바뀐다(조이는 쪽 확인)', one(inp('...', { rating: 3 }), noRating) === 'symbols_only')
}

// ── 8. 오탈락률 측정 — 재현 가능 seed · 층별 · 판정 3상태 ────────
{
  const items = Array.from({ length: 50 }, (_, i) => ({ input_id: `x${String(i).padStart(3, '0')}`, stratum: i < 45 ? '1|danawa' : '2|kakao_blog' }))
  const a = sampleFlagged(items, { n: 10, seed: 7 })
  const b = sampleFlagged([...items].reverse(), { n: 10, seed: 7 })
  t('같은 seed = 같은 표본(입력 순서 무관)', a.map((x) => x.input_id).join() === b.map((x) => x.input_id).join())
  t('다른 seed = 다른 표본', sampleFlagged(items, { n: 10, seed: 8 }).map((x) => x.input_id).join() !== a.map((x) => x.input_id).join())
  t('작은 층도 표본에 들어간다(라운드로빈)', a.filter((x) => x.stratum === '2|kakao_blog').length === 5)
  t('n 보다 후보가 적으면 전부', sampleFlagged(items.slice(0, 3), { n: 200 }).length === 3)
  const fr = falseDropRate([{ verdict: 'relevant' }, { verdict: 'irrelevant' }, { verdict: 'irrelevant', human_verdict: 'relevant' }, { verdict: 'unknown' }, {}])
  t('오탈락률 — 사람이 이기고 unknown·미판정은 분모 밖', fr.relevant === 2 && fr.irrelevant === 1 && fr.unknown === 1 && fr.unjudged === 1 && Math.abs(fr.rate - 2 / 3) < 1e-9)
  t('판정 0건이면 rate=null(확인 불가)', falseDropRate([{ verdict: 'unknown' }]).rate === null)
  t('영역 = label 접두', areaOfProject(['3:klaviyo', '3:klaviyo-b']) === '3' && areaOfProject(['1:a', '2:b']) === 'mixed' && areaOfProject(['otter', null]) === 'unmapped')

  const inputs = [
    ...Array.from({ length: 120 }, (_, i) => ({ id: `s${String(i).padStart(3, '0')}`, project_id: 'pA', raw_text: '👍', source_key: 'danawa' })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, project_id: 'pB', raw_text: '!!!', source_key: 'youtube' })),
    { id: 'keep', project_id: 'pA', raw_text: '느려요', source_key: 'danawa' },
  ]
  const verdicts = inputs.map((i, k) => ({ input_id: i.id, verdict: k === 0 ? 'relevant' : k < 100 ? 'irrelevant' : null }))
  const r = buildFalseDropSample({ projects: [{ id: 'pA', area: '1' }, { id: 'pB', area: '2' }], inputs, verdicts, cfg, n: 200, seed: 42 })
  t('측정 — 걸린 것만 후보(보호 글 제외)', r.totalFlagged === 125 && !r.ids.includes('keep'))
  t('측정 — 층별 모집단', r.population['1|danawa'] === 120 && r.population['2|youtube'] === 5)
  t('측정 — 판정 없는 표본만 재판정 입력', (r.rejudge.pA?.reviews.length ?? 0) === 20 && (r.rejudge.pB?.reviews.length ?? 0) === 5)
  t('측정 — 1/100 = 1% → enforce_ok', r.overall.rate === 0.01 && r.decision === 'enforce_ok')
  const few = buildFalseDropSample({ projects: [], inputs: inputs.slice(0, 10), verdicts, cfg, n: 200, seed: 42 })
  t('측정 — 판정 100건 미만이면 insufficient', few.decision === 'insufficient')
  const bad = buildFalseDropSample({ projects: [], inputs, verdicts: inputs.map((i) => ({ input_id: i.id, verdict: i.id < 's010' ? 'relevant' : 'irrelevant' })), cfg, n: 200, seed: 42 })
  t('측정 — 5% 초과면 relax', bad.decision === 'relax')
}

// ── 9. 광고 정규식 오탐 반례(독립 검토 재현) — 실사용 글은 ad_template 이 아니다 ─────
for (const s of [
  '저신용 대출 신청했는데 거절당했어요 이유도 안 알려줌',
  '고수익 부업 광고 보고 가입했는데 돈만 날림',
  '재택 알바 찾기 편해요',
  '강원랜드 카지노 근처 숙소 리뷰',
  '카지노 미니게임 재밌네요',
  '텔레그램 @mybot 연동 기능 좋아요',
]) {
  const r = prefilterInputs([inp(s)], cfg, P)[0]
  t(`광고 오탐 없음: "${s}"`, r.rule !== 'ad_template')
}
// 보호 낱말 없이도 광고 규칙 자체가 안 걸리는지(보호에 기대지 않는다)
const noWords = parsePrefilterConfig({ ...raw, complaint_words: [] }, {}).cfg
for (const s of ['저신용 대출 신청했는데 거절당했어요 이유도 안 알려줌', '고수익 부업 광고 보고 가입했는데 돈만 날림', '재택 알바 찾기 편해요', '강원랜드 카지노 근처 숙소 리뷰', '카지노 미니게임 재밌네요', '텔레그램 @mybot 연동 기능 좋아요']) {
  t(`광고 정규식 자체 음성: "${s}"`, one(inp(s), noWords) !== 'ad_template')
}
for (const s of [
  '고수익 부업 하루 30만원 보장 텔레그램 @money_king 문의',
  '저신용 대출 당일 가능 문의 주세요 open.kakao.com/o/abc',
  '재택 부업 수익 보장 https://spam.example/join',
  '토토 사이트 가입코드 777 첫충 20%',
]) {
  t(`진짜 광고(연락처 동반)는 걸림: "${s}"`, one(inp(s), noWords) === 'ad_template')
}

t('링크 섞인 영어 글은 여전히 영어 보호', prefilterInputs([inp('Great app for notes, docs at https://example.com/help')], noWords, P)[0].protectedBy === 'english')

// ── 10. 불만 낱말 보강(설정 파일) ────────────────────────────────
for (const s of ['자꾸 꺼집니다', '디자인이 아쉬워요', '불만 많음', '결제 거절', '돈만 날림', '가격이 비쌉니다', '화면이 버벅여요']) {
  t(`불만 낱말 보호: "${s}"`, prefilterInputs([inp(s)], cfg, P)[0].protectedBy === 'complaint_word')
}

// ── 11. 오탈락률 — 한 층 전체 오탈락이 전체 비율에 묻히지 않는다(검토자 픽스처) ─────
{
  const inputs = [
    ...Array.from({ length: 300 }, (_, i) => ({ id: `d${String(i).padStart(3, '0')}`, project_id: 'pD', raw_text: '👍', source_key: 'danawa' })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `k${i}`, project_id: 'pK', raw_text: '!!!', source_key: 'kakao_blog' })),
  ]
  const verdicts = inputs.map((i) => ({ input_id: i.id, verdict: i.source_key === 'kakao_blog' ? 'relevant' : 'irrelevant' }))
  const r = buildFalseDropSample({ projects: [{ id: 'pD', area: '1' }, { id: 'pK', area: '1' }], inputs, verdicts, cfg, n: 200, seed: 42 })
  t('검토 픽스처 — 표본 비율 5.0%(예전엔 enforce_ok)', Math.abs(r.overall.rate - 0.05) < 1e-9)
  t('검토 픽스처 — kakao_blog 층 경보', r.stratumAlerts.includes('1|kakao_blog'))
  t('검토 픽스처 — 판단 relax', r.decision === 'relax')
  t('모집단 가중 비율 = 10/310', Math.abs(r.weightedRate - 10 / 310) < 1e-9)
  const thin = buildFalseDropSample({ projects: [], inputs: [...inputs.slice(0, 300), ...inputs.slice(300, 303)], verdicts, cfg, n: 200, seed: 42 })
  t('판정 5건 미만 층은 경보 대신 strata_thin', thin.strataThin.includes('unmapped|kakao_blog') && !thin.stratumAlerts.includes('unmapped|kakao_blog'))
}

// ── 12. pendingFor 연결부 실행(모의 supabase) — 조회 컬럼·42703 폴백·모든 반환의 rating·필터 기록·예외 ─────
{
  const { createPendingFor } = await import('../lib/analysis/relevance-pending.ts')
  const rows = [
    { id: 'u1', raw_text: '배송 빠르고 포장 꼼꼼했어요 만족합니다', created_at: '2026-10-01T00:00:00Z', collected_at: null, source_key: 'danawa', rating: 5 },
    { id: 'u2', raw_text: '👍👍', created_at: '2026-10-02T00:00:00Z', collected_at: null, source_key: 'danawa', rating: 5 },
    { id: 'u3', raw_text: '앱이 느려요', created_at: '2026-10-03T00:00:00Z', collected_at: null, source_key: 'danawa', rating: 2 },
    { id: 'u4', raw_text: '이미 판정된 글입니다 그냥 그래요', created_at: '2026-10-04T00:00:00Z', collected_at: null, source_key: 'danawa', rating: 3 },
  ]
  const mock = ({ ratingMissing = false, inputs = rows } = {}) => {
    const calls = []
    return {
      calls,
      from(table) {
        let cols = ''
        const b = {
          select(c) { cols = c; calls.push(`${table}:${c}`); return b },
          eq() { return b },
          is() { return b },
          then(res, rej) {
            let out
            if (table === 'analysis_inputs') {
              out = ratingMissing && /rating/.test(cols)
                ? { data: null, error: { code: '42703', message: 'column analysis_inputs.rating does not exist' } }
                : { data: inputs.map((r) => (ratingMissing ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'rating')) : r)), error: null }
            } else out = { data: [{ input_id: 'u4' }], error: null }
            return Promise.resolve(out).then(res, rej)
          },
        }
        return b
      },
    }
  }
  const warns = []
  const base = { sampleSize: 200, highRatingShare: 0.2, log: () => {}, warn: (m) => warns.push(m) }
  const hasRating = (p) => p && p.rating && typeof p.rating.low === 'number' && typeof p.rating.high_cap === 'number'

  const sb1 = mock()
  const off = createPendingFor({ ...base, supabase: sb1, prefilterCfg: null })
  const r0 = await off.pendingFor({ id: 'pX' })
  t('연결 — 필터 꺼짐 경로에도 rating', hasRating(r0) && r0.reviews.length === 3)
  t('연결 — 조회 컬럼에 source_key·rating', sb1.calls[0].includes('source_key') && sb1.calls[0].includes('rating'))

  const sh = createPendingFor({ ...base, supabase: mock(), prefilterCfg: cfg })
  const r1 = await sh.pendingFor({ id: 'pX' })
  t('연결 — shadow 경로 rating · 아무것도 안 뺌', hasRating(r1) && r1.reviews.length === 3)
  t('연결 — 판정 캐시 제외(u4)', !r1.reviews.some((r) => r.input_id === 'u4'))
  const rec = sh.prefilterByProject.pX
  t('연결 — detail 기록(would_drop u2 emoji_only)', rec && rec.mode === 'shadow' && rec.would_drop.some(([id, rule]) => id === 'u2' && rule === 'emoji_only') && rec.rating_column === 'present')
  t('연결 — 평점 우선 자르기 통계(저 2: u3·… / 고)', r1.rating.low >= 1 && r1.rating.high >= 1)

  const sb3 = mock({ ratingMissing: true })
  const fb = createPendingFor({ ...base, supabase: sb3, prefilterCfg: cfg })
  const r2 = await fb.pendingFor({ id: 'pX' })
  t('연결 — 42703 폴백: rating 없이 다시 조회', fb.state.ratingColumn === 'absent' && sb3.calls.length >= 2 && !sb3.calls[1].includes('rating') && sb3.calls[1].includes('source_key'))
  t('연결 — 폴백 경로에도 rating(전부 없음)', hasRating(r2) && r2.rating.none === r2.total && warns.some((w) => w.includes('42703')))

  const en = createPendingFor({ ...base, supabase: mock(), prefilterCfg: { ...cfg, mode: 'enforce' } })
  const r3 = await en.pendingFor({ id: 'pX' })
  t('연결 — enforce 경로 rating · 걸린 것만 뺌', hasRating(r3) && r3.reviews.length === 2 && !r3.reviews.some((r) => r.input_id === 'u2'))

  const broken = createPendingFor({ ...base, supabase: mock(), prefilterCfg: { ...cfg, complaintWords: null } })
  const r4 = await broken.pendingFor({ id: 'pX' })
  t('연결 — 필터 예외면 경고 후 전부 통과 · rating 유지 · 필터 꺼짐', hasRating(r4) && r4.reviews.length === 3 && broken.currentPrefilter() === null && warns.some((w) => w.includes('사전필터 예외')))

  const empty = await createPendingFor({ ...base, supabase: mock({ inputs: [] }), prefilterCfg: cfg }).pendingFor({ id: 'pX' })
  t('연결 — 입력 0건은 대상 아님(reviews 0, rating null)', empty.reviews.length === 0 && empty.rating === null)
}

console.log(`prefilter-selftest: ${pass} 통과 · ${fail} 실패`)
process.exit(fail > 0 ? 1 : 0)
