// 콘텐츠 루프 성과 리포트 — hypotheses.variable 차원별 집계.
//
//   node --env-file=.env.local scripts/threads-report.mjs
//   node --env-file=.env.local scripts/threads-report.mjs --out docs/report-2026-08-28.md
//   node --env-file=.env.local scripts/threads-report.mjs --days 14
//
// ⛔ 이 스크립트는 아무것도 판단하지 않는다.
//    무엇을 learnings 로 승격할지, 어떤 hypotheses.status 를 바꿀지는 사람이 정한다.
//    실데이터가 7일치 이상 쌓인 뒤에 보고 정하기로 했다. 그때까지 자동 판정을
//    넣으면, 표본 3~4개짜리 노이즈가 "supported" 로 굳어버리고 그 결론이 이후
//    생성 단계에 피드백되어 스스로를 강화한다 — 되돌리기 가장 어려운 종류의 오류다.
//
// ⛔ 쓰기도 하지 않는다. 전부 SELECT 다. hypotheses / learnings 를 건드리지 않는다.
//
// 표본 5개 미만인 차원 값은 숫자를 내되 "표본부족" 으로 표시만 한다.
// 5 라는 값은 guard_learning_promotion() 트리거가 learnings.status='confirmed' 를
// 막는 기준과 같다. 리포트와 DB 가 서로 다른 문턱을 쓰면, 리포트에서 충분해
// 보이던 것이 승격 시점에 트리거에 막혀 이유를 다시 추적하게 된다.

const MIN_SAMPLE = 5

// post_performance 뷰가 24h 창(20~30h)의 값을 갖는 글만 비교 대상이다.
// views_24h 가 없는 글(방금 발행됐거나 수집을 놓친 글)을 평균에 넣으면
// 표본 수는 늘어나는데 분자는 그대로라 모든 차원이 조용히 낮아진다.
const REQUIRE_24H = true

function parseArgs(argv) {
  const out = { days: 30, outPath: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--days') out.days = Number(argv[++i])
    else if (argv[i] === '--out') out.outPath = argv[++i]
    else if (argv[i] === '--all') out.days = null
  }
  return out
}

// ── Supabase REST ─────────────────────────────────────────────
// @supabase/supabase-js 를 쓰지 않고 fetch 로 직접 부른다. 이 스크립트는
// Node 로만 돌고 필요한 건 GET 두 번뿐이라, 의존성을 끌어올 이유가 없다.
async function select(base, key, path) {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`${path} 조회 실패 (HTTP ${res.status}): ${JSON.stringify(body)}`)
  }
  return body
}

// ── 집계 ──────────────────────────────────────────────────────

const num = v => (v === null || v === undefined ? null : Number(v))

function mean(values) {
  const xs = values.filter(v => v !== null && Number.isFinite(v))
  if (xs.length === 0) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/**
 * 차원 정의. key 는 hypotheses.variable 값과 같은 이름을 쓴다.
 * of(row) 가 null 을 돌려주면 그 글은 이 차원에서 제외된다(값 자체가 없는 글).
 */
function buildDimensions(tz) {
  return [
    { key: 'hook_type',      label: '훅 유형',     of: r => r.hook_type },
    { key: 'pattern',        label: '패턴',        of: r => (r.pattern === null ? null : `P${r.pattern}`) },
    { key: 'closing_type',   label: '마무리 유형', of: r => r.closing_type },

    // had_self_reply 는 뷰가 self_reply_at IS NOT NULL 로 이미 계산해 준다.
    { key: 'self_reply',     label: '자답글',      of: r => (r.had_self_reply ? '있음' : '없음') },

    // 체인 소속 여부. chain_id 자체는 글마다 달라 그룹 키가 될 수 없다.
    { key: 'chain',          label: '체인',        of: r => (r.chain_id ? '체인' : '단발') },

    // 단발 글은 chain_position 이 null 이다. 여기서는 제외한다 — "위치 없음"을
    // 하나의 위치로 묶으면 체인 효과와 단발 효과가 섞인다(위 chain 차원이 그 비교다).
    { key: 'chain_position', label: '체인 위치',   of: r => (r.chain_position === null ? null : `${r.chain_position}번째`) },

    // 발행 시각. UTC 로 묶으면 KST 기준 밤 글이 다음 날로 넘어가 시간대가 흩어진다.
    { key: 'published_at',   label: '발행 시각',   of: r => (r.published_at ? `${String(hourIn(r.published_at, tz)).padStart(2, '0')}시` : null) },
  ]
}

/** ISO 문자열을 특정 타임존의 '시'(0~23)로 바꾼다. */
function hourIn(iso, tz) {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false })
    .format(new Date(iso))
  return Number(h) % 24
}

function aggregate(rows, dim) {
  const groups = new Map()
  for (const r of rows) {
    const v = dim.of(r)
    if (v === null || v === undefined || v === '') continue
    if (!groups.has(v)) groups.set(v, [])
    groups.get(v).push(r)
  }

  return [...groups.entries()]
    .map(([value, rs]) => ({
      value,
      n: rs.length,
      lowSample: rs.length < MIN_SAMPLE,
      views24h:  mean(rs.map(r => num(r.views_24h))),
      views1h:   mean(rs.map(r => num(r.views_1h))),
      replyRate: mean(rs.map(r => num(r.reply_rate))),
      spread:    mean(rs.map(r => num(r.spread_multiple))),
    }))
    // 표본이 많은 값부터. 어차피 판단은 사람이 하므로 정렬 기준은 "믿을 만한 순".
    .sort((a, b) => b.n - a.n || String(a.value).localeCompare(String(b.value)))
}

// ── 출력 ──────────────────────────────────────────────────────

// 한글은 터미널에서 두 칸을 차지한다. String.length 로 정렬하면 표가 어긋난다.
function width(s) {
  let w = 0
  for (const ch of String(s)) {
    const c = ch.codePointAt(0)
    w += (c >= 0x1100 && (
      c <= 0x115f ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6)
    )) ? 2 : 1
  }
  return w
}

const pad = (s, w, right = false) => {
  const gap = ' '.repeat(Math.max(0, w - width(s)))
  return right ? gap + s : s + gap
}

const fmt = (v, digits) => (v === null ? '—' : v.toFixed(digits))
const fmtInt = v => (v === null ? '—' : Math.round(v).toLocaleString('ko-KR'))

const HEAD = ['값', 'n', '조회수(24h)', 'reply_rate', 'spread', '비고']

function toCells(r) {
  return [
    String(r.value),
    String(r.n),
    fmtInt(r.views24h),
    fmt(r.replyRate, 4),
    fmt(r.spread, 2),
    r.lowSample ? `표본부족(<${MIN_SAMPLE})` : '',
  ]
}

function renderConsole(dim, rows) {
  const lines = []
  lines.push('')
  lines.push(`── ${dim.label}  (variable: ${dim.key}) ${'─'.repeat(Math.max(0, 46 - width(dim.label) - dim.key.length))}`)

  if (rows.length === 0) {
    lines.push('   해당 값을 가진 글이 없다.')
    return lines.join('\n')
  }

  const table = [HEAD, ...rows.map(toCells)]
  const widths = HEAD.map((_, i) => Math.max(...table.map(r => width(r[i]))))
  // 값·비고는 왼쪽, 숫자는 오른쪽 정렬
  const rightAlign = [false, true, true, true, true, false]

  lines.push('   ' + HEAD.map((h, i) => pad(h, widths[i], rightAlign[i])).join('  '))
  lines.push('   ' + widths.map(w => '─'.repeat(w)).join('  '))
  for (const r of rows) {
    const cells = toCells(r)
    lines.push('   ' + cells.map((c, i) => pad(c, widths[i], rightAlign[i])).join('  '))
  }
  return lines.join('\n')
}

function renderMarkdown(dim, rows) {
  const lines = []
  lines.push(`### ${dim.label} \`${dim.key}\``)
  lines.push('')
  if (rows.length === 0) {
    lines.push('해당 값을 가진 글이 없다.')
    lines.push('')
    return lines.join('\n')
  }
  lines.push('| ' + HEAD.join(' | ') + ' |')
  lines.push('|' + HEAD.map(() => '---').join('|') + '|')
  for (const r of rows) lines.push('| ' + toCells(r).join(' | ') + ' |')
  lines.push('')
  return lines.join('\n')
}

// ── main ──────────────────────────────────────────────────────

const TZ = 'Asia/Seoul'

async function main() {
  const { days, outPath } = parseArgs(process.argv)
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!base || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
    console.error('  node --env-file=.env.local scripts/threads-report.mjs')
    return 1
  }

  const sinceIso = days === null ? null : new Date(Date.now() - days * 86_400_000).toISOString()
  const range = days === null ? '전체 기간' : `최근 ${days}일`

  // post_performance 는 posts LEFT JOIN metric_snapshots 라 아직 수집이 안 된 글도
  // 행은 나온다(지표만 null). 그래서 발행 여부·기간 필터를 여기서 다시 건다.
  const perfFilter = [
    'select=*',
    'published_at=not.is.null',
    ...(sinceIso ? [`published_at=gte.${sinceIso}`] : []),
    'order=published_at.desc',
  ].join('&')

  // chain_id / chain_position 은 뷰에 없다. posts 에서 따로 읽어 붙인다.
  // (뷰를 고치는 편이 깔끔하지만 그건 마이그레이션이고, 리포트는 읽기 전용으로 둔다.)
  const postFilter = [
    'select=id,chain_id,chain_position,status',
    "status=eq.published",
    ...(sinceIso ? [`published_at=gte.${sinceIso}`] : []),
  ].join('&')

  let perf, posts
  try {
    ;[perf, posts] = await Promise.all([
      select(base, key, `post_performance?${perfFilter}`),
      select(base, key, `posts?${postFilter}`),
    ])
  } catch (e) {
    console.error(`조회 실패: ${e.message}`)
    return 1
  }

  const meta = new Map(posts.map(p => [p.id, p]))
  const all = perf
    // 뷰에는 draft 도 나타난다(posts LEFT JOIN). posts 쪽 published 목록에
    // 있는 것만 남긴다.
    .filter(r => meta.has(r.id))
    .map(r => ({ ...r, chain_id: meta.get(r.id).chain_id, chain_position: meta.get(r.id).chain_position }))

  const rows = REQUIRE_24H ? all.filter(r => num(r.views_24h) !== null) : all
  const pending = all.length - rows.length

  const dims = buildDimensions(TZ)

  // ── 콘솔 ──
  const header = [
    '',
    '════════════════════════════════════════════════════════════',
    ` 콘텐츠 루프 성과 리포트 — ${range}  (기준시각 ${new Date().toLocaleString('ko-KR', { timeZone: TZ })} KST)`,
    '════════════════════════════════════════════════════════════',
    ` 발행 글 ${all.length}편 중 24h 지표가 있는 ${rows.length}편으로 집계.`,
    ...(pending > 0 ? [` (${pending}편은 아직 24h 창(20~30h)에 도달하지 않았거나 수집을 놓쳤다 — 제외)`] : []),
    ` 표본 ${MIN_SAMPLE}개 미만은 "표본부족" 으로 표시만 한다. 판단은 하지 않는다.`,
  ].join('\n')

  console.log(header)

  if (rows.length === 0) {
    console.log('\n집계할 글이 없다. 수집이 한 바퀴 돌 때까지 기다릴 것.\n')
    return 0
  }

  const sections = dims.map(d => ({ dim: d, rows: aggregate(rows, d) }))
  for (const s of sections) console.log(renderConsole(s.dim, s.rows))

  const lowAll = sections.filter(s => s.rows.length > 0 && s.rows.every(r => r.lowSample))
  console.log('')
  if (lowAll.length) {
    console.log(`⚠️  전 구간 표본부족 차원: ${lowAll.map(s => s.dim.key).join(', ')}`)
  }
  console.log('※ 승격·상태변경은 이 스크립트가 하지 않는다. 사람이 보고 정한다.\n')

  // ── 마크다운 ──
  if (outPath) {
    const { writeFile, mkdir } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    const md = [
      `# 콘텐츠 루프 성과 리포트 — ${range}`,
      '',
      `- 기준시각: ${new Date().toLocaleString('ko-KR', { timeZone: TZ })} KST`,
      `- 발행 글 ${all.length}편 중 24h 지표가 있는 **${rows.length}편**으로 집계`,
      ...(pending > 0 ? [`- ${pending}편은 24h 창(20~30h) 미도달 또는 수집 누락으로 제외`] : []),
      `- 표본 ${MIN_SAMPLE}개 미만은 \`표본부족\` 표시만. **판단·승격은 하지 않는다.**`,
      '',
      '지표: `조회수(24h)` = views_24h 평균, `reply_rate` = replies_24h / views_24h 평균,',
      '`spread` = views_24h / views_1h 평균(1h 스냅샷이 없으면 제외됨).',
      '',
      ...sections.map(s => renderMarkdown(s.dim, s.rows)),
    ].join('\n')

    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, md, 'utf8')
    console.log(`마크다운 저장: ${outPath}\n`)
  }

  return 0
}

// process.exit() 대신 exitCode 를 쓴다 — Windows 에서 fetch(undici) 소켓이 열린 채
// exit 하면 libuv assertion 으로 죽어 정상 출력 뒤에 실패처럼 보인다.
// (scripts/threads-token-seed.mjs 에 같은 주석이 있다. 같은 함정이다.)
main().then(code => { process.exitCode = code })
