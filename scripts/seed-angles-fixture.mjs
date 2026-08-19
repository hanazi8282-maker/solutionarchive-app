// 앵글 결과 화면(/analyze/[id]/angles) 시각 검증용 픽스처 시드.
//
// 실데이터에는 output_type 5종 × verdict 3종을 한 프로젝트에서 다 덮는 조합이
// 존재하지 않는다(가장 다양한 517bd917 조차 output_type 2종 / verdict 2종).
// 그래서 화면의 모든 분기를 한 번에 보려면 이 픽스처가 필요하다.
//
// 실행:  node --env-file=.env.local scripts/seed-angles-fixture.mjs
// 삭제:  node --env-file=.env.local scripts/seed-angles-fixture.mjs --delete
//
// LLM 을 호출하지 않는다(비용 0원). 행을 직접 INSERT 할 뿐이다.
// competitor_url 이 MARKER 인 프로젝트만 건드리므로 실데이터와 섞이지 않는다.

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_BASE || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  console.error('node --env-file=.env.local scripts/seed-angles-fixture.mjs')
  process.exit(1)
}

const MARKER = 'https://fixture.local/angles-ui-smoke'

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

async function removeFixture() {
  const existing = await rest(`analysis_projects?competitor_url=eq.${encodeURIComponent(MARKER)}&select=id`)
  for (const p of existing) {
    // analysis_angles / analysis_aspects 는 project_id ON DELETE CASCADE 라
    // 프로젝트 한 건만 지우면 자식 행이 같이 정리된다.
    await rest(`analysis_projects?id=eq.${p.id}`, { method: 'DELETE' })
    console.log(`삭제: ${p.id}`)
  }
  return existing.length
}

// ── 속성: 4사분면을 모두 포함한다. OVER_INVESTED/IGNORE 는 화면에서 숨겨져야 한다. ──
const ASPECTS = [
  { key: 'durability', name: '지속력',       quadrant: 'DIFFERENTIATOR', importance: 9, satisfaction: 3, persona_role: 'BUYER',      pain_timing: 'PRE_PURCHASE',  attribution: 'PRODUCT_FAULT', aspect_layer: 'OUTCOME' },
  { key: 'color',      name: '발색',         quadrant: 'DIFFERENTIATOR', importance: 8, satisfaction: 4, persona_role: 'USER',       pain_timing: 'PRE_PURCHASE',  attribution: 'PRODUCT_FAULT', aspect_layer: 'PRODUCT' },
  { key: 'cleaning',   name: '세척 난이도',   quadrant: 'DIFFERENTIATOR', importance: 7, satisfaction: 2, persona_role: 'USER',       pain_timing: 'POST_PURCHASE', attribution: 'USER_FAULT',    aspect_layer: 'PROCESS' },
  { key: 'scent',      name: '향',           quadrant: 'DIFFERENTIATOR', importance: 6, satisfaction: 5, persona_role: 'INFLUENCER', pain_timing: 'PRE_PURCHASE',  attribution: 'ENVIRONMENT',   aspect_layer: 'PRODUCT' },
  { key: 'shipping',   name: '배송 속도',     quadrant: 'TABLE_STAKES',   importance: 8, satisfaction: 8, persona_role: 'BUYER',      pain_timing: 'PRE_PURCHASE',  attribution: 'ENVIRONMENT',   aspect_layer: 'PROCESS' },
  { key: 'authentic',  name: '정품 여부',     quadrant: 'TABLE_STAKES',   importance: 9, satisfaction: 9, persona_role: 'BUYER',      pain_timing: 'PRE_PURCHASE',  attribution: 'ENVIRONMENT',   aspect_layer: 'PROCESS' },
  { key: 'package',    name: '패키지 고급감', quadrant: 'OVER_INVESTED',  importance: 3, satisfaction: 8, persona_role: 'BUYER',      pain_timing: 'PRE_PURCHASE',  attribution: 'PRODUCT_FAULT', aspect_layer: 'PRODUCT' },
  { key: 'freebie',    name: '사은품',       quadrant: 'IGNORE',         importance: 2, satisfaction: 2, persona_role: 'BUYER',      pain_timing: 'PRE_PURCHASE',  attribution: 'ENVIRONMENT',   aspect_layer: 'PROCESS' },
]

// ── 앵글: output_type 5종 × verdict 3종을 전부 덮고, 재작성/미재작성도 섞는다. ──
const ANGLES = [
  {
    aspectKey: 'durability', angle_type: 'MECHANISM', output_type: 'COPY',
    headline_draft: '3중 코팅층이 마찰을 나눠 받아, 12시간 뒤에도 첫 발색 그대로.',
    substantiation_verdict: 'SUBSTANTIATED',
    substantiation_reason: '리뷰 원문에 12시간 유지 경험이 직접 기술돼 있다.',
    substantiation_evidence: '아침에 바르고 퇴근할 때까지 그대로였어요',
    gate_rewritten: false, headline_original: null,
  },
  {
    aspectKey: 'color', angle_type: 'PAS', output_type: 'COPY',
    headline_draft: '조명 아래서 색이 달라 보여 고민이라면, 실내·실외 발색을 함께 확인하세요.',
    substantiation_verdict: 'UNSUBSTANTIATED',
    substantiation_reason: '"업계 1위 발색력"은 원문에 근거가 없어 비교 표현을 걷어내고 순화했다.',
    substantiation_evidence: null,
    gate_rewritten: true,
    headline_original: '업계 1위 발색력, 어떤 조명에서도 100% 동일한 컬러.',
  },
  {
    aspectKey: 'durability', angle_type: 'ASPIRATION', output_type: 'OFFER',
    headline_draft: '첫 구매 30일 색 유지 체험 — 기대에 못 미치면 전액 환불.',
    substantiation_verdict: 'EXPERIENTIAL',
    substantiation_reason: '성능 수치가 아니라 체험 보장 조건이라 실증 대상이 아니다.',
    substantiation_evidence: null,
    gate_rewritten: true,
    headline_original: '30일 안에 색이 빠지면 100% 환불 — 실패율 0%.',
  },
  {
    aspectKey: 'scent', angle_type: 'SOCIAL_PROOF', output_type: 'STRUCTURE',
    headline_draft: '상세페이지 2블록: 향 관련 리뷰 3건 → 성분표 → 무향 옵션 안내 순으로 배치.',
    substantiation_verdict: 'EXPERIENTIAL',
    substantiation_reason: '구성 지침이라 클레임이 아니다.',
    substantiation_evidence: null,
    gate_rewritten: false, headline_original: null,
  },
  {
    aspectKey: 'cleaning', angle_type: 'PAS', output_type: 'PRODUCT_SPEC',
    headline_draft: '전용 리무버 없이는 세척이 어렵다는 불만 다수. 리무버 동봉 또는 물세척 가능 포뮬러 검토 필요.',
    substantiation_verdict: 'EXPERIENTIAL',
    substantiation_reason: '구매 후 인지되는 불만이라 카피가 아닌 제품 과제로 라우팅됐다.',
    substantiation_evidence: null,
    gate_rewritten: false, headline_original: null,
  },
  {
    aspectKey: null, angle_type: 'COMPARISON', output_type: 'BASELINE_SPEC',
    headline_draft: '기본기 2건(배송 속도·정품 여부)은 카테고리 표준 수준. 상세페이지 하단에 배지 형태로만 표기.',
    substantiation_verdict: 'SUBSTANTIATED',
    substantiation_reason: '원문에 배송·정품 관련 불만이 없어 표준 충족으로 판정.',
    substantiation_evidence: '배송도 빠르고 정품이라 믿고 재구매합니다',
    gate_rewritten: false, headline_original: null,
  },
  {
    aspectKey: 'package', angle_type: 'FEAR_FOMO', output_type: 'COPY',
    headline_draft: '[숨김 검증용] 과잉투자 사분면 앵글 — 이 문구가 화면에 보이면 필터가 깨진 것이다.',
    substantiation_verdict: 'SUBSTANTIATED',
    substantiation_reason: '숨김 처리 검증용 행.',
    substantiation_evidence: '포장이 고급스러워요',
    gate_rewritten: false, headline_original: null,
  },
  {
    aspectKey: 'color', angle_type: 'SELF_SELECTION', output_type: 'COPY',
    headline_draft: '쿨톤이라 색이 겉돈다고 느껴온 분께 맞춘 3가지 셰이드.',
    substantiation_verdict: 'UNSUBSTANTIATED',
    substantiation_reason: '"쿨톤 전용 개발"은 원문에 근거가 없어 대상 지정 표현으로 순화했다.',
    substantiation_evidence: null,
    gate_rewritten: true,
    headline_original: '쿨톤 전용으로 개발된 유일한 셰이드.',
  },
]

async function seed() {
  await removeFixture()

  const [project] = await rest('analysis_projects', {
    method: 'POST',
    body: JSON.stringify({
      competitor_url: MARKER,
      product_elevator_pitch: '[픽스처] 12시간 지속 틴트 — 앵글 화면 시각 검증용 가짜 데이터',
      purpose: 'detail_page',
      seller_own_guess: '지속력이 핵심일 것이다',
      status: 'angled',
      maturity_stage: 3,
      maturity_notes: '[픽스처] 성숙도 판정 더미',
    }),
  })

  const idByKey = {}
  for (const a of ASPECTS) {
    const { key, ...cols } = a
    const [row] = await rest('analysis_aspects', {
      method: 'POST',
      // opportunity_score 는 generated 컬럼이라 INSERT 하지 않는다.
      body: JSON.stringify({ project_id: project.id, human_confirmed: true, ...cols }),
    })
    idByKey[key] = row.id
  }

  const rows = ANGLES.map(({ aspectKey, ...cols }) => ({
    project_id: project.id,
    aspect_id: aspectKey ? idByKey[aspectKey] : null,
    ...cols,
  }))
  const inserted = await rest('analysis_angles', { method: 'POST', body: JSON.stringify(rows) })

  console.log(`프로젝트: ${project.id}`)
  console.log(`속성 ${ASPECTS.length}건 / 앵글 ${inserted.length}건 생성`)
  console.log(`화면: /analyze/${project.id}/angles`)
}

const arg = process.argv[2]
if (arg === '--delete') {
  const n = await removeFixture()
  console.log(n === 0 ? '삭제할 픽스처가 없습니다.' : `픽스처 ${n}건 삭제 완료.`)
} else {
  await seed()
}
