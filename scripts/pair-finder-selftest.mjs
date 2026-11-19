#!/usr/bin/env node
// [v71cu 쌍 찾기 회귀] lib/consult/pairs.ts(점수·순위 미러) + 마이그 20261120000010 정적 점검. 모델·DB·키 없음. 종료 코드 0 = 통과.
// 한계: 여기서는 SQL 을 실제로 돌리지 않는다(CI 에 Postgres 없음). 작성 시점에 로컬 임시 Postgres(PGlite)로 SQL 결과 = 이 미러(k·문턱 5조합)를 한 번 대조했다
//   (reports/2026-11-20-pair-finder/impl.md §3). 실제 DB 에서는 적용 뒤 scripts/pair-finder-queries.sql V1~V4 로 본다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PAIR_WEIGHTS, normField, pairScore, diffCandidates, matchPairs, summarizePairs } from '../lib/consult/pairs.ts'

const ep = (slug, idx, result_class, o = {}) => ({ source_key: 'starterstory', slug, episode_idx: idx, chapter: 5, mechanism_norm: 'm1', result_class, result_grain: 'metric', evidence_strength: 'B', text_depth: 'story', ...o })
const sit = { customer: 'smb', stage: 'growing', price_band: '10-49', team_size: 'solo', pricing_model: 'subscription', domain: 'Email Tools', sub_topic: 'cold outreach' }

// ① 점수: 가중치 합 10, 전부 같으면 10, 자유 문장은 대소문자·공백 무시
assert.equal(Object.values(PAIR_WEIGHTS).reduce((a, b) => a + b, 0), 10)
assert.equal(pairScore(ep('l', 0, 'negative', sit), ep('w', 0, 'positive', { ...sit, domain: ' email tools ', sub_topic: 'Cold Outreach' })), 10)
// ② 모름은 일치가 아니다: unknown·빈 값·NULL 끼리 0 점. 탈락이 아니라 감점
const unk = { customer: 'unknown', stage: 'unknown', price_band: 'unknown', team_size: 'unknown', pricing_model: 'unknown', domain: '', sub_topic: null }
assert.equal(pairScore(ep('l', 0, 'negative', unk), ep('w', 0, 'positive', unk)), 0)
assert.equal(normField('domain', ' Unknown '), null)
assert.equal(pairScore(ep('l', 0, 'negative', { ...sit, stage: 'unknown' }), ep('w', 0, 'positive', { ...sit, stage: 'unknown' })), 9)
assert.equal(pairScore(ep('l', 0, 'negative', { customer: 'smb', stage: 'growing' }), ep('w', 0, 'positive', { customer: 'smb', stage: 'zero_rev' })), 1)
// ③ 차이 후보: [된 쪽, 안 된 쪽], 닫힌 칸은 둘 다 알 때만
assert.deepEqual(diffCandidates(ep('w', 0, 'positive', { stage: 'growing', customer: 'unknown', condition_ko: '가' }), ep('l', 0, 'negative', { stage: 'zero_rev', customer: 'smb', condition_ko: null })),
  { stage: ['growing', 'zero_rev'], condition_ko: ['가', null] })

// ④ 매칭: 앵커는 negative·mixed, 후보는 같은 칸의 positive(signal 제외)·다른 글, 글당 1개, 상위 k, 문턱
const eps = [
  ep('lose-a', 1, 'negative', sit),
  ep('lose-a', 2, 'positive', sit),                                         // 같은 글의 된 에피소드는 짝이 못 된다
  ep('win-1', 0, 'positive', { ...sit, evidence_strength: 'C' }),            // 10점 C
  ep('win-1', 3, 'positive', { ...sit, evidence_strength: 'A' }),            // 10점 A → 글 win-1 의 대표
  ep('win-2', 0, 'positive', { ...sit, sub_topic: 'seo' }),                  // 7점
  ep('win-3', 0, 'positive', { ...sit, sub_topic: 'seo', domain: 'crm' }),   // 5점
  ep('win-4', 0, 'positive', { customer: 'smb', stage: 'growing' }),         // 2점 (문턱에 딱)
  ep('win-5', 0, 'positive', { customer: 'smb' }),                           // 1점 → 문턱 미달
  ep('win-sig', 0, 'positive', { ...sit, result_grain: 'signal' }),          // signal 은 된 쪽이 아니다
  ep('win-other-cell', 0, 'positive', { ...sit, mechanism_norm: 'm2' }),
  ep('win-other-ch', 0, 'positive', { ...sit, chapter: 6 }),
  ep('lose-etc', 0, 'negative', { ...sit, mechanism_norm: '기타' }),          // 기타·NULL 은 앵커가 못 된다
  ep('lose-null', 0, 'negative', { ...sit, mechanism_norm: null }),
  ep('none-x', 0, 'none', sit), ep('unk-x', 0, 'unknown', sit),
  ep('lose-b', 0, 'mixed', { customer: 'consumer' }),                        // 2점 이상 짝이 없다 → 행 0
]
const m = matchPairs(eps)
assert.deepEqual(m.map((r) => [r.lose_slug, r.lose_ep, r.rank, r.win_slug, r.win_ep, r.score]),
  [['lose-a', 1, 1, 'win-1', 3, 10], ['lose-a', 1, 2, 'win-2', 0, 7], ['lose-a', 1, 3, 'win-3', 0, 5]])
assert.equal(m[2].cross_domain, true); assert.equal(m[0].cross_domain, false)
assert.deepEqual(matchPairs(eps, 5).map((r) => r.win_slug), ['win-1', 'win-2', 'win-3', 'win-4'], 'k=5 여도 문턱 미달(win-5)은 안 들어간다')
assert.equal(matchPairs(eps, 5, 0).length, 10, 'min_score 0: lose-a 5개 + lose-b 5개(된 글 6개 중 상위 5)')
assert.equal(matchPairs(eps, 5, 0).filter((r) => r.lose_slug === 'lose-b' && r.win_slug === 'lose-a').length, 1, '다른 글의 된 에피소드는 그 글이 다른 칸에서 앵커여도 짝이 된다')

// ⑤ 멱등: 입력 순서를 뒤집어도, 두 번 돌려도 같은 결과. 동점은 증거 → md5 → slug 로 갈린다
const key = (rows) => JSON.stringify(rows.map((r) => [r.lose_slug, r.lose_ep, r.rank, r.win_slug, r.win_ep, r.score]).sort())
assert.equal(key(matchPairs([...eps].reverse())), key(m))
const ties = [ep('l', 0, 'negative', sit), ...['t1', 't2', 't3', 't4', 't5'].map((s) => ep(s, 0, 'positive', sit)), ep('t-a', 0, 'positive', { ...sit, evidence_strength: 'A' })]
const t1 = matchPairs(ties), t2 = matchPairs([...ties].reverse())
assert.equal(t1[0].win_slug, 't-a', '동점이면 증거 A 가 먼저')
assert.deepEqual(t1.map((r) => r.win_slug), t2.map((r) => r.win_slug))
assert.equal(new Set(t1.map((r) => r.win_slug)).size, 3)

// ⑥ 집계: 통과 칸 = 서로 다른 안 된 글 ≥3 ∧ 서로 다른 된 글 ≥2 (쌍 수가 아니다)
const row = (ch, mech, lose, win, rank, score, o = {}) => ({ chapter: ch, mechanism_norm: mech, lose_source: 's', lose_slug: lose, lose_ep: 0, lose_class: 'negative', win_source: 's', win_slug: win, rank, score, diff_candidates: {}, ...o })
const d = { diff_candidates: { stage: ['growing', 'zero_rev'] } }
const rows = [
  row(5, 'm1', 'a', 'w1', 1, 4, d), row(5, 'm1', 'b', 'w1', 1, 3, d), row(5, 'm1', 'c', 'w2', 1, 2, d),   // 안 된 글 3 · 된 글 2 → 통과, 차이도 반복
  row(5, 'm2', 'd', 'w1', 1, 5), row(5, 'm2', 'd', 'w2', 2, 4), row(5, 'm2', 'd', 'w3', 3, 3),            // 쌍은 3개지만 안 된 글 1 → 탈락
  row(6, 'm1', 'e', 'w1', 1, 2), row(6, 'm1', 'f', 'w1', 1, 2), row(6, 'm1', 'g', 'w1', 1, 2),            // 된 글 1 → 탈락
  row(6, 'm1', 'g', 'w9', 4, 2, { lose_class: 'mixed' }),                                                // rank 4 는 기본 집계 밖
]
const s = summarizePairs(rows)
assert.equal(s.pairs, 9); assert.equal(s.anchors, 7); assert.equal(s.cells, 3)
assert.deepEqual(s.passing_cell_keys, ['5|m1'])
assert.deepEqual(s.by_chapter, { 5: { pairs: 6, anchors: 4, negative: 6, mixed: 0 }, 6: { pairs: 3, anchors: 3, negative: 3, mixed: 0 } })
assert.deepEqual(s.score_dist, { 2: 4, 3: 2, 4: 2, 5: 1 })
assert.deepEqual(s.repeated_diffs, [{ cell: '5|m1', diff: 'stage: growing → zero_rev', lose_stories: 3, win_stories: 2 }])
assert.equal(summarizePairs(rows, 5).passing_cells, 2, 'rank 를 5 까지 넓히면 6|m1 도 된 글 2 로 통과')
assert.equal(summarizePairs([]).passing_cells, 0)

// ⑦ 마이그 정적 점검: 가중치가 미러와 같고, 보안 자세·멱등 장치가 빠지지 않았다. 다른 쌍 객체·깃발을 건드리지 않는다
const sql = readFileSync(new URL('../supabase/migrations/20261120000010_outcome_pairs_matched.sql', import.meta.url), 'utf8')
const body = sql.replace(/--.*$/gm, '')
for (const [f, w] of Object.entries(PAIR_WEIGHTS)) assert.match(body, new RegExp(`l\\.${f}\\s*=\\s*w\\.${f}\\s+THEN ${w} `), `SQL 가중치 ${f}=${w}`)
assert.match(body, /SECURITY DEFINER\s+SET search_path = ''/)
assert.match(body, /k int DEFAULT 3, min_score int DEFAULT 2/)
assert.match(body, /ENABLE ROW LEVEL SECURITY/)
assert.match(body, /REVOKE ALL ON public\.outcome_pairs_matched FROM PUBLIC, anon, authenticated/)
assert.match(body, /REVOKE ALL ON FUNCTION public\.refresh_outcome_pairs_matched\(int, int\) FROM PUBLIC, anon, authenticated/)
assert.doesNotMatch(body, /GRANT[^;]*\bTO\b[^;]*\b(anon|authenticated|public)\b/i, 'anon·authenticated 에 주는 권한이 없어야 한다')
assert.doesNotMatch(body, /CREATE POLICY/i)
assert.match(body, /DELETE FROM public\.outcome_pairs_matched WHERE true/)
assert.match(body, /pg_advisory_xact_lock/)
assert.match(body, /ANALYZE pg_temp\._opm_ep/, '임시 표에 통계를 잡는다(없으면 계획이 중첩 루프로 떨어진다)')
assert.match(body, /ranked AS MATERIALIZED/)
assert.doesNotMatch(body, /outcome_pairs_repeated|DROP \w+ (IF EXISTS )?public\.|ALTER TABLE public\.ss_|UPDATE public\.|INSERT INTO public\.ss_|CREATE OR REPLACE VIEW/i, '기존 표·뷰 정의를 바꾸지 않는다')
assert.equal((body.match(/DELETE FROM/g) ?? []).length, 1)
const rb = readFileSync(new URL('../supabase/migrations/20261120000010_outcome_pairs_matched_rollback.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '')
assert.deepEqual(rb.match(/DROP \w+ IF EXISTS public\.\w+/g), ['DROP FUNCTION IF EXISTS public.refresh_outcome_pairs_matched', 'DROP TABLE IF EXISTS public.outcome_pairs_matched'])
// 소비 코드가 깃발을 새로 읽지 않는다(OFF 유지 전제)
for (const f of ['../lib/consult/pairs.ts', './pair-finder-refresh.mjs']) assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''), /PAIR_FINDER_ENABLED/)

console.log('pair-finder-selftest: 통과')
