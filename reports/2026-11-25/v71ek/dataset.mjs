// v71ek 동치 검사용 합성 데이터(결정적). 실제 데이터 없음. 경계: 판정/미판정 · 폐기 · 사람 채점 · 제외 소스 · 소비재 ·
// 품질 표시 · 1,000행 넘는 페이지(판정/미판정 둘 다) · 수집 시각 동점·NULL · 중복 본문 · HN 저가치만 남은 프로젝트 · 머리말뿐 ·
// 판정 행 project_id 가 원문과 다른 행 · 판정 대상 0 프로젝트 · 입력 0 프로젝트.

export function rngOf(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

const TEXTS = [
  '배송 빠르고 포장 꼼꼼했어요 만족합니다 재구매 의사 있어요',
  '앱이 너무 느려요 결제 오류가 자꾸 나서 해지하고 싶습니다',
  '기존에 쓰던 것보다 훨씬 낫네요 갈아타길 잘했어요',
  '이거 대신 쓸 만한 앱 있나요 추천 부탁드립니다',
  '대신\u00a0쓸\u3000만한 서비스를 찾고 있어요',
  '다른 앱 추천 좀 해주세요 요즘 광고가 너무 많아요',
  '다른 어플\n추천 받아요',
  '갈아탈 만한 대안 없을까요',
  '대체 어플 찾는 중',
  'I SWITCHED from Foo to Bar last week and the sync is better than before.',
  'Looking for an alternative to Foo, any good alternatives?',
  'Looking for a cheap alternative since pricing went up again this year.',
  'We recommended a replacement to the whole team.',
  'Compared with the old tool this one is fine. We moved our data over.',
  'Nice post, thanks for sharing.',
  'Great product, works well for our small team and the dashboard is clear enough for daily use without training.',
  'better alternatives\u00a0exist',
  '그냥 그래요 보통입니다',
  'ㅋㅋㅋㅋ',
  '👍👍',
  '카지노 사이트 추천 http://spam.example',
  '[SRC: https://example.com/a]\n',
  '[SRC: https://example.com/b]\n쓰다가 옮겨 왔는데 만족해요 Notion 대신',
  '',
]
const SOURCES = ['danawa', 'appstore', 'googleplay', 'youtube', 'kakao_blog', 'hackernews', 'github_issues']

/** 프로세스에 하나 — 두 벌의 데이터가 같아야 한다. 번역 배치의 '오늘 본 행' 경로용. */
const TODAY = new Date().toISOString()

export function buildDataset({ seed = 7, scale = 1 } = {}) {
  const rnd = rngOf(seed)
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)]
  const hex = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('')
  const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`
  const iso = (min) => new Date(Date.UTC(2026, 8, 1) + min * 60_000).toISOString()

  const tables = {
    analysis_projects: [], analysis_inputs: [], review_relevance_verdicts: [], review_targets: [], review_sources: [],
    content_quality_flags: [], consumer_material_tags: [], discovery_candidates: [], agent_runs: [], agent_run_steps: [],
    review_topic_labels: [], relevance_translations: [], relevance_product_backgrounds: [],
  }
  for (const key of SOURCES) tables.review_sources.push({ key, enabled: key !== 'danawa' })

  /** n 원문 · judged 비율 · 원문 생성기 옵션 */
  function project(name, { n, judged = 0, status = 'collecting', attempts = 0, area = '1', bm = 'SAAS', sources = SOURCES, text, labels } = {}) {
    const id = uuid()
    tables.analysis_projects.push({
      id, status, extract_attempts: attempts, product_elevator_pitch: `${name} 제품`, purpose: null, business_model: bm,
      area_code: area, competitor_url: `https://${name.toLowerCase()}.example.com`, created_at: iso(tables.analysis_projects.length), reader_problem: rnd() < 0.5 ? `${name} 문제` : null,
    })
    for (const label of labels ?? []) tables.review_targets.push({ id: uuid(), project_id: id, label, source_key: 'appstore', product_ref: `us:${tables.review_targets.length + 100000}`, status: 'active', total_collected: 3 })
    for (let i = 0; i < Math.round(n * scale); i++) {
      const source = pick(sources)
      const isJudged = rnd() < judged
      const base = text ? text(i, isJudged) : pick(TEXTS)
      const raw = rnd() < 0.5 && base.length > 10 && !base.startsWith('[') ? `${base} #${Math.floor(rnd() * 40)}` : base
      const purged = rnd() < 0.03
      const input = {
        id: uuid(), project_id: id, purged_at: purged ? iso(9000) : null,
        raw_text: purged && rnd() < 0.5 ? null : raw,
        created_at: iso(Math.floor(rnd() * 200)), collected_at: rnd() < 0.4 ? null : iso(Math.floor(rnd() * 60)),
        source_key: rnd() < 0.02 ? null : source, rating: rnd() < 0.3 ? null : 1 + Math.floor(rnd() * 5),
      }
      tables.analysis_inputs.push(input)
      if (isJudged) verdict(input.id, id, i)
      if (rnd() < 0.03) tables.content_quality_flags.push({ id: tables.content_quality_flags.length + 1, input_id: input.id, flag: pick(['too_short', 'near_dup', 'promo', 'other']), rule_ver: pick(['cq-v1', 'cq-v2']) })
      if (area === '2' && rnd() < 0.03) tables.consumer_material_tags.push({ input_id: input.id, project_id: id })
    }
    return id
  }

  function verdict(input_id, project_id, i) {
    const v = pick(['relevant', 'relevant', 'irrelevant', 'unknown'])
    const second = rnd() < 0.6 ? (rnd() < 0.75 ? v : pick(['relevant', 'irrelevant', 'unknown'])) : null
    const human = rnd() < 0.06 ? pick(['relevant', 'irrelevant', 'unknown']) : null
    tables.review_relevance_verdicts.push({
      input_id, project_id, verdict: v, human_verdict: human,
      model: pick(['claude-sonnet-5-5', 'claude-sonnet-5-5', 'gemini-3.5-flash', 'claude-cli', '']),
      judged_at: iso(Math.floor(rnd() * 100000)), human_graded_at: human ? (rnd() < 0.3 ? TODAY : iso(Math.floor(rnd() * 5000))) : null,
      reason: '합성 사유 문장입니다. 이 칸은 길이가 있어 전체 읽기의 전송량을 키운다.',
      second_verdict: second, second_model: second ? 'gemini-3.5-flash' : null, second_judged_at: second ? iso(100001 + i) : null,
      product_informative: rnd() < 0.2 ? null : rnd() < 0.6, second_product_informative: second ? rnd() < 0.6 : null, human_product_informative: human ? rnd() < 0.5 : null,
      auto_approved_at: !human && rnd() < 0.2 ? iso(100500) : null, auto_approval_rule: null, prompt_version: 'rr-v2.2',
      impact: null, frequency: null, community_signal: null, wtp_mentioned: null,
    })
  }

  project('Big', { n: 2600, judged: 0.55, area: '1' })
  project('Wide', { n: 2500, judged: 0.5, area: '2', bm: 'D2C' })
  project('AllJudged', { n: 300, judged: 1, area: '3' })
  project('NoneJudged', { n: 150, judged: 0, area: '4', status: 'extracted' })
  project('Empty', { n: 0 })
  // HN 저가치만 남은 프로젝트: 판정된 것은 아무 글, 미판정은 키워드 없는 짧은 HN 글.
  project('HnResidue', { n: 400, judged: 0.85, area: '5', sources: ['hackernews'], text: (i, j) => (j ? TEXTS[i % TEXTS.length] : `Nice work ${i}`) })
  project('HeaderResidue', { n: 200, judged: 0.8, area: '5', sources: ['appstore'], text: (i, j) => (j ? TEXTS[i % TEXTS.length] : '[SRC: https://example.com/x]\n') })
  project('Consumer', { n: 200, judged: 0.3, area: 'out-consumer', sources: ['youtube', 'danawa'] })
  project('Founder', { n: 250, judged: 0.5, area: 'out-founder' })
  project('OddCode', { n: 80, judged: 0.5, area: ' OUT-x' })
  project('Unmapped', { n: 220, judged: 0.4, area: null, labels: ['2:alpha', '2:us|alpha'] })
  project('Mixed', { n: 90, judged: 0.4, area: null, labels: ['1:beta', '3:beta'] })
  project('Retry', { n: 60, judged: 0.5, status: 'failed', attempts: 1, area: 'design' })
  project('Dead', { n: 60, judged: 0.5, status: 'failed', attempts: 2, area: 'hold' })
  project('Done', { n: 120, judged: 0.7, status: 'done', area: '1' })
  for (let k = 0; k < 6; k++) project(`Small${k}`, { n: 30 + k * 17, judged: k / 6, area: String(1 + (k % 5)), bm: k % 2 ? 'SAAS' : null })

  // 판정 행 project_id 가 원문의 프로젝트와 다른 행(있다면) — 예전 정의(그 project_id 의 판정만 done)가 유지되는지.
  const [p0, p1] = tables.analysis_projects
  const moved = tables.review_relevance_verdicts.filter((v) => v.project_id === p0.id).slice(0, 5)
  for (const v of moved) v.project_id = p1.id

  for (let i = 0; i < 40; i++) tables.discovery_candidates.push({ id: uuid(), name: `Cand${i}`, homepage_url: null, verdict: i % 3 ? 'pending' : 'rejected', verdict_reason: null, origin: 'mention', mention_count: null, probe_source_key: null, probe_ref: null, human_review: 'pending' })
  return tables
}
