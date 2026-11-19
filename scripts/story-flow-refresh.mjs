#!/usr/bin/env node
// [v71cu F5] story_flow_cards_mat 새로 고침 — 꼬리표 회차 적재(scripts/story-label.mjs) 끝난 뒤마다 1회 돌린다. DB 쓰기는 사본 재계산 하나뿐(원본 표 불변).
//   node --env-file=.env.local scripts/story-flow-refresh.mjs          # rpc('refresh_story_flow_cards_mat') — 마이그 20261119000031 적용 뒤
//   ... --skip-compare                                                   # 원본 뷰 행 수 대조를 건너뜀(원본 뷰가 시간 초과로 대조가 안 될 때)
//   node scripts/story-flow-refresh.mjs --print                         # 함수가 아직 없을 때 SQL Editor·`supabase db query --linked` 용 SQL 한 줄
// 종료 코드: 0 = 새로 고침 + 행 수가 기존 뷰와 같음 · 1 = 행 수 불일치(사본이 원본과 다름) · 2 = 실행 못 함(함수 없음·권한·시간 초과 — 확인 불가, 성공으로 보지 않는다).
const SQL = 'REFRESH MATERIALIZED VIEW public.story_flow_cards_mat;'
if (process.argv.includes('--print')) { console.log(SQL); process.exit(0) }

const { createClient } = await import('@supabase/supabase-js')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 가 필요합니다(--env-file=.env.local)'); process.exit(2) }
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data, error } = await sb.rpc('refresh_story_flow_cards_mat')
if (error) { console.error(`새로 고침 실패: ${error.message}\n함수가 없으면 마이그 20261119000031 적용 또는 --print 의 SQL 을 직접 실행`); process.exit(2) }
const row = Array.isArray(data) ? data[0] : data
if (process.argv.includes('--skip-compare')) { console.log(`새로 고침 ${row?.row_count}행 (${row?.refreshed_at}) · 원본 뷰 대조 생략(--skip-compare)`); process.exit(0) }
// 원본 뷰 행 수와 대조(§7.1 — 함수가 성공을 돌려줬다는 것만으로 끝내지 않는다). 원본 뷰가 시간 초과면 확인 불가.
const { count, error: e2 } = await sb.from('story_flow_cards').select('slug', { count: 'exact', head: true })
if (e2 || count == null) { console.log(`새로 고침 ${row?.row_count}행 · 원본 뷰 행 수 확인 불가(${e2?.message ?? 'count 없음'})`); process.exit(2) }
console.log(`새로 고침 ${row?.row_count}행 (${row?.refreshed_at}) · 원본 뷰 ${count}행`)
process.exitCode = Number(row?.row_count) === count ? 0 : 1
