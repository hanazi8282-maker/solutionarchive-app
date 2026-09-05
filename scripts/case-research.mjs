#!/usr/bin/env node
// 케이스스터디 초안 — 뼈대 생성 / 리서치 지시문 출력 / 검증. DB 를 건드리지 않는다.
//
// ⚠️ 이 스크립트는 웹서치를 하지 않는다. 못 한다.
//    이 리포에는 Node 에서 웹을 검색할 수 있는 경로가 없다 — lib/ai 도 없고,
//    grounding 붙은 프로바이더도 없고, 검색 API 키도 없다. 있는 척하는
//    래퍼를 만들면 "0건 검색됨"이 "검색기가 안 돌았다"인지 "진짜 없다"인지
//    구분 안 되는 층이 하나 더 생긴다 (§7.1).
//
//    그래서 역할을 이렇게 나눴다:
//      웹서치·구조화  →  에이전트(Claude Code)가 WebSearch 로 한다
//      지시문·검증·등급·저장 → 이 스크립트가 한다
//    사람이 읽을 지시문(brief)을 스크립트가 찍어 주므로 리서치 기준은
//    매번 동일하다. 흔들리는 건 검색 결과지 기준이 아니다.
//
// 사용:
//   node scripts/case-research.mjs brief    --brand "Notion" --market "협업 SaaS"
//   node scripts/case-research.mjs scaffold --slug notion --brand "Notion"
//   node scripts/case-research.mjs validate --slug notion
//   node scripts/case-research.mjs validate --all
//
// 종료 코드: 0 통과 / 1 error 이슈 있음 / 2 사용법·입출력 오류

import fs from 'node:fs'
import path from 'node:path'
import {
  BUSINESS_MODEL, BUYER_TYPE, PURCHASE_FREQUENCY, PRICE_BAND, BOTTLENECK,
  LEVER, OUTCOME_STATUS, OUTCOME_DIRECTION, SOURCE_TIER, SNIPPET_MAX,
  SLUG_RE, validateDraft, gradeMove, toRows,
} from '../lib/cases/draft.ts'

export const DRAFT_DIR = path.join(process.cwd(), 'drafts', 'cases')

const args = process.argv.slice(2)
const cmd = args[0]
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const flag = (name) => args.includes(`--${name}`)

const draftPath = (slug) => path.join(DRAFT_DIR, `${slug}.json`)

const readDraft = (slug) => {
  const p = draftPath(slug)
  if (!fs.existsSync(p)) {
    console.error(`✗ 초안이 없다: ${p}`)
    console.error('  "검증 통과"가 아니라 "파일 없음"이다. scaffold 먼저 돌려라.')
    process.exit(2)
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch (e) {
    console.error(`✗ JSON 파싱 실패: ${p}`)
    console.error(`  ${e.message}`)
    console.error('  ⚠️ 파싱 못 한 초안은 "이슈 없음"이 아니다. 오류로 올린다.')
    process.exit(2)
  }
}

// ────────────────────────────────────────────────────────────
// brief — 에이전트/사람이 읽을 리서치 지시문
// ────────────────────────────────────────────────────────────
function brief() {
  const brand = opt('brand') ?? '<브랜드>'
  const market = opt('market')
  console.log(`
════════════════════════════════════════════════════════════
케이스스터디 리서치 지시문 — ${brand}${market ? ` (${market})` : ''}
════════════════════════════════════════════════════════════

목적은 "이 브랜드 소개"가 아니다. **다른 사업에 옮길 수 있는 실행 1개**를
근거와 함께 꺼내는 것이다. 옮길 수 없는 사실은 적지 마라.

■ 반드시 답할 것
  1. 어떤 병목이었나  (${BOTTLENECK.join(' / ')})
     — 이게 매칭의 1순위 축이다. 업종이 아니라 병목으로 사례를 찾는다.
  2. 그래서 무엇을 바꿨나 (무브). 레버는:
     ${LEVER.join(', ')}
  3. 바꾸기 전/후 수치는? metric_name·before·after·unit 을 전부.
  4. 언제 관측된 사실인가? (observed_period_start/end)
  5. 그 수치의 출처 URL 은? 자기보고인가 아닌가?
  6. 지금도 살아 있나? 확인 못 했으면 outcome_status='unknown' 으로 둔다.
     ★ 확인 실패를 'active' 로 적지 마라 (§7.1).

■ 검색어 예시
  "${brand}" growth / "${brand}" 매출 성장 / "${brand}" case study
  "${brand}" 리브랜딩 OR 가격정책 OR 전환율
  "${brand}" 창업자 인터뷰   ← primary 이지만 is_self_reported=true 다

■ 출처를 찾는 순서 ★ 시범 5건에서 여기가 가장 크게 어긋났다
  1. 상장사·공시 대상이면 **공시부터** 찾아라 — SEC(EDGAR: S-1/10-K/8-K 주주서한),
     DART(감사보고서). is_regulatory_filing=true 로 적으면 등급 A 다.
     ⚠️ 듀오링고를 3차 블로그로 조사했더니 DAU 가 1600만→3000만이었는데,
       공시(8-K)에는 1000만→2700만이었다. **틀린 숫자를 쌓을 뻔했다.**
  2. 비상장이면 조사기관 추정치 + 무역·업계 매체. 추정치는 is_estimate=true.
  3. 브랜드 자사 블로그/인터뷰는 마지막이다. 맥락에는 좋고 수치에는 약하다.
  ★ 등급 A 를 받으려면 (공시 1건) 또는 (비자기보고 1차 1건) 또는
    (자기보고·추정이 아닌 서로 다른 도메인 2곳)이 필요하다. 목표를 A 로 잡아라.

■ 근거 규칙 (여기서 대부분 어긋난다)
  - source_tier / is_self_reported / is_estimate 는 **서로 별개 축**이다.
    창업자 인터뷰 = primary + self_reported. 가장 흔하고 가장 위험한 조합.
  - is_estimate=true 는 조사기관이 **추정한** 값이다. 비상장사 매출은 대부분
    여기 해당한다. 추정치는 A 등급을 만들지 못한다 — 반드시 표시해라.
    "Sacra 추정", "업계 추산", "~로 알려졌다"는 전부 추정치다.
  - published_at 은 원문 게시일이다. 우리가 읽은 날이 아니다.
    모르면 비워라. 오늘 날짜로 채우지 마라. 다만 **비우기 전에 한 번은 찾아봐라** —
    시범 5건에서 근거 17건 중 11건이 게시일 미상이었다. 대부분 확인 가능했다.
  - snippet 은 ${SNIPPET_MAX}자 이하. 원문 전문 복사 금지.
  - 같은 보도자료를 받아쓴 기사 5개는 출처 1개다. 도메인이 달라야 센다.

■ 수치가 없으면
  수치 없는 무브도 적어라. 등급 D 로 저장되고 PMF 스코어링에서만 빠진다.
  ★ 없는 수치를 지어내면 그게 이 파이프라인을 통째로 무효로 만든다.
    근거 0건 + 수치 있음 = validate 에서 error 로 막힌다.

■ 실패·부정 사례
  outcome_direction='negative' 도 환영한다. 다만 발행은 등급 A 일 때만이다
  (실명 브랜드에 대한 부정 서술이라 근거가 약하면 사내 참고용으로만 둔다).

■ 산출
  node scripts/case-research.mjs scaffold --slug <slug> --brand "${brand}"
  로 만든 JSON 을 채운다. 어휘는 스키마 CHECK 와 같아야 한다:
    business_model     ${BUSINESS_MODEL.join(' / ')}
    buyer_type         ${BUYER_TYPE.join(' / ')}
    purchase_frequency ${PURCHASE_FREQUENCY.join(' / ')}
    price_band         ${PRICE_BAND.join(' / ')}
    outcome_status     ${OUTCOME_STATUS.join(' / ')}
    outcome_direction  ${OUTCOME_DIRECTION.join(' / ')}
    source_tier        ${SOURCE_TIER.join(' / ')}
  채운 뒤:
  node scripts/case-research.mjs validate --slug <slug>
════════════════════════════════════════════════════════════
`)
}

// ────────────────────────────────────────────────────────────
// scaffold — 빈 초안 JSON
// ────────────────────────────────────────────────────────────
function scaffold() {
  const slug = opt('slug')
  const brand = opt('brand')
  if (!slug || !brand) {
    console.error('사용: scaffold --slug <slug> --brand "<브랜드명>" [--market "<시장>"]')
    process.exit(2)
  }
  if (!SLUG_RE.test(slug)) {
    console.error(`✗ slug 는 소문자·숫자·하이픈만: ${slug}`)
    process.exit(2)
  }
  const p = draftPath(slug)
  if (fs.existsSync(p) && !flag('force')) {
    console.error(`✗ 이미 있다: ${p}`)
    console.error('  덮어쓰면 앞서 한 리서치가 사라진다. 정말이면 --force.')
    process.exit(2)
  }
  fs.mkdirSync(DRAFT_DIR, { recursive: true })

  const skeleton = {
    slug,
    brand_name: brand,
    market: opt('market'),
    geo: null,
    business_model: null,
    buyer_type: null,
    purchase_frequency: null,
    price_band: null,
    bottleneck: null,
    outcome_status: 'unknown',
    period_start: null,
    period_end: null,
    summary: null,
    tags: [],
    researched_by: 'claude-code',
    moves: [
      {
        lever: null,
        claim: '',
        outcome_direction: 'positive',
        metric_name: null,
        metric_before: null,
        metric_after: null,
        metric_unit: null,
        observed_period_start: null,
        observed_period_end: null,
      },
    ],
    evidence: [
      {
        move: 0,
        url: '',
        source_tier: 'secondary',
        is_self_reported: false,
        is_estimate: false,
        is_regulatory_filing: false,
        published_at: null,
        snippet: null,
        supports_claim: null,
      },
    ],
  }
  fs.writeFileSync(p, JSON.stringify(skeleton, null, 2) + '\n', 'utf-8')
  console.log(`✅ 뼈대 생성: ${path.relative(process.cwd(), p)}`)
  console.log('   지시문:  node scripts/case-research.mjs brief --brand ' + JSON.stringify(brand))
}

// ────────────────────────────────────────────────────────────
// validate
// ────────────────────────────────────────────────────────────
function report(slug, draft) {
  const issues = validateDraft(draft)
  const errors = issues.filter(i => i.level === 'error')
  const warns = issues.filter(i => i.level === 'warn')

  console.log(`\n── ${slug} — ${draft.brand_name ?? '(브랜드 없음)'} ──`)
  if (errors.length === 0) {
    const { moves } = toRows(draft)
    const dist = { A: 0, B: 0, C: 0, D: 0 }
    for (const m of moves) dist[m.row.evidence_grade]++
    console.log(`  무브 ${moves.length}건 · 근거 ${draft.evidence?.length ?? 0}건 · `
      + `등급 A${dist.A} B${dist.B} C${dist.C} D${dist.D}`)
    for (const m of moves) {
      console.log(`    [${m.row.evidence_grade}] ${m.row.lever} — ${m.row.claim.slice(0, 60)}`)
      console.log(`         ${m.grade_reason}`)
    }
  }
  for (const e of errors) console.log(`  ❌ ${e.where}: ${e.message}`)
  for (const w of warns) console.log(`  ⚠️  ${w.where}: ${w.message}`)
  if (errors.length === 0 && warns.length === 0) console.log('  ✅ 이슈 없음')
  return errors.length
}

function validate() {
  let slugs
  if (flag('all')) {
    if (!fs.existsSync(DRAFT_DIR)) {
      console.error(`✗ 초안 디렉터리가 없다: ${DRAFT_DIR}`)
      console.error('  "초안 0건 통과"가 아니다 — 아직 아무것도 안 만든 것이다.')
      process.exit(2)
    }
    slugs = fs.readdirSync(DRAFT_DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
    if (slugs.length === 0) {
      console.error(`✗ ${DRAFT_DIR} 에 초안이 0건이다. 검증할 대상이 없다.`)
      process.exit(2)
    }
  } else {
    const slug = opt('slug')
    if (!slug) { console.error('사용: validate --slug <slug> | validate --all'); process.exit(2) }
    slugs = [slug]
  }

  let totalErrors = 0
  for (const slug of slugs) totalErrors += report(slug, readDraft(slug))

  console.log(`\n검증 대상 ${slugs.length}건 · error ${totalErrors}건`)
  if (totalErrors > 0) {
    console.log('❌ error 가 있는 초안은 case-review.mjs 가 DB 에 넣지 않는다.')
    process.exit(1)
  }
  console.log('✅ 전부 통과 — 다음: node --env-file=.env.local scripts/case-review.mjs list')
}

switch (cmd) {
  case 'brief': brief(); break
  case 'scaffold': scaffold(); break
  case 'validate': validate(); break
  default:
    console.error('명령: brief | scaffold | validate')
    console.error('예:  node scripts/case-research.mjs validate --all')
    process.exit(2)
}
