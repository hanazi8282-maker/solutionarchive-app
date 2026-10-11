#!/usr/bin/env node
// product-name-candidates.mjs 셀프테스트 — DB·LLM 없이. 부품(정규화·추출·대조) + 경계(가짜 DB 포트 → main → 표·대장 파일) + 쓰기 SQL 정적 검사.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { normKey, splitBilingual, domainName, extractMentions, buildRegistry, loadConfig, main, stripHeader, idLike, corpusStats, renderMarkdown, buildCandidates } from './product-name-candidates.mjs'

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
t('추출: 3자 대문자 제품명(LUX)은 남기고 흔한 약어(SEO)는 거른다', (() => {
  const r = buildCandidates({ inputs: [...Array(5)].map((_, i) => ({ id: `l${i}`, source_key: 'appstore', raw_text: 'we bought LUX and SEO tools' })), registry: new Map(), cfg }).rows
  return r.find((x) => x.key === 'lux')?.status === 'adopt' && !r.some((x) => x.key === 'seo')
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
t('정렬: 신호 종류 수가 비교 언급 수보다 먼저(Zentrova 2종 > 모아노트 1종·비교 4)', zi < res.rows.findIndex((r) => r.key === '모아노트'))
t('오탐: 본문 속 영상 ID → id_like 기각', row('ksmcwnvwixa')?.reason === 'id_like')
t('정렬: 같은 신호 수면 비교 언급 많은 쪽(모아노트) 위', res.rows.findIndex((r) => r.key === '모아노트') < res.rows.findIndex((r) => r.key === 'docusign'))

const md = fs.readFileSync(res.files.md, 'utf8')
t('표 상단: 사유별 건수 요약', /기각·확인불가 사유별: .*stopword \d+/.test(md) && /contraction \d+/.test(md))
t('나머지 파일 생성', fs.existsSync(res.files.rest) && res.files.rest.endsWith('product-name-candidates-rest.md'))
const small = { ...cfg, candidate: { ...cfg.candidate, table_top: 3 } }
const rowLines = (s) => s.split('\n').filter((l) => /^\| (채택|확인불가|기각) \|/.test(l)).length
const meta = { date: 'x', ruleVer: 'v', counts: res.counts, cfg: small, areaColumn: 'present' }
t('상위 N 본문 · 나머지 별도', rowLines(renderMarkdown(res.rows, meta, 'top')) === 3 && rowLines(renderMarkdown(res.rows, meta, 'rest')) === res.rows.length - 3)
const ledger = JSON.parse(fs.readFileSync(res.files.ledger, 'utf8'))
t('파일 위치 reports/<KST 날짜>/', res.files.md === path.join(tmp, '2026-10-12', 'product-name-candidates.md') && res.files.ledger === path.join(tmp, '2026-10-12', 'rejected-candidates.json'))
t('표 헤더 열', md.includes('| 상태 | 후보명 | 정규화키 | 언급 글 수 | 소스 수 | 제품 신호 | 영역 추정(근거) | 근거 3건 | 비교대상만 | 기각·확인불가 사유 |'))
t('표: 채택 행', /\| 채택 \| Zentrova \| `appstore:id1234567` \| 5 \|/.test(md) && md.includes('| 채택 | 모아노트 |'))
t('표: 기각·확인불가도 사유와 함께', /\| 기각 \| Excel \|.*\| stopword \|/.test(md) && /\| 확인불가 \| Brivio \|/.test(md))
t('표: 행마다 열 10개(파이프 이스케이프)', md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('|---')).every((l) => l.split(/(?<!\\)\|/).length === 12))
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

// ── 정적 검사: 쓰기 SQL·쓰기 메서드가 코드에 없다 ──
const WRITE = [/\.(insert|update|upsert|delete|rpc)\s*\(/i, /\b(INSERT\s+INTO|UPDATE\s+[\w."]+\s+SET|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+(TABLE|COLUMN|VIEW|INDEX)|TRUNCATE|CREATE\s+(TABLE|VIEW|INDEX|OR\s+REPLACE))\b/i]
const writes = (s) => WRITE.some((re) => re.test(s))
const src = fs.readFileSync(new URL('./product-name-candidates.mjs', import.meta.url), 'utf8')
t('정적: 쓰기 SQL·메서드 0', !writes(src))
t('정적(뮤턴트): 검사기가 .insert( 를 잡는다', writes(src + "\nsb.from('x').insert({})") && writes(src + '\n// UPDATE public.x SET a=1'))
t('정적: DB 접근은 .from(...).select 만', (src.match(/\.from\('/g) ?? []).length === (src.match(/\.from\('[a-z_]+'\)\.select\(/g) ?? []).length)
t(
  '정적: 파일 쓰기는 표·나머지·대장 세 곳뿐',
  (src.match(/writeFileSync\(/g) ?? []).length === 3 && ['md', 'rest', 'ledger'].every((k) => new RegExp(`writeFileSync\\(files\\.${k},`).test(src)),
)
t('정적: LLM 호출 없음', !/anthropic|gemini|claude-cli|llm-provider|messages\.create/i.test(src.replace(/^\s*\/\/.*$/gm, '')))

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '❌'} 제품 이름 후보 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
