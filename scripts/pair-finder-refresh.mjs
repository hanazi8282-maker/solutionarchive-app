#!/usr/bin/env node
// [v71cu 쌍 찾기] outcome_pairs_matched 갱신 + 보고. DB 쓰기는 파생 스냅샷 재계산 하나뿐(원본 ss_* 는 읽기만). 깃발은 읽지도 켜지도 않는다.
//   node --env-file=.env.local scripts/pair-finder-refresh.mjs                    # rpc refresh(k=3, min_score=2) → 표를 읽어 집계
//   ... --k 5 --min-score 2                                                        # 넉넉히 저장(읽는 쪽이 rank <= 3 으로 쓴다). 집계는 --max-rank(기본 3)
//   ... --stats-only                                                               # 갱신 없이 지금 표만 집계
//   node scripts/pair-finder-refresh.mjs --print [--k 5]                           # rpc 가 시간 초과일 때 SQL Editor·`supabase db query --linked` 용 SQL 한 줄
//   ... --out reports/2026-11-20-pair-finder/refresh.json                          # 집계를 파일로도 남긴다
// 종료 코드: 0 = 갱신 + 표 행 수가 함수 반환값과 같음 · 1 = 행 수 불일치 · 2 = 실행 못 함(함수·표 없음·권한·시간 초과 — 확인 불가, 성공으로 보지 않는다).
import fs from 'node:fs'
import { summarizePairs } from '../lib/consult/pairs.ts'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const has = (k) => process.argv.includes(`--${k}`)
const k = Number(arg('k', 3)), minScore = Number(arg('min-score', 2)), maxRank = Number(arg('max-rank', 3))
if (![k, minScore, maxRank].every(Number.isInteger)) { console.error('--k·--min-score·--max-rank 는 정수'); process.exit(2) }
if (has('print')) { console.log(`SELECT public.refresh_outcome_pairs_matched(${k}, ${minScore});`); process.exit(0) }

const { createClient } = await import('@supabase/supabase-js')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 가 필요합니다(--env-file=.env.local)'); process.exit(2) }
const sb = createClient(url, key, { auth: { persistSession: false } })

let returned = null, ms = null
if (!has('stats-only')) {
  const t0 = Date.now()
  const { data, error } = await sb.rpc('refresh_outcome_pairs_matched', { k, min_score: minScore })
  if (error) { console.error(`갱신 실패: ${error.message}\n함수가 없으면 마이그 20261120000010 적용, 시간 초과면 --print 의 SQL 을 직접 실행한 뒤 --stats-only`); process.exit(2) }
  returned = Number(data); ms = Date.now() - t0
}

// 표는 앵커당 k 행(수천 행)이라 PK 순서로 페이지를 넘겨 다 읽는다. 뷰가 아니라서 페이지마다 다시 계산하지 않는다.
const rows = []
for (let p = 0; ; p++) {
  const { data, error } = await sb.from('outcome_pairs_matched')
    .select('chapter,mechanism_norm,lose_source,lose_slug,lose_ep,lose_class,win_source,win_slug,rank,score,diff_candidates')
    .order('lose_source').order('lose_slug').order('lose_ep').order('rank').range(p * 1000, p * 1000 + 999)
  if (error) { console.error(`표 읽기 실패(확인 불가): ${error.message}`); process.exit(2) }
  rows.push(...data); if (data.length < 1000) break
}
const out = { k, min_score: minScore, refreshed: returned !== null, returned, refresh_ms: ms, table_rows: rows.length, ...summarizePairs(rows, maxRank) }
console.log(JSON.stringify(out, null, 1))
if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify(out, null, 1))
console.log(`쌍 ${out.pairs}개(rank<=${maxRank}) · 앵커 ${out.anchors}개 · 칸 ${out.cells}개 중 통과(안 된 글 ≥3 · 된 글 ≥2) ${out.passing_cells}칸 · 닫힌 칸 차이 반복 ${out.repeated_diffs.length}건`)
if (returned !== null && returned !== rows.length) { console.error(`행 수 불일치: 함수 ${returned} · 표 ${rows.length}`); process.exitCode = 1 }
