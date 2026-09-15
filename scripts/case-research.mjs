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
import { fileURLToPath } from 'node:url'
import {
  BUSINESS_MODEL, BUYER_TYPE, PURCHASE_FREQUENCY, PRICE_BAND, BOTTLENECK,
  LEVER, OUTCOME_STATUS, OUTCOME_DIRECTION, SOURCE_TIER, SNIPPET_MAX,
  SLUG_RE, READER_PROBLEMS, validateDraft, gradeMove, toRows,
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
export function briefText(brand = '<브랜드>', market = null) {
  return `
════════════════════════════════════════════════════════════
케이스스터디 리서치 지시문 — ${brand}${market ? ` (${market})` : ''}
════════════════════════════════════════════════════════════

이 조사의 독자는 **"만들 줄은 아는데 그걸 돈으로 바꾸는 법을 모르는 사람"**이다.
창업·제작에서 실제로 막혀 있는 사람이고, 브랜드 소개를 읽으러 오지 않았다.

그래서 목적은 "${brand} 는 이런 회사다"가 아니라, **그 사람이 자기 상황에
옮겨 쓸 수 있는 실행 1개**를 근거와 함께 꺼내는 것이다. 옮길 수 없는 사실은
아무리 흥미로워도 적지 마라.

★ 목표는 등급 A 가 아니라 **옮길 수 있는 무브 1개**다. 등급은 그 무브에 붙는
  성질이지 조사의 목표가 아니다. 등급 D 짜리 무브라도 옮길 수 있으면 값이
  있고, 등급 A 짜리라도 그 회사라서 됐던 일이면 이 아카이브에 쓸 데가 없다.

■ 반드시 답할 것 — **이 순서대로 답해라**

  1. 이 이야기를 옮겨 쓸 **독자는 누구이고 지금 무엇에 막혀 있나** (reader_problem)
     — 선정 1순위 축이다. 어휘 정본은 \`config/reader-problems.json\` 이다.
       그 파일을 열어서 코드를 고르고, 맞는 게 없으면 억지로 끼워 맞추지 말고
       조사 노트에 "이 어휘에 없다"고 적어라. 어휘는 갈아끼우는 물건이다.
     ${READER_PROBLEMS.join(' / ')}

  2. 그 독자가 **내일** 할 수 있는 최소 행동 1개는 무엇인가 (transfer_note)
     — "포지셔닝을 바꿨다"는 행동이 아니다. 내일 아침에 시작해서 하루 안에
       끝낼 수 있는 크기여야 한다. 못 줄이면 그 무브는 아직 안 풀린 것이다.

  3. 옮기려면 뭐가 있어야 하나 (preconditions)
     — 자본·인력·기존 고객·채널·재고·규제 허가. 없으면 비워 두되, 비운 것은
       "전제 없음"이 아니라 **"안 적었다"**로 읽힌다. 확인했으면 확인했다고 적어라.

  3.5. **사고의 흐름 1건 이상** — 어떤 관찰에서 어떤 추론으로 그 결정에 갔나.
     ★ 당사자 1인칭 서술(창업자 인터뷰·블로그·팟캐스트·실적발표 콜)을 **최소 1건**
       직접 열어 거기서 꺼낸다. 공시·언론만으로는 결정의 이유가 안 나온다 —
       2026-09-15 재검수에서 적립 33건 중 사고의 흐름이 온전한 건 2건뿐이었다.
       못 찾았으면 조사 노트에 "1인칭 출처 확인 불가"라고 적는다. 2번(transfer_note)과
       이 항목이 각 1건 이상 없으면 조사는 끝난 게 아니다(content/guides/인사이트-추출-기준.md §2).

  4. 그래서 무엇을 바꿨나 (무브: lever + claim). 레버는:
     ${LEVER.join(', ')}
     — 병목은 (${BOTTLENECK.join(' / ')}) 중 하나로 적는다. 매칭은 업종이 아니라
       병목으로 건다.

  5. 수치·출처. metric_name·before·after·unit 을 전부, 그리고 그 수치의 URL.
     자기보고인지 아닌지까지. 규칙 전문은 \`docs/evidence-rules.md\` 다.

  6. 지금도 살아 있나? 확인 못 했으면 outcome_status='unknown' 으로 둔다.
     ★ 확인 실패를 'active' 로 적지 마라 (§7.1).

■ 근거 규칙 요약 6줄 — **전문은 \`docs/evidence-rules.md\`**
  1. 출처는 4축이 서로 **독립**이다: source_tier / is_self_reported /
     is_estimate / is_regulatory_filing. 창업자 인터뷰 = primary + 자기보고.
  2. 상장사·공시 대상이면 **공시부터** 찾아라 (SEC EDGAR, DART). 3차 블로그로
     조사하면 틀린 숫자를 쌓는다 — 듀오링고에서 실제로 그럴 뻔했다.
  3. 추정치("Sacra 추정", "업계 추산", "~로 알려졌다")는 실측이 아니다.
     반드시 is_estimate=true 로 표시한다.
  4. **\`observation_key\` 를 채운다.** 독립은 도메인 수가 아니라 원 관측 수로
     센다. 같은 보도자료를 받아쓴 기사 5개는 출처 1개다.
  5. published_at 은 원문 게시일이다. 모르면 비우되 **비우기 전에 한 번은 찾아봐라.**
  6. snippet 은 ${SNIPPET_MAX}자 이하. 원문 전문 복사 금지.

■ 검색어 예시
  "${brand}" growth / "${brand}" 매출 성장 / "${brand}" case study
  "${brand}" 리브랜딩 OR 가격정책 OR 전환율
  "${brand}" 창업자 인터뷰   ← primary 이지만 is_self_reported=true 다
  "${brand}" founder podcast / "${brand}" earnings call transcript / 창업자 이름 + blog
                             ← 3.5번(사고의 흐름)을 채우는 1인칭 출처. 최소 1건은 열어라

■ 수치가 없으면
  수치 없는 무브도 적어라. 등급 D 로 저장되고 PMF 스코어링에서만 빠진다.
  ★ 없는 수치를 지어내면 그게 이 파이프라인을 통째로 무효로 만든다.
    근거 0건 + 수치 있음 = validate 에서 error 로 막힌다.
  ⛔ 그리고 등급 D 무브로 쓴 초안 본문에 숫자가 들어가면 발행 게이트 CG-2 가
    스테이징을 막는다(exit 4). D 는 "수치가 없는 무브"라서, 그 글의 숫자는
    우리 근거에서 나온 게 아니기 때문이다.

■ 실패·부정 사례
  outcome_direction='negative' 도 환영한다. 다만 발행은 등급 A 일 때만이다
  (실명 브랜드에 대한 부정 서술이라 근거가 약하면 사내 참고용으로만 둔다).
  ★ 생존 편향 방어는 독자 축에서도 그대로다. 웹서치는 성공 쪽으로 쏠리고,
    막힌 독자에게 정작 필요한 건 "그때 뭘 하면 안 됐나"인 경우가 많다.
    실패 사례를 맡았으면 억지로 교훈을 만들어 positive 로 돌리지 마라.

■ 산출
  node scripts/case-research.mjs scaffold --slug <slug> --brand "${brand}"
  로 만든 JSON 을 채운다. 어휘는 스키마 CHECK 와 같아야 한다:
    reader_problem     config/reader-problems.json (파일이 정본)
    business_model     ${BUSINESS_MODEL.join(' / ')}
    buyer_type         ${BUYER_TYPE.join(' / ')}
    purchase_frequency ${PURCHASE_FREQUENCY.join(' / ')}
    price_band         ${PRICE_BAND.join(' / ')}
    outcome_status     ${OUTCOME_STATUS.join(' / ')}
    outcome_direction  ${OUTCOME_DIRECTION.join(' / ')}
    source_tier        ${SOURCE_TIER.join(' / ')}   ← 규칙 전문 docs/evidence-rules.md
  채운 뒤:
  node scripts/case-research.mjs validate --slug <slug>
════════════════════════════════════════════════════════════
`
}

function brief() {
  console.log(briefText(opt('brand') ?? '<브랜드>', opt('market')))
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
    // ★ 선정 1순위 축. 어휘는 config/reader-problems.json 이 정본이다.
    reader_problem: null,
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
        // 독자가 **내일** 할 수 있는 최소 행동 1개. 이게 이 파이프라인의 산출물이다.
        transfer_note: null,
        // 옮기려면 뭐가 있어야 하나. null 은 미기재이지 "전제 없음"이 아니다(§7.1).
        preconditions: null,
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

// 셀프테스트가 briefText 를 import 할 수 있어야 한다. import 만으로 CLI 가
// 돌면 그 순간 process.exit(2) 로 죽는다.
function isMain() {
  if (!process.argv[1]) return false
  try { return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)) }
  catch { return false }
}

if (isMain()) {
  switch (cmd) {
    case 'brief': brief(); break
    case 'scaffold': scaffold(); break
    case 'validate': validate(); break
    default:
      console.error('명령: brief | scaffold | validate')
      console.error('예:  node scripts/case-research.mjs validate --all')
      process.exit(2)
  }
}
