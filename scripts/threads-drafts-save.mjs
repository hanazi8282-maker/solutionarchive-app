// 생성된 초안을 posts(status='draft')에 넣고 drafts/YYYY-MM-DD.md 로 남긴다.
//
//   node --env-file=.env.local scripts/threads-drafts-save.mjs drafts.json
//   cat drafts.json | node --env-file=.env.local scripts/threads-drafts-save.mjs
//   ... --dry-run          DB 를 건드리지 않고 검증·미리보기만
//   ... --date 2026-08-29  파일명 날짜 고정(기본: 오늘 KST)
//
// ⛔ 이 스크립트는 아무것도 발행하지 않는다(CLAUDE.md §10). Threads API 를
//    호출하지 않는다. 하는 일은 DB insert 와 파일 쓰기 둘뿐이다.
//    발행은 사람이 Threads 앱에서 직접 하고, 그걸 매처가 나중에 연결한다.
//
// 입력 형식 (배열):
//   [{
//     "body":            "본문 500자 이내 (필수)",
//     "content_code":    "T1-2",        // content_items.code (필수)
//     "hypothesis_code": "H1",          // hypotheses.code (필수)
//     "pattern":         1,             // 정수, 선택
//     "hook_type":       "반전형",       // 선택
//     "closing_type":    "열린질문",     // 선택
//     "topic_tag":       "이커머스",     // Threads 주제 태그 1개, 선택
//     "self_reply":      "자답 초안",    // 선택 — 파일에만 남는다(아래 참조)
//     "notes":           "메모"          // 선택
//   }]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const TZ = 'Asia/Seoul'

// Threads 게시물당 500자. 넘으면 플랫폼이 자동으로 이어지는 글로 쪼개는데,
// 그러면 한 초안이 게시물 두 개가 되어 매처가 붙일 대상이 모호해진다.
// 여기서 막아 생성 단계로 되돌린다.
const MAX_BODY = 500

function parseArgs(argv) {
  const out = { file: null, dryRun: false, date: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') out.dryRun = true
    else if (argv[i] === '--date') out.date = argv[++i]
    else if (!argv[i].startsWith('--')) out.file = argv[i]
  }
  return out
}

/** KST 기준 오늘 날짜(YYYY-MM-DD). UTC 로 잡으면 밤에 만든 초안이 전날 파일로 간다. */
function todayKST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

async function readStdin() {
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

// ── Supabase REST ─────────────────────────────────────────────
// supabase-js 를 안 쓰고 fetch 로 직접 부른다. 필요한 건 몇 번의 요청뿐이라
// 의존성을 끌어올 이유가 없다(threads-report.mjs 와 같은 선택).
function makeClient(base, key) {
  const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  return async function call(method, path, body, extraHeaders = {}) {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      method,
      headers: { ...H, ...extraHeaders },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await res.text()
    const json = text ? JSON.parse(text) : null
    if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}: ${text.slice(0, 300)}`)
    return json
  }
}

// ── 검증 ──────────────────────────────────────────────────────
// DB 에 넣기 전에 전부 검사하고, 하나라도 틀리면 한 건도 넣지 않는다.
// 부분 저장이 남으면 "몇 편이 들어갔는지" 사람이 다시 세어봐야 한다.
function validate(drafts, codes, hypos) {
  const errors = []
  drafts.forEach((d, i) => {
    const at = `[${i}]`
    if (!d.body?.trim()) errors.push(`${at} body 가 비었다`)
    else if ([...d.body].length > MAX_BODY) {
      // 코드포인트로 센다. 한글·이모지를 UTF-16 단위로 세면 실제보다 길게 나온다.
      errors.push(`${at} body 가 ${[...d.body].length}자 — ${MAX_BODY}자 초과 (자답으로 쪼갤 것)`)
    }
    if (!d.content_code) errors.push(`${at} content_code 누락`)
    else if (!codes.has(d.content_code)) errors.push(`${at} content_code '${d.content_code}' 가 content_items 에 없다`)
    if (!d.hypothesis_code) errors.push(`${at} hypothesis_code 누락`)
    else if (!hypos.has(d.hypothesis_code)) errors.push(`${at} hypothesis_code '${d.hypothesis_code}' 가 hypotheses 에 없다`)
    if (d.pattern !== undefined && d.pattern !== null && !Number.isInteger(d.pattern)) {
      errors.push(`${at} pattern 은 정수여야 한다 (받은 값: ${JSON.stringify(d.pattern)})`)
    }
  })
  return errors
}

// ── 마크다운 ──────────────────────────────────────────────────
// 이 파일이 초안 아카이브다. 매처가 발행 후 posts.body 를 발행본으로 덮어쓰기
// 때문에(app/api/threads/match-posts), 원래 무엇을 쓰려 했는지는 여기에만 남는다.
// git 에 커밋하는 대상이다.
function renderMarkdown(date, drafts, items, hypos) {
  const L = []
  L.push(`# Threads 초안 — ${date}`)
  L.push('')
  L.push(`${drafts.length}편. 발행은 사람이 Threads 앱에서 직접 한다(CLAUDE.md §10).`)
  L.push('')
  L.push('> 이 파일이 초안 아카이브다. 발행 후 매처가 posts.body 를 발행본으로')
  L.push('> 덮어쓰므로, "원래 쓰려던 글"은 여기에만 남는다. 발행 전 수정도 여기 반영할 것.')
  L.push('')

  drafts.forEach((d, i) => {
    const item = items.get(d.content_code)
    const hyp = hypos.get(d.hypothesis_code)
    L.push('---')
    L.push('')
    L.push(`## ${i + 1}. ${item?.title ?? d.content_code}`)
    L.push('')
    L.push(`- 소재: \`${d.content_code}\` (T${item?.tier ?? '?'}) ${item?.title ?? ''}`)
    L.push(`- 가설: \`${d.hypothesis_code}\` ${hyp?.statement ?? ''} (변수: ${hyp?.variable ?? '?'})`)
    if (d.pattern != null)   L.push(`- 패턴: ${d.pattern}`)
    if (d.hook_type)         L.push(`- 훅: ${d.hook_type}`)
    if (d.closing_type)      L.push(`- 마무리: ${d.closing_type}`)
    if (d.topic_tag)         L.push(`- 주제 태그: #${d.topic_tag}`)
    L.push(`- 길이: ${[...d.body].length}자 / ${MAX_BODY}`)
    if (d.notes)             L.push(`- 메모: ${d.notes}`)
    L.push('')
    L.push('```')
    L.push(d.body)
    L.push('```')
    if (d.self_reply) {
      L.push('')
      L.push('**자답(1/n)** — 발행 직후 30분 내에 직접 단다:')
      L.push('')
      L.push('```')
      L.push(d.self_reply)
      L.push('```')
    }
    L.push('')
  })

  return L.join('\n')
}

// ── main ──────────────────────────────────────────────────────

async function main() {
  const { file, dryRun, date: dateArg } = parseArgs(process.argv)
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
    console.error('  node --env-file=.env.local scripts/threads-drafts-save.mjs drafts.json')
    return 1
  }

  const raw = file ? readFileSync(file, 'utf8') : await readStdin()
  let drafts
  try {
    drafts = JSON.parse(raw)
  } catch (e) {
    console.error(`입력 JSON 파싱 실패: ${e.message}`)
    return 1
  }
  if (!Array.isArray(drafts)) { console.error('입력은 초안 배열이어야 합니다.'); return 1 }
  if (drafts.length === 0) { console.error('초안이 0건입니다.'); return 1 }

  const call = makeClient(base, key)

  // 참조 무결성을 여기서 먼저 본다. FK 위반을 DB 에러로 받으면 어느 초안이
  // 문제인지 메시지에 안 나와서 사람이 되짚어야 한다.
  const [itemRows, hypoRows, channelRows] = await Promise.all([
    call('GET', 'content_items?select=code,title,tier,status'),
    call('GET', 'hypotheses?select=code,statement,variable,status'),
    // 자사 채널 1행. STEP 2 시점에 client 채널은 없다(시드 마이그레이션 참조).
    call('GET', 'channels?select=id,handle&platform=eq.threads&owner_type=eq.self&limit=1'),
  ])

  const items = new Map(itemRows.map(r => [r.code, r]))
  const hypos = new Map(hypoRows.map(r => [r.code, r]))

  const errors = validate(drafts, new Set(items.keys()), new Set(hypos.keys()))
  if (errors.length) {
    console.error(`\n❌ 검증 실패 ${errors.length}건 — 한 건도 저장하지 않았습니다.\n`)
    for (const e of errors) console.error(`  - ${e}`)
    return 1
  }

  const channel = channelRows[0]
  if (!channel) {
    // channel_id 는 nullable 이라 넣지 않아도 INSERT 는 되지만, 그러면 벤치마크가
    // 채널별로 갈리지 않는다. 조용히 넘기지 않고 멈춘다.
    console.error('channels 에 자사 Threads 채널(owner_type=self)이 없습니다.')
    console.error('  supabase/migrations/20260828000001_content_loop_seed.sql 을 먼저 적용하세요.')
    return 1
  }

  const date = dateArg ?? todayKST()
  const outPath = `drafts/${date}.md`

  console.log(`\n초안 ${drafts.length}편 / 채널 @${channel.handle} / 날짜 ${date}${dryRun ? '  (dry-run)' : ''}`)
  for (const [i, d] of drafts.entries()) {
    const used = items.get(d.content_code).status === 'used'
    console.log(
      `  ${String(i + 1).padStart(2)}. ${d.content_code.padEnd(6)} ${d.hypothesis_code.padEnd(3)} ` +
      `${String([...d.body].length).padStart(3)}자  ${items.get(d.content_code).title}` +
      (used ? '   ⚠️ 이미 used 인 소재' : ''),
    )
  }

  if (dryRun) {
    console.log('\ndry-run 이라 DB·파일 모두 건드리지 않았습니다.\n')
    return 0
  }

  // ── 1) posts insert ─────────────────────────────────────────
  // status='draft' 라 published_at 은 넣지 않는다(넣으면 안 된다). posts 의
  // CHECK 는 published 일 때만 published_at 을 요구하고, 초안에 임의 시각을
  // 채우면 나이 버킷 계산이 통째로 어긋난다.
  const payload = drafts.map(d => ({
    channel_id: channel.id,
    status: 'draft',
    body: d.body,
    char_count: [...d.body].length,
    content_code: d.content_code,
    hypothesis_code: d.hypothesis_code,
    pattern: d.pattern ?? null,
    hook_type: d.hook_type ?? null,
    closing_type: d.closing_type ?? null,
    topic_tag: d.topic_tag ?? null,
    notes: d.notes ?? null,
  }))

  const inserted = await call('POST', 'posts', payload, { Prefer: 'return=representation' })
  console.log(`\n✅ posts insert ${inserted.length}건 (status='draft')`)

  // ── 2) 소재 status='used' ───────────────────────────────────
  // insert 뒤에 한다. 먼저 갱신하면 insert 가 실패했을 때 쓰지도 않은 소재가
  // 소진된 것으로 남는다. 같은 소재를 A/B 로 두 번 쓰면 코드가 중복되므로 유일화.
  const usedCodes = [...new Set(drafts.map(d => d.content_code))]
  await call('PATCH', `content_items?code=in.(${usedCodes.join(',')})`, { status: 'used' })
  console.log(`✅ content_items status='used' ${usedCodes.length}건 — ${usedCodes.join(', ')}`)

  // ── 3) drafts/YYYY-MM-DD.md ─────────────────────────────────
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, renderMarkdown(date, drafts, items, hypos), 'utf8')
  console.log(`✅ ${outPath} 저장 — git 커밋 대상\n`)

  console.log('다음: 이 파일을 보고 사람이 Threads 앱에서 직접 발행한다.')
  console.log('      발행되면 매시 정각 매처(match-posts)가 자동으로 연결한다.\n')
  return 0
}

// process.exit() 대신 exitCode — Windows 에서 fetch(undici) 소켓이 열린 채
// exit 하면 libuv assertion 으로 죽어 정상 출력 뒤에 실패처럼 보인다.
main().then(c => { process.exitCode = c }).catch(e => {
  console.error(`\n실패: ${e.message}\n`)
  process.exitCode = 1
})
