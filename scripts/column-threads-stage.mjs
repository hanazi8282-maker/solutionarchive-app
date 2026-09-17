#!/usr/bin/env node
// 승인된 칼럼의 연재 편(content_columns.threads[]) → posts 발행 대기 초안.
//
// 왜 이 스크립트가 필요한가 (2026-09-18 실측으로 드러난 구멍).
//   칼럼에서 뗀 연재 편은 content_columns 안의 jsonb 원소로만 존재한다. posts 행이 없다.
//   그래서 그 편을 사람이 Threads 에 올려도
//     - 매처가 붙일 행이 없고(매처는 새 행을 만들지 않는다),
//     - 대시보드 수동 연결 드롭다운에도 안 나오고(posts 행만 채운다),
//     - 성과 수집(collect-metrics)은 posts.status='published' 만 보므로 조회수가 영영 안 붙는다.
//   posts 로 가는 경로는 지금 scripts/case-draft-stage.mjs(케이스 무브 → 초안) 하나뿐이고
//   칼럼 연재는 그 경로를 쓰지 않는다. 즉 **경로 자체가 없었다.** 이 파일이 그 자리다.
//
// ⛔ 발행하지 않는다(CLAUDE.md §10). 만드는 것은 status='pending_review',
//    published_at=NULL 인 행까지다. 발행은 사람이 Threads 앱에서 직접 하고, 연결은
//    매처나 /dashboard 가 한다. 이 파일에 Threads API 호출은 없다.
//
// ⛔ 이미 연결된 행(external_id 있음 / status='published')은 건드리지 않는다.
//    거기 있는 body 는 독자가 실제로 본 발행본이다 — 초안 본문으로 덮으면 성과 숫자와
//    본문이 다른 글을 가리킨다(match-posts route.ts 📌 참조).
//
// 사용:
//   node scripts/column-threads-stage.mjs --self-test                                      # DB 없이 행 생성만 검증
//   node --env-file=.env.local scripts/column-threads-stage.mjs --slug beauty-of-joseon    # 미리보기(쓰지 않는다)
//   node --env-file=.env.local scripts/column-threads-stage.mjs --slug beauty-of-joseon --apply
//   ... --episode 1                                                                        # 특정 편만
//
// 종료 코드: 0 = 정상 / 1 = 실패 / 2 = 확인 불가(env 없음·조회 실패)

import { flattenEpisodes } from '../lib/threads/column-episodes.ts'

const CHANNEL_ID = '64558fd1-06a5-4440-8fb1-bb78375479e0' // threads / @solution_arch_ (case-draft-stage.mjs 와 같은 값)
const THREADS_MAX = 500 // G-11. case-draft-stage.mjs 와 같은 상한.

const argv = process.argv.slice(2)
const has = (n) => argv.includes(`--${n}`)
const opt = (n, d = null) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
}

/**
 * 칼럼 1행 → 스테이징할 행 목록. **DB 를 부르지 않는다** — 그래서 --self-test 가 가능하다.
 * 반환: { rows } 또는 { error }.
 */
export function buildStageRows(column, { channelId = CHANNEL_ID, episode = null } = {}) {
  if (column?.review_status && column.review_status !== 'approved') {
    // 승인 전 편을 발행 대기로 올리지 않는다 — 검수 절차를 우회하는 길이 된다(§10.1).
    return { error: `승인되지 않은 칼럼이다(review_status=${column.review_status}) — /columns 에서 승인 먼저` }
  }
  const all = flattenEpisodes([column])
  const eps = episode === null ? all : all.filter((e) => String(e.n) === String(episode))
  if (!eps.length) {
    return { error: `스테이징할 편이 없다 (slug=${column?.slug ?? '?'}${episode === null ? '' : ` 편=${episode}`})` }
  }
  const over = eps.filter((e) => e.charCount > THREADS_MAX)
  if (over.length) {
    return { error: `${THREADS_MAX}자 초과 — ${over.map((e) => `${e.n}편 ${e.charCount}자`).join(', ')} (G-11)` }
  }

  return {
    rows: eps.map((e) => ({
      episode: e,
      item: {
        code: e.code,
        tier: 1,
        title: e.title,
        source_case: e.slug,
        status: 'proposed', // 사람이 고르기 전 단계. case-draft-stage.mjs 와 같은 값.
      },
      post: {
        channel_id: channelId,
        body: e.body,
        char_count: e.charCount,
        content_code: e.code,
        topic_tag: 'column',
        status: 'pending_review',
        published_at: null, // 발행 시각은 사람이 실제로 게시한 뒤에 생긴다
        notes: [
          `칼럼 연재 ${e.slug} ${e.n}편 (content_columns ${e.columnId})`,
          '이 행은 "연결할 자리"다. 사람이 발행할 때 문장을 다시 쓰면 매처 임계값(0.82)에 못 미쳐'
          + ' 자동 연결되지 않는다 — 그때는 /dashboard "초안에 안 붙은 발행 글"에서 이 초안을 고르면 된다.',
          '⛔ 미발행. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).',
        ].join('\n\n'),
      },
    })),
  }
}

/** 이미 있는 posts 행에 덮어써도 되는지. 연결된 행은 절대 손대지 않는다. */
export function canOverwrite(existing) {
  if (!existing) return { ok: true }
  if (existing.external_id) return { ok: false, why: `이미 Threads 게시물 ${existing.external_id} 에 연결됨` }
  if (existing.status === 'published') return { ok: false, why: 'status=published' }
  if (existing.status === 'discarded') return { ok: false, why: 'status=discarded (사람이 버린 초안)' }
  return { ok: true }
}

async function main() {
  if (has('self-test')) return selfTest()

  const slug = opt('slug')
  const episode = opt('episode')
  const apply = has('apply')
  if (!slug) {
    console.error('사용법: --slug <칼럼 slug> [--episode <편>] [--apply]')
    return 1
  }

  const { createClient } = await import('../lib/supabase/server.ts')
  const supabase = await createClient()
  if (!supabase) {
    console.error('❌ 확인 불가 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정')
    return 2
  }

  const col = await supabase
    .from('content_columns')
    .select('id, slug, title, threads, review_status, source_path')
    .eq('slug', slug)
    .maybeSingle()
  if (col.error) {
    console.error(`❌ 확인 불가 — content_columns 조회 실패: ${col.error.code ?? ''} ${col.error.message}`)
    return 2
  }
  if (!col.data) {
    console.error(`❌ slug=${slug} 인 칼럼이 없다 (적재부터: scripts/column-stage.mjs)`)
    return 1
  }

  const built = buildStageRows(col.data, { episode })
  if (built.error) {
    console.error(`❌ ${built.error}`)
    return 1
  }

  console.log(`━━ ${slug} · 편 ${built.rows.length}건 ${apply ? '스테이징' : '미리보기(쓰지 않는다)'} ━━`)
  let failed = 0
  for (const { episode: e, item, post } of built.rows) {
    console.log(`\n[${e.code}] ${e.title} · ${e.charCount}자`)
    console.log(`  content_items: code=${item.code} status=${item.status}`)
    console.log(`  posts:         status=${post.status} published_at=null topic_tag=${post.topic_tag}`)

    const existing = await supabase.from('posts')
      .select('id, status, external_id').eq('content_code', e.code).maybeSingle()
    if (existing.error) {
      console.error(`  ❌ 확인 불가 — posts 조회 실패: ${existing.error.code} ${existing.error.message}`)
      failed++
      continue
    }
    const guard = canOverwrite(existing.data)
    if (!guard.ok) {
      console.log(`  ⏭️  건너뜀 — ${guard.why}. 이 편은 이미 처리됐다.`)
      continue
    }
    if (!apply) {
      console.log(`  (미리보기) ${existing.data ? '기존 초안 갱신' : '신규 행 생성'} 예정 — 실제로 쓰려면 --apply`)
      continue
    }

    const it = await supabase.from('content_items').upsert(item, { onConflict: 'code' })
    if (it.error) {
      console.error(`  ❌ content_items 실패: ${it.error.code} ${it.error.message}`)
      failed++
      continue
    }
    const res = existing.data
      ? await supabase.from('posts').update(post).eq('id', existing.data.id)
        // 읽을 때의 상태일 때만 갱신한다(매처·수동 연결과 같은 규약).
        .eq('status', existing.data.status).select('id')
      : await supabase.from('posts').insert(post).select('id')
    if (res.error) {
      console.error(`  ❌ posts 실패: ${res.error.code} ${res.error.message}`)
      failed++
      continue
    }
    if (!res.data?.length) {
      console.error('  ❌ 0행 — 읽은 뒤 상태가 바뀌었다. 다시 실행해 확인하라.')
      failed++
      continue
    }
    console.log(`  ✅ posts ${res.data[0].id} (pending_review)`)
  }

  if (!apply) console.log('\n⛔ 아무것도 쓰지 않았다. 실제로 올리려면 --apply 를 붙인다.')
  return failed ? 1 : 0
}

function selfTest() {
  let passed = 0
  const fails = []
  const check = (name, cond, detail = '') => {
    if (cond) passed++
    else fails.push(`${name}${detail ? ` — ${detail}` : ''}`)
  }

  const column = {
    id: 'fc5c4409-b5cf-475c-a0c9-e966d9b7b4cd',
    slug: 'beauty-of-joseon',
    title: '조선미녀',
    review_status: 'approved',
    threads: [
      { n: '1', body: '아이템을 못 정한 창업자는 보통 새로 만들 것부터 찾는다.', char_count: 419, warns: [] },
      { n: '2', body: '조선미녀는 국내에서 촌스럽다는 소리를 듣던 한방을 숨기지 않았다.', char_count: 372, warns: [] },
    ],
  }

  const all = buildStageRows(column)
  check('편 2건이 행 2건으로', all.rows?.length === 2, JSON.stringify(all.error ?? all.rows?.length))
  check('content_code 채번', all.rows?.[0].post.content_code === 'COL-beauty-of-joseon-01', all.rows?.[0].post.content_code)
  check('발행 대기 상태', all.rows?.[0].post.status === 'pending_review')
  check('published_at 은 NULL', all.rows?.[0].post.published_at === null)
  check('char_count 은 DB 값 그대로', all.rows?.[0].post.char_count === 419)
  check('소재 행 status=proposed', all.rows?.[0].item.status === 'proposed')
  check('notes 에 미발행 표시', /⛔ 미발행/.test(all.rows?.[0].post.notes ?? ''))
  check('notes 에 원본 칼럼 추적', (all.rows?.[0].post.notes ?? '').includes(column.id))

  const one = buildStageRows(column, { episode: 2 })
  check('--episode 로 한 편만', one.rows?.length === 1 && one.rows[0].episode.n === '2')
  check('없는 편은 error', !!buildStageRows(column, { episode: 9 }).error)

  check('미승인 칼럼은 error',
    !!buildStageRows({ ...column, review_status: 'draft' }).error)
  check('본문 없는 원소는 버린다',
    buildStageRows({ ...column, threads: [{ n: '1', body: '   ' }, ...column.threads] }).rows?.length === 2)
  check('500자 초과는 error',
    !!buildStageRows({ ...column, threads: [{ n: '1', body: 'ㄱ'.repeat(501), char_count: 501 }] }).error)
  check('편 0건은 error', !!buildStageRows({ ...column, threads: [] }).error)

  // 연결된 행을 덮어쓰지 않는다 — 이게 이 스크립트의 가장 위험한 자리다.
  check('연결된 행은 건너뜀', canOverwrite({ status: 'published', external_id: '18165008242467071' }).ok === false)
  check('published 는 건너뜀', canOverwrite({ status: 'published', external_id: null }).ok === false)
  check('discarded 는 건너뜀', canOverwrite({ status: 'discarded', external_id: null }).ok === false)
  check('pending_review 는 갱신 가능', canOverwrite({ status: 'pending_review', external_id: null }).ok === true)
  check('행이 없으면 생성 가능', canOverwrite(null).ok === true)

  if (fails.length) {
    console.error(`\n❌ ${fails.length}건 실패 / ${passed + fails.length}건 중`)
    for (const f of fails) console.error(`  - ${f}`)
    return 1
  }
  console.log(`✅ ${passed}건 전부 통과 (DB 없이 행 생성만 검증)`)
  return 0
}

process.exit(await main())
