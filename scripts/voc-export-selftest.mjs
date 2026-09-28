// 리서처 VOC 입력 경로(P1) 자체 검증. 네트워크·DB 없이 돈다.
//
//   node scripts/voc-export-selftest.mjs
//
// 조용히 틀리는 지점:
//   1) 사람이 irrelevant 라 한 리뷰가 LLM relevant 로 다시 재료가 되는가 (사람 판정 우선)
//   2) purge 된 원문(raw_text NULL)이 빈 텍스트로 리서처에게 가는가
//   3) 상한·정렬이 뒤집혀 impact low 가 앞에 오는가
//   4) 초안의 voc_inputs 가 형식 검사 없이 통과해 DB FK(23503) 까지 가는가
//   5) 프롬프트가 없는 파일을 Read 하라고 시키는가 (파일 없음 = VOC 줄 없음)
//   6) 마이그 테이블·컬럼 이름이 연결 설계 §5-1 과 갈라졌는가 (feat/case-auto-approval 이 같은 이름을 읽는다)

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { effectiveVerdict, verdictBy, clipText, groupVoc, renderIndex, OUT_DIR, INDEX_FILE } from './voc-export.mjs'
import { researchPrompt, VOC_INPUTS_INDEX } from './cmo-daily.mjs'
import { validateDraft, toRows, UUID_RE } from '../lib/cases/draft.ts'

let passed = 0
const failures = []
const check = (name, cond, detail = '') => { if (cond) passed++; else failures.push(`${name}${detail ? ` — ${detail}` : ''}`) }
const eq = (name, actual, expected) => check(name, Object.is(actual, expected), `기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`)

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const row = (n, over = {}) => ({
  input_id: U(n), project_id: 'p1', verdict: 'relevant', human_verdict: null, auto_approved_at: null,
  impact: null, frequency: null, community_signal: null, wtp_mentioned: null,
  analysis_inputs: { raw_text: `리뷰 ${n}`, source_type: 'review', collected_at: `2026-09-${String(10 + n).padStart(2, '0')}T00:00:00Z` },
  ...over,
})

// ── 판정 정본 ──
eq('사람 판정이 LLM 을 이긴다', effectiveVerdict({ verdict: 'relevant', human_verdict: 'irrelevant' }), 'irrelevant')
eq('사람 판정 없으면 LLM', effectiveVerdict({ verdict: 'relevant', human_verdict: null }), 'relevant')
eq('둘 다 없으면 unknown (양성으로 접지 않는다)', effectiveVerdict({}), 'unknown')
eq('verdict_by — 사람', verdictBy({ human_verdict: 'relevant', auto_approved_at: 'x' }), 'human')
eq('verdict_by — 자동 승인', verdictBy({ human_verdict: null, auto_approved_at: 'x' }), 'auto')
eq('verdict_by — LLM 만', verdictBy({ human_verdict: null, auto_approved_at: null }), 'llm')

// ── 절단 ──
eq('짧은 본문은 그대로', clipText('  a   b\n c ', 10), 'a b c')
check('긴 본문은 잘리고 말줄임이 붙는다', clipText('x'.repeat(50), 10) === 'x'.repeat(10) + '…')

// ── 선택 규칙 ──
{
  const g = groupVoc([
    row(1),                                                       // LLM relevant → 포함
    row(2, { human_verdict: 'relevant', verdict: 'irrelevant' }), // 사람 relevant → 포함
    row(3, { human_verdict: 'irrelevant' }),                      // 사람 irrelevant → 제외 (LLM 이 뭐라 했든)
    row(4, { human_verdict: 'unknown' }),                         // 사람 unknown → 제외
    row(5, { verdict: 'unknown' }),                               // LLM unknown → 제외
    row(6, { analysis_inputs: { raw_text: null, source_type: 'review', collected_at: null } }), // purge → 제외
    row(7, { analysis_inputs: { raw_text: '광고', source_type: 'ad', collected_at: null } }),    // 광고 → 제외
    row(8, { project_id: 'p2' }),
  ])
  const p1 = g.get('p1')
  eq('p1 — 포함 2건 (LLM relevant + 사람 relevant)', p1.items.length, 2)
  check('p1 — 사람 irrelevant/unknown·purge·광고 전부 빠졌다', !p1.items.some((i) => [U(3), U(4), U(5), U(6), U(7)].includes(i.input_id)))
  eq('p2 — 다른 프로젝트는 따로 묶인다', g.get('p2').items.length, 1)
  eq('verdict_by 가 항목에 실린다', p1.items.find((i) => i.input_id === U(2)).verdict_by, 'human')
  check('source_key 는 내보내지 않는다', !('source_key' in p1.items[0]), JSON.stringify(Object.keys(p1.items[0])))
  check('라벨 미적용이면 null (false 로 접지 않는다)', p1.items[0].labels.wtp_mentioned === null && p1.items[0].labels.impact === null)
}

// ── 정렬·상한 ──
{
  const g = groupVoc([
    row(1, { impact: 'low' }), row(2, { impact: null }), row(3, { impact: 'high' }), row(4, { impact: 'mid' }), row(5, { impact: 'high' }),
  ], { cap: 3 })
  const ids = g.get('p1').items.map((i) => i.input_id)
  check('impact high 가 앞, 같은 등급은 최신 먼저', ids[0] === U(5) && ids[1] === U(3) && ids[2] === U(4), ids.join(','))
  eq('상한 3건으로 잘린다', ids.length, 3)
  eq('total 은 상한 전 건수', g.get('p1').total, 5)
}

// ── index.md ──
{
  const empty = renderIndex([], { generatedAt: 'T' })
  check('0건이면 본문에 "0건" 을 명시 (파일 없음과 구분)', /\*\*0건\*\*/.test(empty))
  const idx = renderIndex([{ id: 'p1', competitor_url: 'https://a.example', market: 'SaaS', business_model: 'SAAS', bottleneck: 'TRUST', pitch: 'x', count: 2, total: 5 }], { generatedAt: 'T', labels: 'absent' })
  check('프로젝트 줄에 id·건수·전체가 있다', /`p1` .*VOC 2건 \(전체 5\)/.test(idx))
  check('라벨 미적용 안내가 붙는다', /20260930000014/.test(idx))
  check('"근거가 아니다" 를 맨 위에 못박는다', /근거\(evidence\)가 아니다/.test(idx))
}

// ── 초안 검증 (voc_inputs) ──
{
  const base = () => ({
    slug: 'acme', brand_name: 'Acme', moves: [{ lever: 'OFFER', claim: '가격을 반으로 내렸다', transfer_note: '내일 가격표를 바꿔라', outcome_direction: 'positive' }], evidence: [],
  })
  const errs = (d) => validateDraft(d).filter((i) => i.level === 'error')
  const withVoc = (v) => { const d = base(); d.moves[0].voc_inputs = v; return d }
  eq('voc_inputs 없음 → 아무 말 없음', errs(base()).filter((e) => /voc/.test(e.where)).length, 0)
  eq('빈 배열 → 아무 말 없음', errs(withVoc([])).filter((e) => /voc/.test(e.where)).length, 0)
  eq('올바른 uuid 2개 → 통과', errs(withVoc([U(1), U(2)])).filter((e) => /voc/.test(e.where)).length, 0)
  check('배열이 아니면 error', errs(withVoc('abc')).some((e) => /voc_inputs/.test(e.where) && /배열/.test(e.message)))
  check('uuid 아니면 error (DB FK 까지 가지 않는다)', errs(withVoc(['not-a-uuid'])).some((e) => /voc_inputs\[0\]/.test(e.where)))
  check('같은 id 두 번이면 error', errs(withVoc([U(1), U(1).toUpperCase()])).some((e) => /voc_inputs\[1\]/.test(e.where) && /두 번/.test(e.message)))
  check('UUID_RE 가 대문자도 받는다', UUID_RE.test(U(1).toUpperCase()))
  const { moves } = toRows(withVoc([U(1).toUpperCase()]))
  eq('toRows — 소문자로 정규화해 따로 돌려준다', moves[0].voc_inputs[0], U(1))
  check('toRows — case_moves 행에는 넣지 않는다 (컬럼 없음)', !('voc_inputs' in moves[0].row))
  check('toRows — 없으면 빈 배열', Array.isArray(toRows(base()).moves[0].voc_inputs) && toRows(base()).moves[0].voc_inputs.length === 0)
}

// ── 프롬프트 — 파일 없으면 VOC 줄 없음 ──
{
  const item = { brand_name: '미정', reason: 'coverage_gap' }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voc-'))
  const idx = path.join(tmp, 'index.md')
  const without = researchPrompt(item, '2026-09-28', [], path.join(tmp, 'nope.md'), path.join(tmp, 'nope-index.md'))
  check('색인 파일 없음 → 프롬프트에 VOC 줄이 없다 (없는 파일을 Read 시키지 않는다)', !/VOC 재료/.test(without))
  fs.writeFileSync(idx, '# x\n')
  const withIdx = researchPrompt(item, '2026-09-28', [], path.join(tmp, 'nope.md'), idx)
  check('색인 파일 있음 → VOC 줄 + 경로', new RegExp(`VOC 재료: \`${idx.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}\``).test(withIdx))
  check('프롬프트가 원문 복사 금지·근거 아님을 말한다', /원문을 초안·조사 노트에 옮기지 않는다/.test(withIdx) && /수치 근거가 아니다/.test(withIdx))
  eq('기본 색인 경로 = 내보내기 출력 경로', VOC_INPUTS_INDEX, INDEX_FILE.replace(/\\/g, '/'))
  fs.rmSync(tmp, { recursive: true, force: true })
}

// ── 배선·이름 고정 (소스 검사) ──
{
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf-8')
  const mig = read('../supabase/migrations/20260930000028_case_move_inputs.sql')
  check('마이그 — 테이블 이름이 연결 설계 §5-1 그대로', /CREATE TABLE IF NOT EXISTS public\.case_move_inputs \(/.test(mig))
  for (const col of ['case_move_id uuid NOT NULL REFERENCES public.case_moves(id)', 'input_id     uuid NOT NULL REFERENCES public.analysis_inputs(id)', 'linked_by    text NOT NULL', 'created_at   timestamptz NOT NULL DEFAULT now()', 'PRIMARY KEY (case_move_id, input_id)']) {
    check(`마이그 — 컬럼 고정: ${col.split(/\s+/)[0]}`, mig.includes(col))
  }
  check('마이그 — RLS FORCE (service_role 전용)', /FORCE\s+ROW LEVEL SECURITY/.test(mig))
  check('마이그 — "미적용" 을 명시한다', /\*\*미적용\*\*/.test(mig))
  check('롤백 파일이 있고 DROP TABLE 이다', /DROP TABLE IF EXISTS public\.case_move_inputs/.test(read('../supabase/migrations/20260930000028_case_move_inputs_rollback.sql')))

  const review = read('./case-review.mjs')
  check('commit — case_move_inputs 에 INSERT 한다', /from\('case_move_inputs'\)\.insert\(row\)/.test(review))
  check('commit — 테이블 없음(42P01/PGRST205)은 경고·건너뜀', /42P01\|PGRST205/.test(review) && /20260930000028 미적용/.test(review))
  check('commit — linked_by 를 NULL 로 두지 않는다', /linkedBy = opt\('by'\) \?\? draft\.researched_by \?\? 'sa-cmo-researcher'/.test(review))

  const daily = read('./cmo-daily.mjs')
  check('S2 research — 조사 전에 voc-export.mjs 를 돌린다', /sh\('node', \['scripts\/voc-export\.mjs'\]\)/.test(daily))
  check('S2 research — 3상태(written/none/unavailable)를 detail 에 남긴다', /voc_export: vocExport/.test(daily) && /unavailable — exit/.test(daily) && /none — /.test(daily))

  const gi = read('../.gitignore')
  check('.gitignore — 내보내기 폴더는 커밋되지 않는다(공개 리포·purge)', gi.split(/\r?\n/).includes(OUT_DIR.replace(/\\/g, '/') + '/'))
  check('연구원 문서 — VOC 규칙이 있다', /voc_inputs/.test(read('../.claude/agents/sa-cmo-researcher.md')))
}

console.log(`\n통과 ${passed} / 실패 ${failures.length}`)
if (failures.length) { for (const f of failures) console.error(`  ✗ ${f}`); process.exit(1) }
console.log('✓ 리서처 VOC 입력 경로 자체 검증 통과')
