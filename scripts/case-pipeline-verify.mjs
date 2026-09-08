#!/usr/bin/env node
// 20260906000001(3테이블) · 20260906000002(posts.status 어휘) · 20260906000003(is_issuer_defined_metric) 적용 확인.
//
// 사용:
//   node --env-file=.env.local scripts/case-pipeline-verify.mjs
//   node --env-file=.env.local scripts/case-pipeline-verify.mjs --probe
//
// 기본은 읽기 전용. `--probe` 는 CHECK 제약이 실제로 **막는지** 확인하려고
// INSERT 를 시도하고 즉시 지운다. PostgREST 로는 제약을 읽을 수 없어서,
// "막아야 할 것을 넣어 보고 거절당하는지" 말고는 확인할 방법이 없다.
//
// ⚠️ head:true 를 쓰지 않는다. 없는 테이블에도 에러 없이 204 를 돌려준다(실측).
//
// §7.1 — 세 상태를 구분한다: ✅ 양성 / ❌ 음성 / ⚠️ 확인 불가.
//    확인 불가가 하나라도 있으면 exit 2. 그걸 "적용됨"으로 접지 않는다.

import { createClient } from '../lib/supabase/server.ts'

const PROBE = process.argv.includes('--probe')
const PROBE_SLUG = '__probe-case-pipeline__'

const supabase = await createClient()
if (!supabase) {
  console.error('⚠️ 확인 불가 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정')
  console.error('   "적용 안 됐다"가 아니라 "확인을 못 했다"다.')
  process.exit(2)
}

let positive = 0
let negative = 0
let unknown = 0

class Verdict extends Error {
  constructor(kind, msg) { super(msg); this.kind = kind }
}
const absent = (m) => new Verdict('absent', m)
const unsure = (m) => new Verdict('unknown', m)

const check = async (label, fn) => {
  try {
    const msg = await fn()
    positive++
    console.log(`  ✅ ${label}${msg ? ` — ${msg}` : ''}`)
  } catch (e) {
    if (e instanceof Verdict && e.kind === 'absent') {
      negative++
      console.log(`  ❌ ${label} — 확인해보니 없다: ${e.message}`)
    } else {
      unknown++
      console.log(`  ⚠️ ${label} — 확인 불가: ${e.message}`)
    }
  }
}

const classify = (error) => {
  const code = error.code ?? ''
  const msg = error.message || '(메시지 없음)'
  if (code === '42P01' || code === '42703' || code === 'PGRST205' || /does not exist/i.test(msg)) {
    return absent(`${code} ${msg}`)
  }
  return unsure(`${code} ${msg}`)
}

const columns = (table, cols) => async () => {
  const { error, count, status } = await supabase
    .from(table).select(cols, { count: 'exact' }).limit(1)
  if (error) throw classify(error)
  if (status !== 200 && status !== 206) throw unsure(`예상 밖 응답 status=${status}`)
  return `${count ?? 0}행`
}

/** 넣어 보고 CHECK 로 막히는지 본다. 안 막히면 넣힌 행을 지우고 음성으로 올린다. */
const rejects = (table, row, cleanup) => async () => {
  const { error } = await supabase.from(table).insert(row)
  if (!error) {
    if (cleanup) await cleanup()
    throw absent('들어갔다 — 제약이 안 걸려 있다')
  }
  if (!/check constraint|violates unique/i.test(error.message)) throw classify(error)
  return `막았다 (${error.code})`
}

console.log('# 케이스스터디 파이프라인 마이그레이션 적용 확인\n')
console.log(`모드: ${PROBE ? '읽기 + 제약 프로브(INSERT 후 삭제)' : '읽기 전용'}\n`)

console.log('## 20260906000001 — 3테이블\n')

await check('case_studies 주요 컬럼', columns('case_studies',
  'id, slug, brand_name, business_model, buyer_type, purchase_frequency, price_band, '
  + 'bottleneck, outcome_status, period_start, period_end, summary, tags, review_status, '
  + 'researched_by, reviewed_by, reviewed_at, created_at'))

await check('case_moves 주요 컬럼', columns('case_moves',
  'id, case_study_id, lever, claim, outcome_direction, metric_name, metric_before, '
  + 'metric_after, metric_unit, observed_period_start, observed_period_end, '
  + 'evidence_grade, review_status, created_at'))

await check('case_evidence 주요 컬럼', columns('case_evidence',
  'id, case_study_id, case_move_id, url, domain, source_tier, is_self_reported, is_estimate, '
  + 'is_regulatory_filing, '
  + 'published_at, retrieved_at, snippet, supports_claim, created_at'))

// ★ 있으면 안 되는 것도 본다. 설계에서 명시적으로 뺀 컬럼이다
//   (valid_until — 채울 근거가 없어서 전부 NULL 로 남고, NULL 이 "유효기간
//   없음"으로 읽힌다. profile_clicks 가 실제로 그 꼴이었다).
await check('case_moves.valid_until 이 없는가 (설계상 없어야 정상)', async () => {
  const { error } = await supabase.from('case_moves').select('valid_until').limit(1)
  if (!error) throw absent('valid_until 이 있다 — 설계와 다르다. 누가 추가했는지 확인하라')
  // ★ 테이블 자체가 없으면 이 검사는 아무것도 확인하지 못한다. "컬럼이 없다"로
  //   찍으면 미적용 상태에서 초록불이 뜬다 — 공허하게 참인 검사다 (§7.1).
  //   42703(컬럼 없음)일 때만 양성이고, 42P01/PGRST205(테이블 없음)는 확인 불가다.
  const code = error.code ?? ''
  if (code === '42P01' || code === 'PGRST205') {
    throw unsure(`case_moves 테이블 자체가 없어 컬럼 유무를 판정할 수 없다 (${code})`)
  }
  if (code !== '42703') throw classify(error)
  return '없다 (observed_period_start/end 로 대체)'
})

console.log('\n## 20260906000003 — case_evidence.is_issuer_defined_metric (L-56)\n')

// ★ 이건 **컬럼** 추가라서 select(컬럼명) 이 맞는 확인 방법이다.
//   바로 아래 20260906000002 와 확인 방법이 다른 이유를 그쪽 주석에 적어 뒀다.
await check('is_issuer_defined_metric 컬럼', columns('case_evidence', 'id, is_issuer_defined_metric'))

// 백필은 통과/실패가 아니라 **진척도**다. 0 이어도 정상이다 — 스키마만 적용하고
// 판정(어떤 근거가 감사 범위 밖인가)은 사람이 따로 검토해 넣기로 한 설계다.
{
  const { count, error } = await supabase.from('case_evidence')
    .select('id', { count: 'exact' }).eq('is_issuer_defined_metric', true).limit(1)
  const { count: total } = await supabase.from('case_evidence').select('id', { count: 'exact' }).limit(1)
  console.log(error
    ? `  · 백필 진척도 — 확인 불가 (컬럼이 없다: ${error.code})`
    : `  · 백필 진척도 — ${count ?? 0} / ${total ?? 0} 행이 '발행사 자체 정의 지표'로 표시돼 있다`)
}

console.log('\n## 20260907000001 — case_evidence.observation_key / supports_metric (L-60·L-64)\n')

await check('observation_key / supports_metric 컬럼', columns('case_evidence',
  'id, observation_key, supports_metric'))

// ★ 이 마이그는 컬럼이 생긴 것만으로 일이 끝나지 않는다. 두 축 다 NULL 을 허용하고,
//   NULL 은 "아니다"가 아니라 "확인 안 했다"라서 **백필 진척도까지 봐야** 상태를 안다.
//   커버리지 0 이면 case-review.mjs regrade 가 멈춘다(--force 필요) — 그것도 여기 적어 둔다.
{
  const { data, error } = await supabase.from('case_evidence').select('observation_key, supports_metric')
  if (error) {
    console.log(`  · 백필 진척도 — 확인 불가 (컬럼이 없다: ${error.code})`)
  } else {
    const keyed = data.filter(r => (r.observation_key ?? '').trim()).length
    const marked = data.filter(r => r.supports_metric !== null).length
    console.log(`  · 백필 진척도 — 관측 키 ${keyed} / ${data.length} 행, 수치 뒷받침 기재 ${marked} / ${data.length} 행`)
    if (keyed === 0) {
      console.log('    ⚠️ 키가 한 행도 없다. 이 상태의 regrade 결과는 판정이 아니라 투영이다 (§7.1).')
    }
  }
}

if (PROBE) {
  console.log('\n## 제약 프로브 (양성 = 정상 INSERT / 음성 = 거절돼야 정상)\n')

  const cleanup = async () => {
    await supabase.from('case_studies').delete().like('slug', '__probe-case-pipeline%')
  }
  await cleanup() // 이전 실행이 중간에 죽었을 수 있다

  let studyId = null

  await check('정상 INSERT 가 되고 기본값이 채워지는가', async () => {
    const { data, error } = await supabase.from('case_studies')
      .insert({ slug: PROBE_SLUG, brand_name: '검증용', bottleneck: 'TRUST', business_model: 'D2C' })
      .select('id, outcome_status, review_status, tags')
    if (error) throw classify(error)
    const row = data[0]
    studyId = row.id
    // ★ 기본값이 'active' 면 "확인 안 함"이 "정상 영업 중"으로 접힌다.
    if (row.outcome_status !== 'unknown') {
      throw absent(`outcome_status 기본값이 '${row.outcome_status}' 다 — 'unknown' 이어야 한다`)
    }
    if (row.review_status !== 'draft') {
      throw absent(`review_status 기본값이 '${row.review_status}' 다 — 'draft' 여야 한다`)
    }
    return `unknown / draft / tags=${JSON.stringify(row.tags)}`
  })

  if (!studyId) {
    unknown++
    console.log('  ⚠️ 이후 프로브 — 확인 불가: 기준 케이스를 못 만들어 제약을 시험할 수 없다')
    console.log('     "제약이 없다"가 아니다.')
  } else {
    await check('어휘 밖 bottleneck 을 막는가', rejects('case_studies',
      { slug: '__probe-case-pipeline-2__', brand_name: 'x', bottleneck: 'VIBES' },
      async () => { await supabase.from('case_studies').delete().eq('slug', '__probe-case-pipeline-2__') }))

    await check('slug 중복을 막는가', rejects('case_studies',
      { slug: PROBE_SLUG, brand_name: '중복' }, null))

    await check('300자 넘는 스니펫을 막는가', rejects('case_evidence',
      { case_study_id: studyId, url: 'https://example.com', snippet: '가'.repeat(301) }, null))

    await check('이름·단위 없는 수치를 막는가', rejects('case_moves',
      { case_study_id: studyId, lever: 'PRICING', claim: '가격 올렸더니 잘 됨', metric_after: 42 }, null))

    await check('관측 기간 역전을 막는가', rejects('case_moves',
      { case_study_id: studyId, lever: 'PRICING', claim: 'x',
        observed_period_start: '2026-01-01', observed_period_end: '2025-01-01' }, null))

    await check('어휘 밖 evidence_grade 를 막는가', rejects('case_moves',
      { case_study_id: studyId, lever: 'PRICING', claim: 'x', evidence_grade: 'S' }, null))

    await check('2차로 표시된 법정 공시를 막는가', rejects('case_evidence',
      { case_study_id: studyId, url: 'https://www.sec.gov/probe',
        source_tier: 'secondary', is_regulatory_filing: true }, null))

    // ── 20260907000001 의 CHECK 두 개. 컬럼만 생기고 제약을 빠뜨리면
    //    'CHWY 10K' 같은 제각각 키가 들어와 축이 조용히 무의미해진다.
    await check('모양 안 맞는 관측 키를 막는가', rejects('case_evidence',
      { case_study_id: studyId, url: 'https://example.com/probe-key',
        observation_key: 'CHWY 10K_2023' }, null))

    await check('빈 문자열 관측 키를 막는가', rejects('case_evidence',
      { case_study_id: studyId, url: 'https://example.com/probe-key2',
        observation_key: '' }, null))

    // 무브에 붙지 않은 근거에는 받칠 수치 자체가 없다.
    await check('무브 없는 근거의 supports_metric=true 를 막는가', rejects('case_evidence',
      { case_study_id: studyId, case_move_id: null,
        url: 'https://example.com/probe-metric', supports_metric: true }, null))

    // 양성 쪽도 본다 — 정상 키가 거절당하면 정규식이 너무 좁은 것이다.
    await check('정상 관측 키는 통과하는가', async () => {
      const { data, error } = await supabase.from('case_evidence')
        .insert({ case_study_id: studyId, url: 'https://example.com/probe-ok',
          observation_key: 'chwy-10k-fy2023', supports_metric: false })
        .select('id, observation_key, supports_metric')
      if (error) throw classify(error)
      await supabase.from('case_evidence').delete().eq('id', data[0].id)
      return `${data[0].observation_key} / supports_metric=${data[0].supports_metric}`
    })

    await check('CASCADE 로 자식이 같이 지워지는가', async () => {
      const { error: mErr, data: mRows } = await supabase.from('case_moves')
        .insert({ case_study_id: studyId, lever: 'CONTENT', claim: '프로브' }).select('id')
      if (mErr) throw classify(mErr)
      const moveId = mRows[0].id
      const { error: eErr } = await supabase.from('case_evidence')
        .insert({ case_study_id: studyId, case_move_id: moveId, url: 'https://example.com/probe' })
      if (eErr) throw classify(eErr)

      await cleanup()

      const { count: mLeft, error: e1 } = await supabase.from('case_moves')
        .select('id', { count: 'exact' }).eq('id', moveId).limit(1)
      if (e1) throw classify(e1)
      const { count: eLeft, error: e2 } = await supabase.from('case_evidence')
        .select('id', { count: 'exact' }).eq('case_move_id', moveId).limit(1)
      if (e2) throw classify(e2)
      if ((mLeft ?? 0) !== 0 || (eLeft ?? 0) !== 0) {
        throw absent(`케이스를 지웠는데 무브 ${mLeft}행 / 근거 ${eLeft}행이 남았다 — CASCADE 가 없다`)
      }
      studyId = null
      return '무브·근거가 같이 지워졌다'
    })
  }

  await cleanup()
  const { count: left } = await supabase.from('case_studies')
    .select('id', { count: 'exact' }).like('slug', '__probe-case-pipeline%').limit(1)
  if (left) {
    unknown++
    console.log(`  ⚠️ 프로브 행 ${left}건이 남아 있다 — slug LIKE '__probe-case-pipeline%' 를 직접 지워라`)
  }
}

console.log('\n## 20260906000002 — posts.status 어휘에 pending_review 가 있는가 (L-52)\n')

// ★★ 확인 방법을 틀리기 쉬운 자리다. 실제로 틀렸다.
//
//   이 마이그레이션은 컬럼을 추가하지 않는다. posts_status_check 의 **허용 값**에
//   'pending_review' 를 더할 뿐이다. 그런데 6차 라운드에서 임시 스크립트가
//   `supabase.from('posts').select('pending_review')` 로 확인했다 — 값을 컬럼명
//   자리에 넣은 것이라 적용됐든 안 됐든 42703 이 돌아온다. 그 42703 을
//   "미적용"으로 읽어서 이미 적용된 마이그를 미적용이라고 보고했다.
//
//   "내 쿼리가 틀렸다"를 "확인 결과 음성"으로 접은 것이고, 정확히 §7.1 이 막으라는
//   실수다. 어휘는 읽어서 알 수 없다 — **넣어 봐야** 안다. 그래서 이 검사는
//   --probe 에서만 판정하고, 그 밖에서는 양성으로 접지 않고 확인 불가로 남긴다.
if (!PROBE) {
  unknown++
  console.log("  ⚠️ 확인 불가 — CHECK 어휘는 INSERT 를 해 봐야 안다. --probe 로 다시 돌려라")
  console.log("     (읽기만으로 '적용됨'이라고 답할 수 있는 방법이 없다. 없다고 답하지도 않는다)")
} else {
  const { data: ch } = await supabase.from('channels').select('id').limit(1)
  const channelId = ch?.[0]?.id ?? null
  // content_code 는 content_items 를 가리키는 FK 라서(posts_content_code_fkey) 아무 문자열이나
  // 넣으면 23503 이 난다. 그건 CHECK 어휘와 무관한 실패인데 "확인 불가"로 찍혀서 또 헷갈린다.
  // 컬럼이 nullable 이니 null 로 두고, 지울 때는 body 표식으로 찾는다.
  const probeBody = '__probe-posts-status__ 검증용 프로브'
  const cleanPosts = async () => { await supabase.from('posts').delete().eq('body', probeBody) }

  if (!channelId) {
    unknown++
    console.log('  ⚠️ 확인 불가 — channels 행이 없어 probe posts 행을 만들 수 없다. "어휘가 없다"가 아니다')
  } else {
    await cleanPosts()
    const mkRow = (status) => ({
      channel_id: channelId, body: probeBody, char_count: probeBody.length,
      content_code: null, status, published_at: null,
    })

    await check("status='pending_review' 가 통과하는가", async () => {
      const { data, error } = await supabase.from('posts').insert(mkRow('pending_review')).select('id, status')
      if (error) {
        if (error.code === '23514') throw absent("CHECK 가 'pending_review' 를 거부했다 (23514) — 마이그 미적용")
        throw classify(error)
      }
      await cleanPosts()
      return `들어갔다 (status=${data[0].status})`
    })

    // 오타까지 통과하면 CHECK 가 아예 안 걸린 것이다. 넓힌 게 아니라 열어 둔 것.
    await check("오타 'pending_reviw' 는 막는가", rejects('posts', mkRow('pending_reviw'), cleanPosts))

    await cleanPosts()
    const { count: leftPosts } = await supabase.from('posts')
      .select('id', { count: 'exact' }).eq('body', probeBody).limit(1)
    if (leftPosts) {
      unknown++
      console.log(`  ⚠️ 프로브 posts ${leftPosts}행이 남아 있다 — body='${probeBody}' 를 직접 지워라`)
    }
  }
}

console.log(`\n---\n양성 ${positive} / 음성 ${negative} / 확인 불가 ${unknown}`)

if (unknown) {
  console.log('\n⚠️ 확인 불가가 있다. 이걸 "적용됨"으로 읽지 마라 (CLAUDE.md §7.1).')
  process.exit(2)
}
if (negative) {
  console.log('\n❌ 미적용/불일치 항목이 있다. 사람이 `supabase db query --linked -f supabase/migrations/<file>.sql` (또는 대시보드) 로 적용하라 (§12-5).')
  process.exit(1)
}
console.log('\n✅ 전부 적용됐다. case-review.mjs commit 을 써도 된다.')
