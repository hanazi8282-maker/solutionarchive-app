#!/usr/bin/env node
// 케이스 무브 → Threads 발행-대기 초안을 DB 에 올린다 (M2 마지막 단계).
//
// ⛔ 이 스크립트는 **어떤 경우에도 Threads 에 게시하지 않는다.**
//    CLAUDE.md §10 — 자동 발행 API 사용 안 함. 여기서 만드는 건 "사람이
//    앱에서 발행 버튼을 누르기 직전 상태"까지다. 발행 API 호출 코드는
//    이 파일에 존재하지 않고, 앞으로도 넣지 않는다.
//
// 하는 일 (초안 1건당)
//   1) content_items 에 소재 행 (status='proposed', source_case=케이스 slug)
//   2) posts 에 초안 행 (status='pending_review', published_at=NULL)
//   3) post_decision_link 로 판정 로그와 연결
//
// 사용:
//   node --env-file=.env.local scripts/case-draft-stage.mjs                    # 레거시: 아래 WARBY 상수
//   node --env-file=.env.local scripts/case-draft-stage.mjs --input <json경로> # 배치(객체 또는 배열)
//   node scripts/case-draft-stage.mjs --example                                # 입력 양식
//
// ⚠️ 2026-09-08: 상단 하드코딩 상수 6개를 --input 배치로 일반화했다.
//    무인 데일리 루프가 매일 다른 무브를 스테이징해야 하는데, 상수를 고치는
//    커밋을 루프가 스스로 만들게 하면 화이트리스트(reports/ · drafts/ · ops/state/)
//    밖의 파일을 건드리게 된다. 그래서 대상은 입력 파일로 받는다.
//    **레거시 무인자 경로는 그대로 둔다** — 과거 회귀 실행(Warby)이 같은 명령으로
//    재현돼야 "그때는 되던 게 지금 되는가"를 확인할 수 있다.
//
// 종료 코드: 0 = 전부 pending_review / 2 = 확인 불가 / 3 = draft 폴백(마이그 미적용)
//            4 = CG-1 게이트 미통과 (등급 C 인용인데 귀속 문구 없음 → draft 로 눕힘)
//   배치일 때는 **가장 나쁜 결과**가 종료 코드가 된다 (2 > 4 > 3 > 0).
//   한 건이 막혔는데 exit 0 이 나오면 그 건은 영원히 아무도 안 본다.
import fs from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
import { linkDecisionLog } from '../lib/predictions/link.ts'
import { attributionGate, attributionHint } from '../lib/cases/publish-gate.ts'

const CHANNEL_ID = '64558fd1-06a5-4440-8fb1-bb78375479e0' // threads / @solution_arch_

// 레거시 기본값. --input 없이 부르면 이 한 건을 스테이징한다(회귀 재현용).
const LEGACY_JOB = {
  case_slug: 'warby-parker-home-try-on',
  move_id: 'c7317212-7ef6-41c6-8e48-5fe4244ca61c',
  log_code: 'LOG-20260906-01',
  content_code: 'CS-20260906-01',
  body_path: 'drafts/threads/2026-09-06-warby-home-try-on.body.txt',
  reply_path: 'drafts/threads/2026-09-06-warby-home-try-on.selfreply.txt',
  title: '병목을 푼 장치에는 유효기간이 있다',
  twist_line: '신뢰를 대신 사주던 장치를 껐더니 새 고객 붙는 속도가 반으로 줄었다',
  hook_type: '상식파괴형',
  closing_type: '질문',
  topic_tag: 'case-study',
  decision_doc: 'drafts/threads/2026-09-06-warby-home-try-on.md',
  gate_note: '예외통과 (U-3 ②항 미충족 — 레퍼런스 4건의 댓글 실물 미확보)',
}

const argv = process.argv.slice(2)
const opt = (n, d = null) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
}

if (argv.includes('--example')) {
  console.log(JSON.stringify([LEGACY_JOB], null, 2))
  process.exit(0)
}

// ── 작업 목록 만들기 ──────────────────────────────────────────
const REQUIRED = ['case_slug', 'move_id', 'content_code', 'body_path', 'reply_path', 'title']

let jobs
const inputPath = opt('input')
if (inputPath) {
  if (!fs.existsSync(inputPath)) {
    console.error(`⚠️ 확인 불가: 입력 파일이 없다 — ${inputPath}`)
    process.exit(2)
  }
  let parsed
  try { parsed = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) }
  catch (e) { console.error(`⚠️ 확인 불가: 입력 JSON 파싱 실패 — ${e.message}`); process.exit(2) }
  jobs = Array.isArray(parsed) ? parsed : [parsed]
  if (jobs.length === 0) {
    // 0건은 "성공"이 아니다. 부를 이유가 없었다는 뜻이고, 부른 쪽의 버그다.
    console.error('⚠️ 확인 불가: 입력에 작업이 0건이다. 스테이징할 대상 없이 호출됐다.')
    process.exit(2)
  }
  for (const [i, j] of jobs.entries()) {
    const missing = REQUIRED.filter((k) => !j?.[k])
    if (missing.length) {
      console.error(`⚠️ 확인 불가: 작업 #${i} 필수 필드 누락 — ${missing.join(', ')}`)
      process.exit(2)
    }
  }
} else {
  jobs = [LEGACY_JOB]
  console.log('ℹ️ --input 없음 → 레거시 기본 작업 1건(Warby)을 스테이징한다.')
}

// createClient 는 async 다. await 를 빼면 Promise 가 들어와 supabase.from 이 없다.
let supabase
try {
  supabase = await createClient()
} catch (e) {
  console.error(`⚠️ 확인 불가: Supabase 클라이언트 생성 실패 — ${e.message}`)
  process.exit(2)
}
if (!supabase) {
  console.error('⚠️ 확인 불가: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정')
  process.exit(2)
}

// 나쁜 순서: 2(확인 불가) > 4(게이트 차단) > 3(마이그 폴백) > 0
const SEVERITY = { 0: 0, 3: 1, 4: 2, 2: 3 }
let worst = 0
const record = (code) => { if (SEVERITY[code] > SEVERITY[worst]) worst = code }

const summary = []

for (const job of jobs) {
  const code = await stageOne(job)
  record(code)
  summary.push({ content_code: job.content_code, exit: code })
  if (code === 2) break // 확인 불가는 환경 문제다. 나머지를 돌려 봐야 같은 결과다.
}

console.log('')
console.log('## 스테이징 결과')
for (const s of summary) {
  const mark = s.exit === 0 ? '✅' : s.exit === 4 ? '⛔' : s.exit === 3 ? '⚠️' : '❌'
  const what = s.exit === 0 ? 'pending_review'
    : s.exit === 4 ? 'CG-1 차단 → draft'
      : s.exit === 3 ? '마이그 미적용 폴백 → draft' : '확인 불가'
  console.log(`- ${mark} ${s.content_code} — ${what} (exit ${s.exit})`)
}
console.log('')
console.log('⛔ 발행하지 않았다. 어떤 Threads API 도 호출하지 않았다 (CLAUDE.md §10).')
process.exit(worst)


/** 초안 1건 스테이징. 종료 코드와 같은 의미의 숫자를 돌려준다(프로세스를 죽이지 않는다). */
async function stageOne(job) {
  const channelId = job.channel_id ?? CHANNEL_ID
  console.log(`\n━━ ${job.content_code} · ${job.case_slug} ━━`)

  let body, selfReply
  try {
    body = fs.readFileSync(job.body_path, 'utf-8').replace(/\r\n/g, '\n').trim()
    selfReply = fs.readFileSync(job.reply_path, 'utf-8').replace(/\r\n/g, '\n').trim()
  } catch (e) {
    console.error(`⚠️ 확인 불가: 초안 파일을 못 읽었다 — ${e.message}`)
    return 2
  }
  const charCount = [...body].length

  if (charCount > 500) {
    console.error(`⚠️ 본문 ${charCount}자 — Threads 상한 500 초과. 저장하지 않는다 (G-11).`)
    return 2
  }

  // ── 1) 소재 행 ────────────────────────────────────────────
  const item = {
    code: job.content_code,
    tier: job.tier ?? 1,
    title: job.title,
    twist_line: job.twist_line ?? null,
    source_case: job.case_slug,
    status: 'proposed', // 자동 제안. 사람이 고르기 전까지 초안에 안 잡힌다
  }
  {
    const { error } = await supabase.from('content_items').upsert(item, { onConflict: 'code' })
    if (error) {
      console.error(`⚠️ 확인 불가: content_items 저장 실패 — ${error.code} ${error.message}`)
      return 2
    }
    console.log(`✅ content_items ${job.content_code} (status=proposed)`)
  }

  // ── 2) 초안 행 ────────────────────────────────────────────
  //
  // ★ 등급을 하드코딩하지 않는다. 재채점(case-review.mjs regrade)으로 바뀌는 값이라
  //   박아 두면 초안 안의 출처 표기가 조용히 옛말이 된다. 실제로 '등급 A' 로 적혀 있었는데
  //   L-56 백필 후 이 무브는 B 가 됐다 — 발행 대기 중인 글이 틀린 근거 표기를 달고 있었다.
  const moveRes = await supabase.from('case_moves')
    .select('lever, evidence_grade, outcome_direction, case_studies(bottleneck, brand_name)')
    .eq('id', job.move_id).maybeSingle()
  if (moveRes.error || !moveRes.data) {
    console.error(`⚠️ 확인 불가: case_moves ${job.move_id} 조회 실패 — ${moveRes.error?.code ?? '행 없음'} ${moveRes.error?.message ?? ''}`)
    return 2
  }
  const move = moveRes.data
  const bottleneck = move.case_studies?.bottleneck ?? '?'
  if (move.evidence_grade !== 'A') {
    console.log(`⚠️ 이 초안이 딛고 선 무브의 등급이 ${move.evidence_grade} 다 (A 가 아니다).`)
    console.log('   저장은 하되 그 사실을 초안 메모에 적는다. 발행 여부는 사람이 다시 판단할 자리다.')
  }

  const notes = [
    `케이스 ${job.case_slug} / case_moves ${job.move_id} (${bottleneck} · ${move.lever} · 등급 ${move.evidence_grade} · ${move.outcome_direction})`,
    [job.log_code ? `판정 로그 ${job.log_code}` : null, job.decision_doc ? `게이트 판정 전문 ${job.decision_doc}` : null]
      .filter(Boolean).join(' / ') || '판정 전문 경로 미기재',
    job.gate_note ? `게이트: ${job.gate_note}` : null,
    `자기답글(고정 댓글, ${[...selfReply].length}자):\n${selfReply}`,
    `⛔ 미발행. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).`,
  ].filter(Boolean).join('\n\n')

  const base = {
    channel_id: channelId,
    body,
    char_count: charCount,
    content_code: job.content_code,
    hook_type: job.hook_type ?? null,
    closing_type: job.closing_type ?? null,
    topic_tag: job.topic_tag ?? 'case-study',
    published_at: null, // 발행 시각은 사람이 실제로 게시한 뒤에 생긴다
    notes,
  }

  const existing = await supabase.from('posts').select('id,status').eq('content_code', job.content_code).maybeSingle()
  if (existing.error) {
    console.error(`⚠️ 확인 불가: posts 조회 실패 — ${existing.error.code} ${existing.error.message}`)
    return 2
  }

  async function write(status) {
    const row = { ...base, status }
    if (existing.data) {
      return await supabase.from('posts').update(row).eq('id', existing.data.id).select('id,status').single()
    }
    return await supabase.from('posts').insert(row).select('id,status').single()
  }

  // ── 2-1) CG-1 발행 게이트 ─────────────────────────────────
  //
  // 등급 C 무브를 인용하는 초안은 본문에 출처 귀속 문구가 있어야 pending_review 로 간다
  // (L-62 결정). 순수 로컬 텍스트 검사다 — 어떤 외부 API 도 부르지 않는다.
  //
  // ★ 막힐 때 저장을 통째로 건너뛰지 않는다. status='draft' 로 눕혀 둔다. 초안 본문을
  //   날리면 사람이 고칠 대상 자체가 사라진다. 대신 exit 4 로 "게이트에서 막혔다"를 구분한다.
  //   이미 pending_review 였던 글이 나중에 강등돼 막히는 경우도 여기로 온다 — 그때는
  //   **끌어내리는 게 맞다.** 등급이 내려간 글을 발행 대기에 그대로 두면 L-63 의 재발이다.
  const gate = attributionGate(
    [{ ...move, slug: job.case_slug, brand_name: move.case_studies?.brand_name ?? null }],
    body,
  )
  console.log(`${gate.ok ? '✅' : '❌'} ${gate.code} — ${gate.reason}`)
  if (gate.matched) console.log(`   걸린 문구: ${gate.matched}`)
  if (gate.caveat) console.log(`   ⚠️ ${gate.caveat}`)

  if (!gate.ok) {
    const res = await write('draft')
    if (res.error) {
      console.error(`⚠️ 확인 불가: posts 저장 실패 — ${res.error.code} ${res.error.message}`)
      return 2
    }
    console.log(`❌ ${gate.code} 미통과 — status='draft' 로 눕혔다 (posts ${res.data.id}).`)
    console.log('   pending_review 로 올리려면 본문을 고치고 다시 돌려라.')
    for (const line of attributionHint()) console.error(`   ${line}`)
    return 4
  }

  let postId = null
  let fellBack = false
  {
    let res = await write('pending_review')
    if (res.error && res.error.code === '23514') {
      // CHECK 위반 = 마이그레이션 20260906000002 미적용. 눕히되 티를 낸다.
      fellBack = true
      res = await write('draft')
    }
    if (res.error) {
      console.error(`⚠️ 확인 불가: posts 저장 실패 — ${res.error.code} ${res.error.message}`)
      return 2
    }
    postId = res.data.id
    console.log(`✅ posts ${postId} (status=${res.data.status}, ${charCount}자, published_at=null)`)
  }

  // ── 3) 판정 로그 연결 ─────────────────────────────────────
  if (job.log_code) {
    const r = await linkDecisionLog(supabase, { postId, decisionLogCode: job.log_code, role: 'primary' })
    const ok = r.status === 'linked' || r.status === 'exists'
    console.log(`${ok ? '✅' : '⚠️'} post_decision_link ${postId} ↔ ${job.log_code} — ${r.status}${r.reason ? ` (${r.reason})` : ''}`)
    if (!ok) {
      console.error('⚠️ 연결 실패 — 초안이 어느 판정에서 나왔는지 DB 에서 추적 불가 상태다.')
      return 2
    }
  } else {
    console.log('ℹ️ log_code 미기재 — 판정 로그 연결을 건너뛴다 (연결 실패가 아니라 대상 없음).')
  }

  if (fellBack) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log("⚠️ status='draft' 로 폴백했다. 이건 '게이트를 안 돌린 초안'이라는 뜻이 아니다.")
    console.log('   마이그레이션 20260906000002_posts_pending_review.sql 가 아직 적용되지 않아')
    console.log("   CHECK 가 'pending_review' 를 거부했다 (23514). `supabase db query --linked -f")
    console.log('   supabase/migrations/20260906000002_posts_pending_review.sql` (또는 대시보드) 로 적용한 뒤 재실행 (§12-5).')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  }
  return fellBack ? 3 : 0
}
