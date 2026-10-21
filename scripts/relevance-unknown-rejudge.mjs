#!/usr/bin/env node
// 1차 unknown 재판정 — **설계 + 드라이런 전용**(v71bb ④). LLM 을 부르지 않고 DB 에 쓰지 않는다. 실행 모드는 일부러 없다.
//   node --env-file=.env.local scripts/relevance-unknown-rejudge.mjs [--sample=100] [--json]
// 하는 일: verdict='unknown' ∧ 사람 채점 없음 행을 읽어
//   (1) 판정 이유(reason)를 사유 묶음으로 가른다 — 본문 정보 부족(재판정해도 unknown 일 가능성 큼) / 그 밖
//   (2) 묶음별 원문 길이 중앙값 — "본문이 짧아서 모름"인지 수치로 본다
//   (3) 재판정 후보(본문 정보 부족이 아닌 묶음)에서 결정적 표본 N건(input_id 해시 순) — 정밀도 확인 패널용 id 목록
//   (4) 비용 추정: 후보 수 × 실측 단가(1차 claude-cli $0.0048/건 = 10-20 실측 $0.0959/20건 · 2차 Gemini $0.00092/건 = $1.787/1,937건)
// 설계·중단 조건: reports/2026-10-22/judge-throughput-plan-v71bb.md §4. 종료코드 0 · 2 조회 실패.
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const COST_PER_ITEM = { claude_cli: 0.0959 / 20, gemini: 1.787 / 1937 }

/** 사유 묶음(순수). 정규식은 10-21 오케스트레이터가 본 대표 문구("선호만 있고 이유 없음"·"재현 단서 없음"·"상품명만 있어 본문 누락")에서 시작했다. */
export const REASON_BUCKETS = [
  ['body_missing', /본문\s*(누락|없|부족)|상품명만|제목만|내용\s*(이|가)?\s*없|텍스트\s*없|빈\s*(원문|글)|머리말뿐|짧아|너무\s*짧/],
  ['no_reason', /이유\s*(가)?\s*없|선호만|감탄|칭찬만|별점만|평가만|한\s*줄/],
  ['no_detail', /단서\s*(가)?\s*없|구체\S*\s*(정보|내용)?\s*없|맥락\s*(이)?\s*없|모호|불분명|판단\s*(근거|할\s*정보)\s*(가)?\s*(없|부족)|정보\s*(가)?\s*(없|부족)/],
  ['off_language', /언어|번역|외국어|알아볼\s*수\s*없/],
]
export function reasonBucket(reason) {
  const r = String(reason ?? '')
  if (!r.trim()) return 'empty_reason'
  for (const [k, re] of REASON_BUCKETS) if (re.test(r)) return k
  return 'other'
}
/** 재판정 이득이 있을 법한 묶음 — 본문이 비거나 정보가 없다는 판정은 프롬프트를 바꿔도 같은 입력이라 대부분 그대로다. */
export const REJUDGE_BUCKETS = ['other', 'off_language', 'empty_reason']

export const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
/** 결정적 표본 — input_id 의 sha1 순 앞 n 건(매번 같은 패널). */
export const sampleIds = (ids, n) => [...ids].sort((a, b) => createHash('sha1').update(a).digest('hex').localeCompare(createHash('sha1').update(b).digest('hex'))).slice(0, n)

export function summarize(rows, lenById, n) {
  const by = {}
  for (const r of rows) (by[reasonBucket(r.reason)] ??= []).push(r)
  const buckets = Object.fromEntries(Object.entries(by).map(([k, rs]) => [k, { n: rs.length, median_chars: median(rs.map((r) => lenById.get(r.input_id)).filter((x) => x != null)) }]))
  const cand = rows.filter((r) => REJUDGE_BUCKETS.includes(reasonBucket(r.reason)))
  return {
    total: rows.length, buckets, candidates: cand.length,
    cost_usd: { claude_cli_nominal: Number((cand.length * COST_PER_ITEM.claude_cli).toFixed(3)), gemini: Number((cand.length * COST_PER_ITEM.gemini).toFixed(3)) },
    sample: sampleIds(cand.map((r) => r.input_id), n),
  }
}

async function main() {
  const { createClient } = await import('../lib/supabase/server.ts')
  const { fetchAllPages } = await import('../lib/analysis/relevance-judge-all.ts')
  const sb = await createClient()
  if (!sb) { console.error('✗ DB 연결 실패'); process.exit(2) }
  const n = Number(process.argv.find((a) => a.startsWith('--sample='))?.slice(9) ?? 100) || 100
  const got = await fetchAllPages(() => sb.from('review_relevance_verdicts').select('input_id, project_id, reason, model, prompt_version').eq('verdict', 'unknown').is('human_verdict', null).order('input_id'))
  if (got.error || got.truncated) { console.error(`✗ 판정 조회 실패: ${got.error?.message ?? '상한'}`); process.exit(2) }
  const lenById = new Map()
  const ids = got.data.map((r) => r.input_id)
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb.from('analysis_inputs').select('id, raw_text').in('id', ids.slice(i, i + 100))
    if (error) { console.error(`✗ 원문 조회 실패: ${error.message}`); process.exit(2) }
    for (const x of data) lenById.set(x.id, (x.raw_text ?? '').length)
  }
  const s = summarize(got.data, lenById, n)
  if (process.argv.includes('--json')) { console.log(JSON.stringify(s, null, 1)); return }
  console.log(`[unknown 재판정 드라이런 — LLM 호출 0 · DB 쓰기 0]`)
  console.log(`- 대상(1차 unknown ∧ 사람 채점 없음): ${s.total}건`)
  for (const [k, b] of Object.entries(s.buckets).sort((a, c) => c[1].n - a[1].n)) console.log(`  - ${k}: ${b.n}건 (${((b.n / s.total) * 100).toFixed(1)}%) · 원문 중앙값 ${b.median_chars ?? '확인 불가'}자`)
  console.log(`- 재판정 후보(${REJUDGE_BUCKETS.join('·')}): ${s.candidates}건 · 추정 비용 claude-cli 명목 $${s.cost_usd.claude_cli_nominal}(구독 한도 소모) / Gemini $${s.cost_usd.gemini}`)
  console.log(`- 정밀도 패널 표본 ${s.sample.length}건(결정적): ${s.sample.slice(0, 5).join(', ')}${s.sample.length > 5 ? ' …' : ''}`)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main()
