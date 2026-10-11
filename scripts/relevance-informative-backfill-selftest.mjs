#!/usr/bin/env node
// relevance-informative-backfill.mjs 셀프테스트 — DB·LLM 없이 순수 함수와 쓰기 경로의 모양만 본다.
import fs from 'node:fs'
import { agreement, estimate, pickReplicate, rollbackLine, MEASURED_CLI_USD_PER_ITEM } from './relevance-informative-backfill.mjs'

let pass = 0
let fail = 0
const t = (name, ok) => { if (ok) pass++; else { fail++; console.error(`✗ ${name}`) } }
const id = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`

// 롤백 줄
t('롤백: 쓴 값일 때만 NULL', rollbackLine(id(1), true) === `update public.review_relevance_verdicts set product_informative = null where input_id = '${id(1)}' and product_informative = true;`)
t('롤백: uuid 아니면 던진다(SQL 주입 차단)', (() => { try { rollbackLine("x' or 1=1 --", true); return false } catch { return true } })())
t('롤백: null 값은 줄을 안 만든다', (() => { try { rollbackLine(id(1), null); return false } catch { return true } })())

// 재현 표본
const rows = [...Array(30)].map((_, i) => ({ input_id: id(i), product_informative: i < 25 }))
const p = pickReplicate(rows, 20, 42)
t('표본: 20건', p.length === 20)
t('표본: true/false 반반(false 5건뿐이면 전부 + 나머지 true)', p.filter((r) => r.product_informative === false).length === 5 && p.filter((r) => r.product_informative).length === 15)
t('표본: 같은 seed 같은 결과', JSON.stringify(pickReplicate(rows, 20, 42)) === JSON.stringify(p))
t('표본: 중복 없음', new Set(p.map((r) => r.input_id)).size === 20)
t('표본: 모집단보다 크면 있는 만큼', pickReplicate(rows.slice(0, 3), 20).length === 3)

// 일치율
const a = agreement([
  { stored: true, fresh: true }, { stored: false, fresh: false }, { stored: true, fresh: false }, { stored: false, fresh: true }, { stored: true, fresh: null },
])
t('일치율: 집계', a.same === 2 && a.tf === 1 && a.ft === 1 && a.toNull === 1)
t('일치율: null 제외 2/4 · 포함 2/5', a.rate === 0.5 && a.rateAll === 0.4)
t('일치율: 0건은 null(0% 아님)', agreement([]).rate === null)

// 추정
const e = estimate([{ chars: 10000, items: 20 }, { chars: 5000, items: 10 }])
t('추정: 호출·건수', e.calls === 2 && e.items === 30)
t('추정: claude-cli 실측 단가 × 건수', Math.abs(e.cliUsd - 30 * MEASURED_CLI_USD_PER_ITEM) < 1e-9)
t('추정: 시간 보통 < 상한', e.minTypical < e.minUpper)

// 쓰기 경로 모양 — product_informative 한 컬럼만, NULL 조건 재확인, 롤백을 UPDATE 앞에
const src = fs.readFileSync(new URL('./relevance-informative-backfill.mjs', import.meta.url), 'utf8')
t('UPDATE payload 는 product_informative 하나', /\.update\(\{ product_informative: v\.product_informative \}\)/.test(src) && (src.match(/\.update\(/g) ?? []).length === 1)
t('UPDATE 조건에 지금도 NULL', /\.eq\('input_id', v\.input_id\)\.is\('product_informative', null\)/.test(src))
t('모델 null 은 쓰지 않는다', /if \(v\.product_informative === null\) \{ c\.modelNull\+\+; continue \}/.test(src))
t('롤백 줄을 UPDATE 앞에 적는다', src.indexOf('appendRollback(rollbackLine(') < src.indexOf('.update({ product_informative'))
t('replicate 는 쓰지 않고 continue', /if \(mode === 'replicate'\) \{ pairs\.push\([^}]+\}\); continue \}/.test(src))
t('기본 모드는 dry', /const mode = replicateN \? 'replicate' : run \? 'run' : 'dry'/.test(src))
t('판정은 야간 1차와 같은 함수', /judgeRelevanceBatch\(projectById\.get\(pid\) \?\? null, batch, exampleCache\.get\(pid\)\)/.test(src))

console.log(`\n${fail === 0 ? '✅' : '❌'} 정보 판정 소급 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
