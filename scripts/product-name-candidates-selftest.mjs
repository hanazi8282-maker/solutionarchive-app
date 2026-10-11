#!/usr/bin/env node
// product-name-candidates.mjs 셀프테스트 — DB·LLM 없이. 부품(정규화·추출·대조) + 경계(가짜 DB 포트 → main → 표·대장 파일) + 쓰기 SQL 정적 검사.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { normKey, splitBilingual, domainName, extractMentions, buildRegistry, loadConfig, main, stripHeader, idLike, corpusStats, renderMarkdown, buildCandidates, groupByArea, renderApprovalSheet, parseApprovalSheet, readAnswer, sheetStats, approvalMode, isCdnHost, ledgerOf, parseReleaseDates, releaseOf } from './product-name-candidates.mjs'

let pass = 0
let fail = 0
const t = (name, ok) => {
  if (ok) pass++
  else {
    fail++
    console.error(`✗ ${name}`)
  }
}
const cfg = loadConfig()

// ── 정규화 ──
t('normKey: 소문자·공백/하이픈/점 제거·TLD', normKey('Otter.ai') === 'otter' && normKey('Help Scout') === 'helpscout' && normKey('judge-me') === 'judgeme')
t('normKey: co.kr', normKey('foo.co.kr') === 'foo')
t('splitBilingual: 한영 병기', ['노션', 'Notion'].every((x) => splitBilingual('노션(Notion)').includes(x)))
t('splitBilingual: 괄호 안 영문', splitBilingual('People.ai (현 Backstory)').includes('Backstory'))
t('domainName: www 제거·서브도메인', domainName('https://www.notion.so/x') === 'notion' && domainName('app.flowbase.io') === 'flowbase')
t('domainName: co.kr', domainName('https://shop.foo.co.kr/a') === 'foo')
t('domainName: 못 읽으면 null', domainName('') === null && domainName('localhost') === null)

// ── 추출 ──
const keys = (s) => extractMentions(s, cfg).mentions.map((m) => m.key)
t('추출: 문장 첫 대문자는 안 잡는다', !keys('Glorp is slow. Brivio too.').includes('glorp') && !keys('Glorp is slow. Brivio too.').includes('brivio'))
t('추출: 문장 중간 대문자는 잡는다', keys('we moved to Brivio today').includes('brivio'))
t('추출: 2자 약어(AI·UI) 제외 · 3자 약어 API 는 common_words 담당', !keys('we use the UI and AI daily').some((k) => k === 'ui' || k === 'ai') && cfg.common_words.includes('api'))
t('추출: 앱스토어 링크 → appstore:id 키', keys('see https://apps.apple.com/kr/app/zentrova/id1234567 now').includes('appstore:id1234567'))
t('추출: 플레이 링크 → googleplay:pkg 키', keys('get play.google.com/store/apps/details?id=com.Kito.app ok').includes('googleplay:com.kito.app'))
t('추출: 도메인 → 이름', keys('pricing at https://flowbase.io/pricing is steep').includes('flowbase'))
const ko = extractMentions('에버노트 대신 모아노트 쓰는 중', cfg).mentions
t('추출: "X 대신 Y" 둘 다 비교 언급', ['에버노트', '모아노트'].every((k) => ko.some((m) => m.key === k && m.compare)))
t('추출: 조사 떼기("모아노트로")', keys('요즘 에버노트 말고 모아노트로 정리').includes('모아노트'))
t('추출: "X에서 Y로 갈아탔" ', keys('에버노트에서 모아노트로 갈아탔어요').includes('모아노트'))
t('추출: alternative to X', extractMentions('looking for an alternative to Quillora here', cfg).mentions.some((m) => m.key === 'quillora' && m.compare))
t('추출: 따옴표·백틱 이름', keys('we tried `Plinko` and "Snorbit" today').includes('plinko') && keys('we tried `Plinko` and "Snorbit" today').includes('snorbit'))
const bi = extractMentions('요즘 노션(Notion) 씁니다', cfg)
t('추출: 한영 병기 → 별칭쌍', bi.aliases.some(([a, b]) => a === '노션' && b === 'notion'))
t('추출: 같은 위치 겹침은 한 번만', extractMentions('see Otter.ai now', cfg).mentions.filter((m) => m.key === 'otter').length === 1)
t('추출: "님" 접미 → 사람 표지', extractMentions('민수님 대신 영희님 의견', cfg).mentions.some((m) => m.person))

t('머리 표식 제거', !stripHeader('[YouTube 댓글 · O9GBX6mbn7U] Love it').includes('O9GBX6mbn7U') && stripHeader('[Product Hunt 댓글 · foo-bar] hi').trim() === 'hi')
t('idLike: 영상 ID 꼴 · 숫자 포함', idLike('O9GBX6mbn7U') && idLike('KsmCwnvWixA') && idLike('H1CD75ZKWTg'))
t('idLike: 중간 대문자 제품명은 아님', !idLike('DocuSign') && !idLike('SurveyMonkey') && !idLike('Evernote') && !idLike('LUX'))
const cs = corpusStats(['I love it. Love wins. we Love this'])
t('corpusStats: 문장 첫 단어는 mid 아님 · 소문자 수', cs.get('love').total === 3 && cs.get('love').lower === 1 && cs.get('love').mid === 2 && cs.get('love').midCap === 1)
// v52: 대문자 2~5자 약어는 기본 기각(acronym), 앱 링크·도메인 신호가 있으면 예외. (pnc-v1 의 "LUX 는 남긴다"를 뒤집는다 — 도메인이 있어야 남는다.)
t('약어: 링크·도메인 없는 LUX 는 acronym 기각 · SEO 는 common_words 로 행 없음', (() => {
  const r = buildCandidates({ inputs: [...Array(5)].map((_, i) => ({ id: `l${i}`, source_key: 'appstore', raw_text: 'we bought LUX and SEO tools' })), registry: new Map(), cfg }).rows
  return r.find((x) => x.key === 'lux')?.reason === 'acronym' && !r.some((x) => x.key === 'seo')
})())
t('약어 예외: 도메인 신호가 있으면 LUX 채택', (() => {
  const r = buildCandidates({ inputs: [...Array(5)].map((_, i) => ({ id: `d${i}`, source_key: 'appstore', raw_text: 'we bought LUX at lux.io today' })), registry: new Map(), cfg }).rows
  return r.find((x) => x.key === 'lux')?.status === 'adopt' && r.find((x) => x.key === 'lux').refs.includes('lux.io')
})())
t('약어 예외: 목록 약어(LDAC)도 도메인 있으면 통과', (() => {
  const r = buildCandidates({ inputs: [...Array(5)].map((_, i) => ({ id: `x${i}`, source_key: 'appstore', raw_text: 'we use LDAC daily, see ldac.io' })), registry: new Map(), cfg }).rows
  return r.find((x) => x.key === 'ldac')?.status === 'adopt'
})())
t('추출: 대문자 묶음 → 한 이름', keys('we sell on Lemon Squeezy now').includes('lemonsqueezy'))
t('추출: 문장 첫 묶음은 첫 단어만 뗀다', keys('Love Zentrova so much').includes('zentrova') && !keys('Love Zentrova so much').includes('lovezentrova'))
t('추출: 이모지·글머리 뒤도 문장 첫머리', !keys('🔥 Love this').includes('love') && !keys('- Amazing app').includes('amazing'))

// ── 대조 사전 ──
const reg = buildRegistry({
  dictionary: [{ slug: 'otter-ai', name: 'Otter.ai', name_ko: '오터', official_url: 'https://otter.ai/', sources: { appstore: { id: '1276437113' }, googleplay: { id: 'com.aisense.otter' } } }],
  projects: [{ product_elevator_pitch: 'Evernote (에버노트) — 노트 앱', competitor_url: 'https://evernote.com' }],
  targets: [{ source_key: 'appstore', product_ref: 'kr:999', label: '3:foo-ai' }, { source_key: 'googleplay', product_ref: 'kr:ko:com.bar.app', label: null }],
  discovery: [{ name: 'Notion AI', homepage_url: null }],
})
t('사전: 이름·한글·slug·도메인·앱ID', ['otter', '오터', 'otterai', 'appstore:id1276437113', 'googleplay:com.aisense.otter'].every((k) => reg.has(k)))
t('사전: 소개문 한영 병기', reg.has('evernote') && reg.has('에버노트'))
t('사전: 타깃 product_ref·label', reg.has('appstore:id999') && reg.has('googleplay:com.bar.app') && reg.has('foo'))
t('사전: "X AI" → X 도 등록', reg.has('notionai') && reg.has('notion'))

// ── 경계: 가짜 DB 포트 → main → 표·대장 ──
let n = 0
const inp = (project_id, source_key, raw_text, extra = {}) => ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, project_id, source_key, raw_text, purged_at: null, ...extra })
const times = (k, f) => [...Array(k)].map((_, i) => f(i))
const P1 = 'p1-area3-column'
const P2 = 'p2-area1-label'
const P3 = 'p3-out'
const areaInputs = [
  inp(P1, 'appstore', 'Honestly I moved everything to Zentrova last week and it works.'),
  inp(P1, 'appstore', 'Compared with others, Zentrova syncs faster.'),
  inp(P1, 'appstore', 'Get it here https://apps.apple.com/kr/app/zentrova/id1234567 seriously.'),
  inp(P1, 'googleplay', 'My team uses Zentrova daily now.'),
  inp(P1, 'googleplay', 'We tried Zentrova and loved it.'),
  ...times(5, () => inp(P1, 'appstore', 'Then Vexly crashed again.')),
  ...times(5, () => inp(P1, 'googleplay', 'Download play.google.com/store/apps/details?id=com.kito.app now')),
  inp(P2, 'clien', '에버노트 대신 모아노트 쓰는 중입니다'),
  inp(P2, 'clien', '요즘 에버노트 말고 모아노트로 정리해요'),
  inp(P2, 'okky', '에버노트에서 모아노트로 갈아탔어요'),
  inp(P2, 'okky', '모아노트 vs 에버노트 비교해보니 낫네요'),
  inp(P2, 'clien', 'flowbase.io 써봤는데 별로'),
  inp(P2, 'clien', 'flowbase.io 가격이 올랐네요'),
  // ── 실데이터 오탐 재현(2026-10-12 첫 --run): 형용사·접속어·축약형 조각·영상 ID·"Product Hunt" 조각 ──
  ...times(6, (i) => inp(P1, 'youtube', `[YouTube 댓글 · ${['O9GBX6mbn7U', 'KsmCwnvWixA', 'IFNXZlKYS80'][i % 3]}] 🔥 Love this app`)),
  ...times(5, () => inp(P1, 'youtube', 'check clip KsmCwnvWixA again')),
  ...times(6, () => inp(P1, 'appstore', 'Honestly Love it. I love the sync and love the price.')),
  ...times(5, () => inp(P1, 'appstore', 'Wow!! Amazing app\nExcellent support. What a deal')),
  ...times(5, () => inp(P1, 'googleplay', 'It just Doesn\'t work and Don\'t bother')),
  ...times(5, () => inp(P1, 'producthunt', '[Product Hunt 댓글 · zentrova-2] found it on Product Hunt today')),
  ...times(5, () => inp(P1, 'appstore', 'I moved from paper to DocuSign for contracts')),
  ...times(4, () => inp(P1, 'appstore', 'Zorbix rocks. the Zorbix sync')),
  inp(P2, 'clien', 'Zorbix rocks. the Zorbix sync'),
  ...times(2, () => inp(P2, 'clien', 'the zorbix thing')),
]
const relevantInputs = [
  ...times(5, () => inp(P3, 'hackernews', 'I pay for Otter.ai and it is fine.')),
  ...times(5, () => inp(P3, 'hackernews', 'We export to Excel every day.')),
  ...times(5, () => inp(P3, 'devto', 'Our backend runs on Postgres today.')),
  ...times(5, () => inp(P3, 'hackernews', 'I asked Paul about pricing.')),
  ...times(5, () => inp(P3, 'hackernews', 'We switched our stack to Brivio recently.')),
  ...times(5, () => inp(P3, 'producthunt', 'Glorp is slow. It crashes.')),
  ...times(3, () => inp(P3, 'hackernews', 'Pricing at https://flowbase.io/pricing is steep')),
  inp(P3, 'hackernews', 'Try the new Quillora maybe.'),
  inp(P3, 'clien', '요즘은 Quillora 써요'),
  ...times(2, () => inp(P3, 'hackernews', 'we looked at Nimbo once')),
  inp(P3, 'hackernews', null, { purged_at: '2026-10-01T00:00:00Z' }),
]
const projectsPresent = [
  { id: P1, product_elevator_pitch: '마케팅 도구 묶음', competitor_url: null, area_code: '3', area_basis: 'label' },
  { id: P2, product_elevator_pitch: '노트 도구', competitor_url: null, area_code: null, area_basis: null },
  { id: P3, product_elevator_pitch: '창업가 불만', competitor_url: null, area_code: 'out-founder', area_basis: 'source' },
  { id: 'p4', product_elevator_pitch: 'Evernote (에버노트) — 노트 앱', competitor_url: null, area_code: null, area_basis: null },
]
const targets = [{ project_id: P2, source_key: 'kakao_blog', label: '1:moa-x', product_ref: 'q:노트앱' }]
const calls = { byProjects: null }
const fakePort = (areaColumn = 'present') => ({
  loadRelevant: async () => relevantInputs.map((i) => ({ input_id: i.id, project_id: i.project_id })),
  loadProjects: async () => ({
    areaColumn,
    rows: areaColumn === 'present' ? projectsPresent : projectsPresent.map(({ area_code, area_basis, ...r }) => r),
  }),
  loadTargets: async () => targets,
  loadDiscovery: async () => [],
  loadInputsByIds: async (ids) => relevantInputs.filter((i) => ids.includes(i.id)),
  loadInputsByProjects: async (pids) => {
    calls.byProjects = pids
    return areaInputs.filter((i) => pids.includes(i.project_id))
  },
})
const fileRegistry = { dictionary: [{ slug: 'otter-ai', name: 'Otter.ai', name_ko: '오터', official_url: 'https://otter.ai/', sources: {} }], areaMapSlugs: [] }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pnc-'))
fs.mkdirSync(path.join(tmp, '2026-10-01'))
fs.writeFileSync(
  path.join(tmp, '2026-10-01', 'rejected-candidates.json'),
  JSON.stringify({ entries: [{ key: 'vexly', status: 'rejected', reason: 'human:not a product' }, { key: 'brivio', status: 'unverifiable', reason: 'x' }] }),
)
const quiet = () => {}
const opts = (areaColumn) => ({ port: fakePort(areaColumn), reportsDir: tmp, fileRegistry, cfg, log: quiet, now: new Date('2026-10-12T03:00:00Z') })

// dry: 파일 안 씀
const dry = await main([], opts())
t('dry: 파일 안 씀', dry.files === null && !fs.existsSync(path.join(tmp, '2026-10-12')))
t('영역 프로젝트만 프로젝트 단위로 읽는다(열 3 + 라벨 1, out·hold 제외)', JSON.stringify([...calls.byProjects].sort()) === JSON.stringify([P1, P2].sort()))

const res = await main(['--run'], opts())
const row = (k) => res.rows.find((r) => r.key === k)
t('앱 ID 가 정규화 키(이름 언급이 링크 별칭으로 합쳐짐)', row('appstore:id1234567')?.status === 'adopt' && row('appstore:id1234567').name === 'Zentrova' && !row('zentrova'))
t('앱 리뷰 소스: 리뷰 5건 → 채택', row('appstore:id1234567')?.posts === 5)
t('플레이 링크 키 채택', row('googleplay:com.kito.app')?.status === 'adopt')
t('한국 커뮤니티: 4글·2소스·언급 4 → 채택(해커뉴스 문턱 안 씀)', row('모아노트')?.status === 'adopt' && row('모아노트').posts === 4)
t('비교대상만 여부', row('모아노트')?.compareOnly === true && row('appstore:id1234567')?.compareOnly === false)
t('해커뉴스 5글·언급 5 → 확인불가(community_en 10 미달)', row('brivio')?.status === 'hold' && /below_source_threshold\(community_en:mentions=5\/10\)/.test(row('brivio').reason))
t('지난 대장 unverifiable 은 다시 잰다', !/previously/.test(row('brivio')?.reason ?? ''))
t('지난 대장 rejected → 재제안 안 함', row('vexly')?.status === 'rejected' && /previously_rejected\(2026-10-01:human:not a product\)/.test(row('vexly').reason))
t('이미 등록(사전·소개문 병기) 제외', !row('otter') && !row('에버노트') && res.counts.registered >= 2)
t('불용어 기각', row('excel')?.status === 'rejected' && row('excel').reason === 'stopword')
t('스택 기각', row('postgres')?.reason === 'stack')
t('사람 이름 기각', row('paul')?.reason === 'person_name')
t('근거 3건 미만 → 확인불가', row('quillora')?.status === 'hold' && /insufficient_evidence\(2<3\)/.test(row('quillora').reason))
t('문턱 미달은 표에 없다', !row('nimbo') && res.counts.below >= 1)
t('문장 첫 단어만 나온 이름은 없다', !row('glorp'))
t('도메인 후보: 글 5·소스 2', row('flowbase')?.posts === 5 && row('flowbase').sources === 2)
t('영역 추정: 열(3)·라벨(1)', row('appstore:id1234567')?.area === '3' && /3\|column:label×5/.test(row('appstore:id1234567').areaBasis) && row('모아노트')?.area === '1')
t('근거 3건·120자·input_id·소스', row('appstore:id1234567').evidence.length === 3 && row('appstore:id1234567').evidence.every((e) => e.input_id && e.source && e.quote.length <= 120))
t('근거는 소스를 섞어 고른다', new Set(row('appstore:id1234567').evidence.map((e) => e.source)).size === 2)
t('폐기 원문 제외(입력 수)', res.counts.inputs === areaInputs.length + relevantInputs.length - 1)

// 오탐 재현 → 채택 불가
const adopted = new Set(res.rows.filter((r) => r.status === 'adopt').map((r) => r.key))
t('오탐: Love·Hunt·Amazing·What·Excellent·Doesn·Don 채택 안 됨', ['love', 'hunt', 'amazing', 'what', 'excellent', 'doesn', 'don', 'wow'].every((k) => !adopted.has(k)))
t('오탐: 영상 ID 는 행 자체가 없다(머리 표식 제거)', !res.rows.some((r) => /o9gbx6mbn7u|ifnxzlkys80|zentrova2/.test(r.key)))
t('오탐: Love 는 common_word 로 기각', /^common_word/.test(row('love')?.reason ?? ''))
t('오탐: 문장 첫 단어(줄바꿈·!! 뒤 포함)는 안 잡는다', !row('amazing') && !row('excellent') && !row('what'))
t('오탐: 축약형 조각 기각', row('doesn')?.reason === 'contraction' && row('don')?.reason === 'contraction')
t('오탐: "Product Hunt" 는 한 이름(불용어)으로, Hunt 조각 없음', !row('hunt') && row('producthunt')?.reason === 'stopword')
t('진짜: DocuSign 채택(중간 대문자 신호)', row('docusign')?.status === 'adopt' && row('docusign').signals.includes('midcap'))
t('신호 없음 → 확인불가(no_product_signal)', /^no_product_signal/.test(row('zorbix')?.reason ?? '') && row('zorbix').status === 'hold')
const zi = res.rows.findIndex((r) => r.key === 'appstore:id1234567')
t('정렬: 신호 2종(Zentrova) 이 1종(DocuSign) 보다 위', zi >= 0 && zi < res.rows.findIndex((r) => r.key === 'docusign'))
// v53: 대안 맥락("대신·말고·갈아탔") 가중 +1 → 모아노트(신호 1 + 대안 1 = 2)가 Zentrova(신호 2)와 동점, 비교 언급 수로 위.
t('정렬 v53: 대안 맥락 가중으로 모아노트(1종+대안) = Zentrova(2종) → 비교 언급 많은 모아노트 위', row('모아노트')?.score === 2 && row('appstore:id1234567')?.score === 2 && res.rows.findIndex((r) => r.key === '모아노트') < zi)
t('오탐: 본문 속 영상 ID → id_like 기각', row('ksmcwnvwixa')?.reason === 'id_like')
t('정렬: 같은 신호 수면 비교 언급 많은 쪽(모아노트) 위', res.rows.findIndex((r) => r.key === '모아노트') < res.rows.findIndex((r) => r.key === 'docusign'))

const md = fs.readFileSync(res.files.md, 'utf8')
t('표 상단: 사유별 건수 요약', /기각·확인불가 사유별: .*stopword \d+/.test(md) && /contraction \d+/.test(md))
t('나머지 파일 생성', fs.existsSync(res.files.rest) && res.files.rest.endsWith('product-name-candidates-rest.md'))
const rest = fs.readFileSync(res.files.rest, 'utf8')
const rowLines = (s) => s.split('\n').filter((l) => /^\| (채택|확인불가|기각) \|/.test(l)).length
const meta1 = { date: 'x', ruleVer: 'v', counts: res.counts, cfg, areaColumn: 'present', perArea: 1 }
const adoptN = res.rows.filter((r) => r.status === 'adopt').length
const areasN = new Set(res.rows.filter((r) => r.status === 'adopt').map((r) => r.area)).size
t('영역 표: 영역당 상위 N(--per-area 1) · 나머지 파일이 남은 전부', rowLines(renderMarkdown(res.rows, meta1, 'top')) === areasN && rowLines(renderMarkdown(res.rows, meta1, 'rest')) === res.rows.length - areasN && adoptN > areasN)
const ledger = JSON.parse(fs.readFileSync(res.files.ledger, 'utf8'))
t('파일 위치 reports/<KST 날짜>/', res.files.md === path.join(tmp, '2026-10-12', 'product-name-candidates.md') && res.files.ledger === path.join(tmp, '2026-10-12', 'rejected-candidates.json'))
t('표 헤더 열', md.includes('| 상태 | 후보명 | 정규화키 | 언급 글 수 | 소스 수 | 제품 신호 | 가중(대안 맥락 · 출시) | 대표 영역(비율 · 근거) | 근거 3건 | 비교대상만 | 기각·확인불가 사유 |'))
t('표: 채택 행(대표 영역 비율)', /\| 채택 \| Zentrova \| `appstore:id1234567` \| 5 \|.*\| 3 100% \(/.test(md) && md.includes('| 채택 | 모아노트 |'))
t('본문은 채택만 · 기각·확인불가는 나머지 파일에 사유와 함께', !/\| (기각|확인불가) \|/.test(md) && /\| 기각 \| Excel \|.*\| stopword \|/.test(rest) && /\| 확인불가 \| Brivio \|/.test(rest))
t('영역별 소제목(areas.json 이름) · 순서 ① → ③ · 채택 없는 영역은 소제목 없음', (() => {
  const i = (s) => md.indexOf(`## ${s}`)
  return i('① 회의·통화 기록') > 0 && i('① 회의·통화 기록') < i('③ 마케팅(직접 도구만)') && i('영역 외-창업가 불만') < 0
})())
t('대표 영역 = 최다 영역 + 비율(flowbase: out-founder 3/5)', row('flowbase')?.area === 'out-founder' && row('flowbase').areaShare === 0.6)
t('표: 행마다 열 11개(파이프 이스케이프)', [md, rest].every((s) => s.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('|---')).every((l) => l.split(/(?<!\\)\|/).length === 13)))
t('대장: 기각·확인불가 전부, 채택 0', ledger.entries.length === res.rows.filter((r) => r.status !== 'adopt').length && !ledger.entries.some((e) => e.key === 'moanote'))
t('대장: 상태 어휘·사유', ledger.entries.find((e) => e.key === 'quillora')?.status === 'unverifiable' && ledger.entries.find((e) => e.key === 'excel')?.reason === 'stopword')

// 대장 재사용: 오늘 대장의 rejected 는 다음 날 previously_rejected 가 된다(재제안 방지 루프)
const next = await main(['--run', '--date=2026-10-13'], opts())
t('다음 실행: 오늘 기각 → previously_rejected', /previously_rejected\(2026-10-12:stopword\)/.test(next.rows.find((r) => r.key === 'excel')?.reason ?? ''))
t('다음 실행: 확인불가는 다시 확인불가(재평가)', next.rows.find((r) => r.key === 'quillora')?.status === 'hold')

// 영역 열 없음(42703) → 라벨 폴백. P1 은 라벨이 없어 영역 프로젝트에서 빠진다(모름을 영역으로 접지 않는다).
calls.byProjects = null
const absent = await main([], opts('absent'))
t('열 없음: 라벨 폴백만', JSON.stringify(calls.byProjects) === JSON.stringify([P2]) && absent.counts.inputs > 0)

// 입력 0건은 실패(§7.1)
const empty = { ...fakePort(), loadRelevant: async () => [], loadInputsByProjects: async () => [] }
t('입력 0건 → 던진다', await main([], { ...opts(), port: empty }).then(() => false, (e) => /입력 글 0건/.test(e.message)))
t('--date 형식 검사', await main(['--date=2026/10/12'], opts()).then(() => false, () => true))

// ── v52: 실데이터 첫 --run(채택 41건) 오탐 → 제외, 진짜 제품은 남는다 ──
const FP_TEXT = [
  'my ADHD makes it hard', 'our MRR grew', 'the APIs are slow', 'other CRMs cost more', 'like NASA said', 'my PKM setup', 'a cheap VPS works',
  'the LDAC codec', 'an RSS feed', 'needs SSO login', 'the MSL thing', 'old KTF phone', 'the STX deal', 'learning Spanish daily', 'the ACADEMY plan',
  'call Tel now', 'heavy Blasting noise', 'say Hi there', 'the Tiger mascot', 'as Katherine Tingley wrote', 'and Maciej said', 'the Auburn Affirmation text',
  'posted on Ask HN', 'saw it on Show HN', 'using Claude Code', 'tried Codex too', 'with Apple Pencil', 'my Apple Watch buzzes', 'as Maria Lopez noted',
].join('. ')
const REAL_TEXT = 'we moved notes to Evernote today. contracts go through DocuSign now. our sales team lives in Hubspot CRM daily. i post on Mastodon instead. my newsletter runs on Substack now'
const v52 = buildCandidates({
  inputs: [...Array(5)].map((_, i) => ({ id: `v${i}`, project_id: 'pa', source_key: 'appstore', raw_text: `${FP_TEXT}. ${REAL_TEXT}` })),
  registry: new Map(),
  cfg,
  projectArea: (id) => (id === 'pa' ? { code: '2', via: 'column', basis: null } : undefined),
}).rows
const vr = (k) => v52.find((r) => r.key === k)
const FP_EXPECT = {
  acronym: ['adhd', 'apis', 'crms', 'nasa', 'pkm', 'vps', 'ldac', 'rss', 'sso', 'msl', 'ktf', 'stx'],
  general_noun: ['spanish', 'academy', 'tel', 'blasting', 'hi', 'tiger'],
  site_ui: ['askhn', 'showhn'],
  tool_not_target: ['claudecode', 'codex'],
  hardware: ['applepencil', 'applewatch'],
  person_name: ['katherinetingley', 'maciej', 'auburnaffirmation', 'marialopez'],
}
for (const [why, ks] of Object.entries(FP_EXPECT)) {
  const bad = ks.filter((k) => vr(k)?.status !== 'rejected' || vr(k).reason !== why)
  t(`v52 오탐 → ${why} 기각 (${bad.map((k) => `${k}=${vr(k)?.reason ?? '행 없음'}`).join(', ') || 'ok'})`, bad.length === 0)
}
const REAL = ['evernote', 'docusign', 'hubspotcrm', 'mastodon', 'substack']
t(`v52 진짜 제품은 채택(${REAL.filter((k) => vr(k)?.status !== 'adopt').join(',') || 'ok'})`, REAL.every((k) => vr(k)?.status === 'adopt'))
t('v52 채택은 진짜 제품 5개뿐(오탐 0)', v52.filter((r) => r.status === 'adopt').length === 5)
t('v52 성+이름 패턴은 첫 토큰이 이름일 때만("Apple Notes" 류 통과)', (() => {
  const r = buildCandidates({ inputs: [...Array(5)].map((_, i) => ({ id: `n${i}`, source_key: 'appstore', raw_text: 'i keep lists in Apple Notes now' })), registry: new Map(), cfg }).rows
  return r.find((x) => x.key === 'applenotes')?.status === 'adopt'
})())
t('v52 제외 목록 6갈래 + v53 2갈래(human_rejected_v53 맨 앞 · metric_term)', JSON.stringify(Object.keys(cfg.exclude).sort()) === JSON.stringify([...Object.keys(FP_EXPECT), 'human_rejected_v53', 'metric_term'].sort()) && Object.keys(cfg.exclude)[0] === 'human_rejected_v53' && cfg.acronym_rule.pattern && cfg.approval.daily_cap_per_area === 3)

// ── v52: 영역별 분리 · 승인 시트 상위 3 상한 ──
const g = groupByArea(v52, cfg.area_table.order, 3)
// v53: Evernote 는 근거 글이 영역 2 여도 notes 칸으로 빠진다.
t('영역 묶음 v53: 영역 2(채택 4 중 상위 3) + notes(Evernote) 따로', g.length === 2 && g[0].code === '2' && g[0].total === 4 && g[0].rows.length === 3 && g[1].code === 'notes' && g[1].rows[0].key === 'evernote')
t('영역 묶음: 순서는 config order, order 밖은 끝', JSON.stringify(groupByArea([{ status: 'adopt', area: 'unknown' }, { status: 'adopt', area: 'out-founder' }, { status: 'adopt', area: '1' }, { status: 'hold', area: '2' }], cfg.area_table.order).map((x) => x.code)) === '["1","out-founder","unknown"]')
const sheetMeta = { date: '2026-10-12', ruleVer: cfg.rule_ver, counts: {}, cfg, areaColumn: 'present', areaNames: { 2: '② 영업' }, priorSheet: null }
const sheetMd = renderApprovalSheet(v52, sheetMeta)
const parsed = parseApprovalSheet(sheetMd)
t('승인 시트: 영역별 상위 3개만 · 번호 1..4 · 답 칸 기본 미답 · notes 칸', parsed.length === 4 && parsed.map((e) => e.no).join() === '1,2,3,4' && parsed.every((e) => e.answer === 'unanswered') && parsed.filter((e) => e.area === '2').length === 3 && parsed[3].area === 'notes')
t('승인 시트: 상단에 날짜·규칙 버전·오탐률 계산법', sheetMd.includes('2026-10-12') && sheetMd.includes(cfg.rule_ver) && sheetMd.includes('오탐률 = 사람이 기각(N)한 수 ÷ 제시한 수') && sheetMd.includes('## ② 영업'))
t('승인 시트: 근거 원문 80자 이하 · 제안 칸', sheetMd.split('\n').filter((l) => /^\| \d/.test(l)).every((l) => [...l.matchAll(/"([^"]*)"/g)].every((m) => m[1].length <= 80) && l.includes('등록 후보:')))
t('답 판독: Y/N/승인/기각/N: 사유 · 기본 문구는 미답', readAnswer('Y') === 'approved' && readAnswer(' 승인 ') === 'approved' && readAnswer('n') === 'rejected' && readAnswer('N: 약어') === 'rejected' && readAnswer('기각') === 'rejected' && readAnswer('승인 Y / 기각 N') === 'unanswered' && readAnswer('') === 'unanswered' && readAnswer('YN') === 'unanswered')

// ── v52: 오탐률 → 승인 모드(순수 함수) ──
const am = (s) => approvalMode('2', { 2: s }).mode
t('approvalMode: 제시 0·통계 없음 → approval(no_data)', approvalMode('2', {}).reason === 'no_data' && approvalMode('2', undefined).mode === 'approval' && am({ shown: 0, approved: 0, rejected: 0, unanswered: 0 }) === 'approval')
t('approvalMode: 미답 있으면 → approval(unanswered)', approvalMode('2', { 2: { shown: 3, approved: 3, rejected: 0, unanswered: 1 } }).reason === 'unanswered')
t('approvalMode: 1/10 = 10% → auto(초과만 강제) · 1/9 → approval', am({ shown: 10, approved: 9, rejected: 1, unanswered: 0 }) === 'auto' && am({ shown: 9, approved: 8, rejected: 1, unanswered: 0 }) === 'approval')
t('approvalMode: 영역별로 따로(다른 영역 오탐이 번지지 않음)', approvalMode('1', { 1: { shown: 3, approved: 3, rejected: 0, unanswered: 0 }, 2: { shown: 3, approved: 0, rejected: 3, unanswered: 0 } }).mode === 'auto')
t('sheetStats: 영역별 제시·승인·기각·미답', JSON.stringify(sheetStats([{ area: '1', answer: 'approved' }, { area: '1', answer: 'rejected' }, { area: '2', answer: 'unanswered' }])) === JSON.stringify({ 1: { shown: 2, approved: 1, rejected: 1, unanswered: 0 }, 2: { shown: 1, approved: 0, rejected: 0, unanswered: 1 } }))

// ── v52 경계: main --approval-sheet → 사람이 N → 다음 실행이 human_rejected 로 읽는다 ──
const sres = await main(['--approval-sheet'], opts())
t('시트 모드: 시트 파일만 쓴다(reports/<날짜>/product-candidates-approval.md)', sres.files.sheet === path.join(tmp, '2026-10-12', 'product-candidates-approval.md') && !sres.files.md)
const sheetPath = sres.files.sheet
const answeredMd = fs
  .readFileSync(sheetPath, 'utf8')
  .split('\n')
  .map((l) => (/^\| \d/.test(l) ? l.replace(/승인 Y \/ 기각 N \|$/, l.includes('`docusign`') ? 'N: 테스트 |' : 'Y |') : l))
  .join('\n')
t('시트에 DocuSign 이 영역 3 으로 제시됨', /\| `docusign` \| 3 /.test(answeredMd))
fs.writeFileSync(sheetPath, answeredMd)
t('답 적힌 오늘 시트는 덮어쓰지 않는다', await main(['--approval-sheet'], opts()).then(() => false, (e) => /덮어쓰지 않는다/.test(e.message)))
const after = await main(['--run', '--date=2026-10-14'], opts())
t('다음 실행: 사람 기각 → previously_rejected(…:human_rejected)', after.rows.find((r) => r.key === 'docusign')?.reason === 'previously_rejected(2026-10-12:human_rejected)')
const led2 = JSON.parse(fs.readFileSync(after.files.ledger, 'utf8'))
const fp3 = led2.false_positive?.by_area?.['3']
t('대장: human_rejected 목록 · 영역 3 오탐률 1/3 → approval', led2.human_rejected.some((e) => e.key === 'docusign' && e.sheet_date === '2026-10-12' && e.reason === 'human_rejected') && fp3?.rejected === 1 && fp3.shown === 3 && fp3.mode === 'approval' && led2.false_positive.sheet_date === '2026-10-12')
t('--per-area 검사', await main(['--per-area', '0'], opts()).then(() => false, (e) => /--per-area/.test(e.message)) && (await main(['--per-area=2'], opts())).rows.length > 0)

// ── v53(남헌 v53 §1): 사람 기각 4건 · 지표 용어 · CDN 호스트 · 경쟁 기준점 · 대안 맥락/출시 가중 · notes 칸 ──
const v53Run = (raw, extra = {}) =>
  buildCandidates({ inputs: [...Array(5)].map((_, i) => ({ id: `w${i}`, project_id: 'pa', source_key: 'appstore', raw_text: typeof raw === 'function' ? raw(i) : raw })), registry: new Map(), cfg, projectArea: () => ({ code: '5', via: 'column', basis: null }), ...extra }).rows
const v53 = v53Run('we tried IndieWeb and our MRR and ARR grew. logos from https://img.velcdn.com/x.png and https://cdn.flowbase.io/a.png. we pay Adobe and Google and Hubspot a lot. i keep notes in Apple Notes, Bear and Evernote now. we do Zoom calls too')
const w = (k) => v53.find((r) => r.key === k)
t('v53 사람 기각: indieweb·mrr·adobe(→기준점)·velcdn', w('indieweb')?.reason === 'human_rejected_v53' && w('mrr')?.reason === 'human_rejected_v53' && w('velcdn')?.status === 'rejected')
t('v53 지표 용어: ARR → metric_term(도메인 있어도 제품 아님)', w('arr')?.reason === 'metric_term')
t('v53 CDN 호스트: velcdn → cdn_host 계열 기각, cdn.flowbase.io 는 도메인 신호·ref 를 안 준다', /^(cdn_host|human_rejected_v53)$/.test(w('velcdn')?.reason) && !(w('flowbase')?.signals ?? []).includes('domain') && !(w('flowbase')?.refs ?? []).length)
t('v53 CDN: velcdn 이 사람 기각 목록에 없어도 cdn_host', v53Run('logo https://img.velcdn.com/x.png', { cfg: { ...cfg, exclude: { ...cfg.exclude, human_rejected_v53: [] } } }).find((r) => r.key === 'velcdn')?.reason === 'cdn_host')
t('v53 isCdnHost: 접두·contains · 일반 호스트 아님', isCdnHost('img.foo.com', cfg) && isCdnHost('static.bar.io', cfg) && isCdnHost('velcdn.com', cfg) && !isCdnHost('flowbase.io', cfg) && !isCdnHost('app.notion.so', cfg))
t('v53 경쟁 기준점: Adobe·Google(기업) · Hubspot·Zoom(서비스) 단독 → benchmark', ['adobe', 'google'].every((k) => w(k)?.status === 'benchmark' && w(k).reason === 'big_company') && ['hubspot', 'zoom'].every((k) => w(k)?.status === 'benchmark' && w(k).reason === 'big_service'))
t('v53 제품명 붙은 Apple Notes 는 제품 후보(기준점 아님)', w('applenotes')?.status === 'adopt' && !w('apple'))
t('v53 notes 칸: Apple Notes·Bear·Evernote → area notes(비율 config), 근거 영역 5 무시', ['applenotes', 'evernote'].every((k) => w(k)?.area === 'notes' && w(k).areaShare === null) && (!w('bear') || w('bear').area === 'notes'))
const benchMd = renderMarkdown(v53, { date: 'x', ruleVer: cfg.rule_ver, counts: { inputs: 5 }, cfg, areaColumn: 'present', areaNames: { notes: cfg.notes_area.label } }, 'top')
t('v53 표: 경쟁 기준점 별도 소절 · 노트 소절 라벨 · 본문(영역 표)에 기준점 없음', /## 경쟁 기준점 — 4/.test(benchMd) && benchMd.includes(`## ${cfg.notes_area.label}`) && benchMd.split('## 경쟁 기준점')[0].split('\n').every((l) => !l.startsWith('| 경쟁 기준점 |')))
t('v53 표: 나머지 파일에 기준점 중복 없음', !renderMarkdown(v53, { date: 'x', ruleVer: 'v', counts: {}, cfg }, 'rest').includes('| 경쟁 기준점 |'))
const ledV53 = ledgerOf(v53, { now: new Date(), date: 'x', ruleVer: 'v', cfg })
t('v53 대장: benchmark 는 rejected 가 아니다(다음 실행이 다시 잰다)', ledV53.entries.find((e) => e.key === 'adobe')?.status === 'benchmark' && ledV53.entries.find((e) => e.key === 'indieweb')?.status === 'rejected')
t('v53 승인 시트에 기준점 없음', !parseApprovalSheet(renderApprovalSheet(v53, { date: 'x', ruleVer: 'v', cfg, priorSheet: null })).some((e) => ['adobe', 'google', 'hubspot', 'zoom'].includes(e.key)))

// 대안 맥락 언급
const altKeys = (s) => extractMentions(s, cfg).mentions.filter((m) => m.alt).map((m) => m.key)
t('v53 대안 맥락: switched from · alternative to · instead of · 대신 · 말고 · 대안 · 의 대안', ['switched from Glipr ok', 'an alternative to Glipr', 'instead of Glipr we', 'Glipr 대신 Mopo 써요', 'Glipr 말고 Mopo 로', 'Glipr 대안 찾는 중', '글리퍼의 대안'].every((s) => altKeys(s).includes(s.startsWith('글리') ? '글리퍼' : 'glipr')))
t('v53 대안 맥락 아님: vs · compared to (비교는 비교)', altKeys('Glipr vs Mopo').length === 0 && altKeys('compared to Glipr it').length === 0 && extractMentions('Glipr vs Mopo', cfg).mentions.every((m) => m.compare))
t('v53 "좋은 대안" 의 형용사는 안 잡는다', altKeys('좋은 대안이 없네요').length === 0)
const altRows = v53Run((i) => (i < 3 ? 'we use Snibb now, an alternative to Plorbo' : 'we use Snibb and Plorbo'))
const plo = altRows.find((r) => r.key === 'plorbo')
const sni = altRows.find((r) => r.key === 'snibb')
t('v53 대안 가중: 대안 맥락 후보 점수 +1 · 없는 후보는 0', plo?.altN === 3 && plo.score === plo.signals.length + 1 && sni?.altN === 0 && sni.score === sni.signals.length)

// 출시일(외부 호출 없음 — 파일만)
const NOW = new Date('2026-10-12T00:00:00Z')
const rd = parseReleaseDates({ 'appstore:id1234567': '2026-09-01T00:00:00Z', id7654321: '2025-01-01', 555555: '2026-10-01' })
t('v53 출시일 파일: 키 3꼴 · iTunes lookup 꼴', rd.size === 3 && rd.has('appstore:id555555') && parseReleaseDates({ results: [{ trackId: 1234567, releaseDate: '2026-09-01T07:00:00Z' }] }).has('appstore:id1234567'))
t('v53 출시일 파일: 못 읽는 항목은 던진다', (() => { try { parseReleaseDates({ foo: '2026-01-01' }); return false } catch { try { parseReleaseDates({ 1234567: 'nope' }); return false } catch { return true } } })())
t('v53 releaseOf: 파일 없음·앱 ID 없음·목록에 없음 = 확인 불가 / ≤90일 new / 그 밖 old', releaseOf(['appstore:id1234567'], null, NOW, 90).why === 'no_file' && releaseOf([], rd, NOW, 90).why === 'no_app_id' && releaseOf(['appstore:id1'], rd, NOW, 90).why === 'not_listed' && releaseOf(['appstore:id1234567'], rd, NOW, 90).state === 'new' && releaseOf(['appstore:id7654321'], rd, NOW, 90).state === 'old')
const linkText = 'get https://apps.apple.com/kr/app/zentrova/id1234567 now'
const noFile = v53Run(linkText, { now: NOW }).find((r) => r.key === 'appstore:id1234567')
const withFile = v53Run(linkText, { now: NOW, releaseDates: rd }).find((r) => r.key === 'appstore:id1234567')
t('v53 출시 가중: 파일 없으면 가중 0·확인 불가 표기, 있으면 ≤90일 +1', noFile.release.state === 'unverified' && withFile.score === noFile.score + 1 && withFile.release.days === 41)
t('v53 표 가중 칸: "확인 불가" · "신규 출시 41일"', renderMarkdown([noFile], { date: 'x', ruleVer: 'v', counts: {}, cfg }, 'top').includes('대안 0 · 확인 불가(출시일 파일 없음)') && renderMarkdown([withFile], { date: 'x', ruleVer: 'v', counts: {}, cfg }, 'top').includes('신규 출시 41일'))
const rdFile = path.join(tmp, 'rd.json')
fs.writeFileSync(rdFile, JSON.stringify({ 'appstore:id1234567': '2026-09-01' }))
const withRd = await main(['--date=2026-10-20', `--release-dates=${rdFile}`], opts())
t('v53 main --release-dates: 파일 읽어 가중(Zentrova 신규 출시)', withRd.rows.find((r) => r.key === 'appstore:id1234567')?.release.state === 'new')
t('v53 main --release-dates: 없는 파일은 던진다', await main([`--release-dates=${path.join(tmp, 'nope.json')}`], opts()).then(() => false, () => true))

// ── 정적 검사: 쓰기 SQL·쓰기 메서드가 코드에 없다 ──
const WRITE = [/\.(insert|update|upsert|delete|rpc)\s*\(/i, /\b(INSERT\s+INTO|UPDATE\s+[\w."]+\s+SET|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+(TABLE|COLUMN|VIEW|INDEX)|TRUNCATE|CREATE\s+(TABLE|VIEW|INDEX|OR\s+REPLACE))\b/i]
const writes = (s) => WRITE.some((re) => re.test(s))
const src = fs.readFileSync(new URL('./product-name-candidates.mjs', import.meta.url), 'utf8')
t('정적: 쓰기 SQL·메서드 0', !writes(src))
t('정적(뮤턴트): 검사기가 .insert( 를 잡는다', writes(src + "\nsb.from('x').insert({})") && writes(src + '\n// UPDATE public.x SET a=1'))
t('정적: DB 접근은 .from(...).select 만', (src.match(/\.from\('/g) ?? []).length === (src.match(/\.from\('[a-z_]+'\)\.select\(/g) ?? []).length)
t(
  '정적: 파일 쓰기는 표·나머지·대장·승인 시트 네 곳뿐',
  (src.match(/writeFileSync\(/g) ?? []).length === 4 && ['md', 'rest', 'ledger', 'sheet'].every((k) => new RegExp(`writeFileSync\\(files\\.${k},`).test(src)),
)
t('정적: LLM 호출 없음', !/anthropic|gemini|claude-cli|llm-provider|messages\.create/i.test(src.replace(/^\s*\/\/.*$/gm, '')))

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '❌'} 제품 이름 후보 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
