// 예측 자동 채점기. prediction-schema.md 가 정의한 규격의 실행부다.
//
//   node scripts/score-predictions.mjs              # DB 경로 (post_decision_link 필요)
//   node scripts/score-predictions.mjs --dry-run    # 로그 파싱까지만. DB 안 붙음
//
// 이 레포에는 테스트 러너가 없다. 채점 로직 자체의 검증은
// scripts/score-predictions-selftest.mjs 가 고정 픽스처로 한다.
// Node 22+ 타입 스트리핑으로 .ts 를 그대로 import 한다(threads-collect-selftest 와 동일).
//
// ⚠️ 이 스크립트는 **"채점할 게 없다"와 "채점할 수 없다"를 구분해서 종료한다.**
//    - 예측이 0건    → exit 0. 정상이다. 아직 예측을 안 쓴 것뿐이다.
//    - 파싱 에러     → exit 1. 예측을 썼는데 못 읽은 것이다.
//    - 링크 테이블 X → exit 2. 채점 자체가 불가능하다. 0건으로 보고하지 않는다.
//    셋을 같은 초록불로 만들면 루프가 안 도는데도 도는 것처럼 보인다 (CLAUDE.md §7.1).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseDecisionLog } from '../lib/predictions/parse-log.ts'
import { scoreOne, tallyByRule, wilsonLower, ruleAction } from '../lib/predictions/score.ts'
import { LINK_TABLE, LINK_TABLE_READY } from '../lib/predictions/link.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCES = [
  'methodology/content/solfa/04-decisions.md',
  'methodology/content/pdp/04-decisions.md',
  'methodology/content/cross-decisions.md',
]

const dryRun = process.argv.includes('--dry-run')

// ── 1) 판정 로그에서 예측을 읽는다 ────────────────────────────
const entries = []
const parseErrors = []
for (const rel of SOURCES) {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) {
    // 정본이 없으면 "예측 0건"이 아니라 설정이 틀린 것이다.
    console.error(`✗ 정본을 못 찾음: ${rel}`)
    process.exit(1)
  }
  const r = parseDecisionLog(fs.readFileSync(abs, 'utf8'), rel)
  entries.push(...r.entries)
  parseErrors.push(...r.errors.map(e => ({ ...e, source: rel })))
}

const withPreds = entries.filter(e => e.predictions.length > 0)
const predCount = withPreds.reduce((n, e) => n + e.predictions.length, 0)

console.log(`판정 로그 엔트리 ${entries.length}개 / 예측이 달린 엔트리 ${withPreds.length}개 / 예측 항목 ${predCount}개`)

if (parseErrors.length) {
  console.error(`\n✗ 예측 블록 파싱 실패 ${parseErrors.length}건 — 이건 "예측 없음"이 아니다:`)
  for (const e of parseErrors) console.error(`  ${e.source} ${e.code}: ${e.message}`)
  process.exit(1)
}

if (dryRun) {
  for (const e of withPreds) {
    console.log(`\n${e.code}  (${e.source})`)
    for (const p of e.predictions) {
      console.log(`  ${p.metric} / ${p.direction} / ${p.baseline}${p.k ? `_${p.k}` : ''} / ${p.threshold} / ${p.horizon} / because ${p.because}`)
    }
  }
  console.log('\n--dry-run: DB 에 붙지 않았다. 채점은 하지 않았다.')
  process.exit(0)
}

// ── 2) 채점에는 발행 연결이 필요하다 ──────────────────────────
// 여기서 멈추는 게 정상이다. 지금 이 리포에는 아직 이 테이블이 없다.
if (!LINK_TABLE_READY) {
  console.error(`
✗ 채점 불가 — ${LINK_TABLE} 테이블이 아직 적용되지 않았다.

   판정 로그 코드(LOG-xxx)와 발행 글(posts.id)을 잇는 테이블이 없으면
   예측을 어느 글의 실측과 대조해야 하는지 알 수 없다.

   해야 할 일:
     1) supabase/migrations/20260905000001_post_decision_log_link.sql 을
        Supabase 대시보드 SQL Editor 에서 실행한다 (§12-5 — CLI/MCP 금지).
     2) lib/predictions/link.ts 의 LINK_TABLE_READY 를 true 로 바꾼다.

   ⚠️ 이건 "채점 결과 0건"이 아니라 "채점을 못 했다"다. 둘을 섞지 마라.
`)
  process.exit(2)
}

// ── 3) DB 경로 ────────────────────────────────────────────────
// 여기부터는 테이블이 생긴 뒤에 돈다. 지금은 위에서 exit 2 로 빠진다.
const { createClient } = await import('@supabase/supabase-js')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('✗ Supabase 환경변수 없음 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(2)
}
const supabase = createClient(url, key)

const { readLinks } = await import('../lib/predictions/link.ts')

/** metric_snapshots + posts 를 스냅샷 형태로 정규화한다.
 *
 * ★ `posts.format` 컬럼은 **없다**(2026-09-06 실측: posts 는 id, channel_id,
 *   external_id, published_at, body, char_count, content_code, pattern,
 *   hook_type, closing_type, topic_tag, ... 다). 첫 버전이 `format` 을 select
 *   해서 42703 으로 죽었다 — 링크 테이블이 없던 동안 이 경로가 한 번도 안
 *   돌아서 안 드러났던 버그다.
 *
 *   `median_format_k` 가 말하는 "형식"(캡션형 vs 기획형, prediction-schema.md
 *   §2)에 가장 가까운 실재 컬럼은 `pattern` 이다. 그래서 pattern 을 형식
 *   태그로 쓴다. `content_code`(T1-3 같은 소재 코드)는 형식이 아니라 주제라
 *   쓰지 않았다. pattern 이 비면 `null` 로 두고, 그러면 score.ts 가
 *   median_format_k 를 "기준선 못 구함"으로 처리한다 — 임의로 median_all 로
 *   갈아타지 않는다.
 */
async function loadSnapshots() {
  const { data, error } = await supabase
    .from('metric_snapshots')
    .select('post_id, hours_since_publish, views, likes, replies, reposts, quotes, posts(published_at, pattern)')
  if (error) throw new Error(`metric_snapshots 조회 실패: ${error.message}`)
  const bucketOf = h => (h <= 1.5 ? 'h1' : h <= 30 ? 'h24' : 'h168')
  const rows = (data ?? []).map(r => ({
    postId: r.post_id,
    publishedAt: r.posts?.published_at ?? null,
    bucket: bucketOf(Number(r.hours_since_publish)),
    views: r.views ?? 0,
    likes: r.likes ?? 0,
    replies: r.replies ?? 0,
    reposts: r.reposts ?? 0,
    quotes: r.quotes ?? 0,
    format: r.posts?.pattern == null ? null : String(r.posts.pattern),
  }))
  const kept = rows.filter(s => s.publishedAt)
  // 버린 행을 조용히 삼키지 않는다. published_at 이 비면 기준선 정렬(시점 비교)을
  // 할 수 없어서 뺀 것이지, 그 글에 데이터가 없다는 뜻이 아니다 (§7.1).
  if (rows.length !== kept.length) {
    console.log(`  ⚠️ 스냅샷 ${rows.length - kept.length}건을 뺐다 — posts.published_at 이 비어 있어 시점 비교 불가. "데이터 없음"이 아니다.`)
  }
  return kept
}

const snapshots = await loadSnapshots()
console.log(`실측 스냅샷 ${snapshots.length}개 (post ${new Set(snapshots.map(s => s.postId)).size}건)`)
if (snapshots.length === 0 && withPreds.length > 0) {
  // 예측은 있는데 실측이 하나도 없다 = 채점을 못 하는 상태다. 아래로 내려가면
  // 전부 "보류"로 찍히는데, 그건 "노이즈 범위였다"는 판정과 글자가 같아서
  // 구분이 안 된다. 여기서 끊고 확인 불가로 말한다.
  console.error('')
  console.error('✗ metric_snapshots 가 비어 있다. 예측은 있는데 실측이 없으니 채점할 수 없다.')
  console.error('  이건 "전부 보류"가 아니라 "아직 못 쟀다"다 — 수집기(/api/threads/collect-metrics)가 돌았는지 확인하라.')
  process.exit(2)
}
const scoredEntries = []
const unscorable = []

for (const e of withPreds) {
  const links = await readLinks(supabase, e.code)
  if (links === null) { unscorable.push({ code: e.code, reason: '링크 조회 실패 — 확인 불가' }); continue }
  const primary = links.find(l => l.role === 'primary')
  if (!primary) { unscorable.push({ code: e.code, reason: '연결된 발행 글 없음' }); continue }

  const metrics = e.predictions.map(p => {
    const target = snapshots.find(s => s.postId === primary.postId && s.bucket === p.horizon)
    if (!target) {
      return { metric: p.metric, verdict: '보류', actual: null, baseline: null, mad: null,
               delta: null, deltaInThreshold: null, weight: 0,
               reason: `${p.horizon} 스냅샷 없음 — 확인 불가 (아직 그 시점이 안 됐거나 수집 실패)` }
    }
    const history = snapshots.filter(
      s => s.bucket === p.horizon && s.postId !== primary.postId
        && Date.parse(s.publishedAt) < Date.parse(target.publishedAt),
    )
    const pairedLink = p.pairedWith ? links.find(l => l.role === 'paired_control') : null
    const paired = pairedLink
      ? snapshots.find(s => s.postId === pairedLink.postId && s.bucket === p.horizon) ?? null
      : null
    return scoreOne(p, { target, history, paired })
  })

  const score = metrics.reduce((a, m) => a + m.weight * (m.verdict === '유효' ? 1 : m.verdict === '무효' ? -1 : 0), 0)
  scoredEntries.push({
    code: e.code, preds: e.predictions, metrics,
    verdict: score > 0 ? '유효' : score < 0 ? '무효' : '보류', score,
  })
}

// ── 4) 보고 ───────────────────────────────────────────────────
for (const s of scoredEntries) {
  console.log(`\n${s.code}  → ${s.verdict} (score ${s.score > 0 ? '+' : ''}${s.score})`)
  s.metrics.forEach((m, i) => {
    const p = s.preds[i]
    const d = m.deltaInThreshold === null ? '-' : `${m.deltaInThreshold >= 0 ? '+' : ''}${m.deltaInThreshold.toFixed(2)}`
    console.log(`  ${m.metric} ${p.direction}  실측 ${fmt(m.actual)} / 기준 ${fmt(m.baseline)} / ${d}×임계  → ${m.verdict}  (${m.reason})`)
  })
}

if (unscorable.length) {
  console.log(`\n채점 불가 ${unscorable.length}건 — 0건이 아니라 확인 불가다:`)
  for (const u of unscorable) console.log(`  ${u.code}: ${u.reason}`)
}

const tally = tallyByRule(scoredEntries)
if (tally.size) {
  console.log('\n규칙별 신뢰도 (보류는 분모에서 뺀다)')
  for (const [rule, t] of [...tally].sort()) {
    const lower = wilsonLower(t.valid, t.invalid)
    const act = ruleAction(t)
    console.log(`  ${rule}: 유효 ${t.valid} / 무효 ${t.invalid} / 보류 ${t.held}` +
      `  Wilson하한 ${lower === null ? '-' : (lower * 100).toFixed(0) + '%'}` +
      (act ? `  → ${act}` : ''))
  }
}

function fmt(v) {
  if (v === null) return '-'
  return Math.abs(v) < 1 ? v.toFixed(4) : String(Math.round(v))
}
