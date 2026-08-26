// ⚠️ 크론에서 의도적으로 제외됨 — 되돌리기 전에 읽을 것.
//
// 이 라우트는 지금 두 가지가 모두 없어서 크론에 걸면 매일 500 만 낸다(실측 확인함):
//   1. ANTHROPIC_API_KEY 미설정 → 아래 가드에서 즉시 500 ("생성 엔진이 설정되지 않았습니다")
//   2. 결과를 INSERT 할 thread_posts 테이블이 이 프로젝트의 Supabase 에 없음
//      (키를 넣어도 그다음 INSERT 에서 다시 500)
//   덧붙여 content/corpus/ 디렉터리도 없어 코퍼스 청크가 항상 비어 있다.
// 위 셋이 갖춰지면 vercel.json 에 다시 추가한다: "30 11 * * *" (20:30 KST).
//
// vercel.json 은 순수 JSON 이라 주석을 못 넣는다(주석·미지원 키 모두 배포를 깨뜨림).
// 그래서 이 설명이 라우트 파일에 있다.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'


// ── 파일 읽기 헬퍼 ────────────────────────────────────────────────
function readFile(filePath: string): string {
  try { return fs.readFileSync(filePath, 'utf-8') } catch { return '' }
}

// ── 코퍼스 랜덤 청크 ─────────────────────────────────────────────
function pickCorpusChunk(): { topic: string; content: string; source: string } {
  try {
    const dir = path.join(process.cwd(), 'content', 'corpus')
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'))
    if (!files.length) return { topic: '기타', content: '', source: 'none' }

    const file = files[Math.floor(Math.random() * files.length)]
    const raw  = readFile(path.join(dir, file))
    const topic = file.replace('.txt', '').split('_')[0] || '기타'
    const paras = raw.split(/\n\n+/).filter(p => p.trim().length > 200)
    if (!paras.length) return { topic, content: raw.slice(0, 600), source: file }

    const p = paras[Math.floor(Math.random() * paras.length)]
    return { topic, content: p.trim().slice(0, 800), source: file }
  } catch {
    return { topic: '기타', content: '', source: 'none' }
  }
}

// ── Mock 폴백 (파싱 실패 시) ──────────────────────────────────────
function getMockPost(postSlug: string) {
  const MOCKS = [
    {
      hook_text: '수능 D-100, 지금 공부법이 틀렸을 수 있습니다',
      body_text: `수능 D-100, 지금 공부법이 틀렸을 수 있습니다.

많은 수험생이 '열심히'는 하는데 성적이 안 오릅니다.

문제를 많이 푸는 게 아니라,
틀린 문제를 제대로 분석하는 게 핵심이에요.

오답노트를 쓰는 게 아니라,
왜 틀렸는지 '패턴'을 찾아야 합니다.

별 거 없습니다. 그냥 하면 됩니다.

링크는 댓글에 👇`,
      topic_tag: '#공부법',
      image_brief: '오답노트와 빨간펜이 놓인 책상, 다크 무드',
    },
    {
      hook_text: '회독이 많다고 성적이 오르지 않는 이유',
      body_text: `회독이 많다고 성적이 오르지 않는 이유

3회독, 5회독 해도 점수가 그대로라면
'읽는 방식'이 문제입니다.

이해 없이 눈으로만 넘기는 회독은
시간만 날리는 회독이에요.

제발 아는 거 그만 보세요.
모르는 것만 솎아서 거기에 시간 박으면 됩니다.

링크는 댓글에 👇`,
      topic_tag: '#회독',
      image_brief: '교재 여러 권이 쌓인 책상, 형광펜 흔적, 다크 톤',
    },
  ]
  const m = MOCKS[Math.floor(Math.random() * MOCKS.length)]
  return {
    ...m,
    // TODO: 솔루션아카이브 랜딩 URL 확정 후 교체
    comment_text: `자세히 보기 → #`,
  }
}

// ─────────────────────────────────────────────────────────────────
export async function GET(req: Request) { return POST(req) }

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  // Anthropic SDK 는 키가 없으면 생성자에서 던진다. 모듈 최상위에 두면
  // 빌드의 page-data 수집 단계에서 터지므로 핸들러 안에서 만든다.
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    return NextResponse.json({ error: '생성 엔진이 설정되지 않았습니다.' }, { status: 500 })
  }
  const anthropic = new Anthropic({ apiKey: anthropicKey })

  // ── 1. 코퍼스 청크 ──────────────────────────────────────────────
  const chunk = pickCorpusChunk()

  // ── 2. 가이드 읽기 ──────────────────────────────────────────────
  const styleGuide = readFile(path.join(process.cwd(), 'content', 'guides', 'style-guide.md'))
  const seoGuide   = readFile(path.join(process.cwd(), 'content', 'guides', 'seo-guide.md'))

  // ── 3. TOP10 hook_text ──────────────────────────────────────────
  let top10Hooks: string[] = []
  try {
    const { data } = await supabase.from('top10_posts').select('hook_text').limit(10)
    top10Hooks = (data ?? []).map((r: { hook_text: string }) => r.hook_text).filter(Boolean)
  } catch { /* 뷰 없으면 무시 */ }

  const post_slug = `tp_${Date.now()}`
  let generated: ReturnType<typeof getMockPost> | null = null
  let mode = 'claude'
  let claudeError = ''

  // ── 4. Claude API 호출 ──────────────────────────────────────────
  const systemPrompt = [
    '당신은 솔루션아카이브의 Threads 자동화 에이전트입니다.',
    '아래 두 가이드를 완전히 내면화하고 글을 생성하세요.\n',
    '=== 문체 가이드 (style-guide.md) ===',
    styleGuide,
    '\n=== SEO & 알고리즘 가이드 (seo-guide.md) ===',
    seoGuide,
    '\n출력은 반드시 아래 JSON 형식 하나만 반환하세요. 마크다운 코드블록, 설명 텍스트 일절 금지.',
    JSON.stringify({
      hook_text:    '40~70자 첫 줄 (피드 노출 후킹)',
      body_text:    '500자 이내 본문 전체 (줄바꿈 포함)',
      // TODO: 솔루션아카이브 랜딩 URL 확정 후 교체
      comment_text: `첫 댓글 멘트 + 자세히 보기 → # (플레이스홀더, 링크 미확정)`,
      topic_tag:    '#해시태그1개 (seo-guide §5 기준)',
      image_brief:  '이미지 방향 한 줄 (규격·분위기·텍스트 포함 여부)',
    }),
  ].join('\n')

  const userPrompt = [
    `## 오늘의 코퍼스 청크 (주제: ${chunk.topic}, 출처: ${chunk.source})`,
    chunk.content || '(코퍼스 파일 없음 — 공부법 인사이트를 자유롭게 생성하세요)',
    '',
    top10Hooks.length
      ? `## TOP10 고성과 글 hook_text (구조·리듬만 흡수, 내용 베끼지 말 것)\n${top10Hooks.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
      : '## TOP10: 아직 데이터 없음 — 코퍼스와 가이드 기반으로 자유 생성',
    '',
    '위 코퍼스 내용을 바탕으로, style-guide.md의 화자 페르소나와 seo-guide.md의 알고리즘 규칙을 완전히 따르는 Threads 게시물 1개를 JSON으로 생성하세요.',
  ].join('\n')

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    // JSON 추출 (코드블록 방어)
    const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(jsonStr)

    generated = {
      hook_text:    String(parsed.hook_text   ?? '').slice(0, 100),
      body_text:    String(parsed.body_text   ?? '').slice(0, 1000),
      // TODO: 솔루션아카이브 랜딩 URL 확정 후 교체
      comment_text: String(parsed.comment_text ?? `자세히 보기 → #`),
      topic_tag:    String(parsed.topic_tag   ?? '기타'),
      image_brief:  String(parsed.image_brief ?? ''),
    }
  } catch (e) {
    claudeError = e instanceof Error ? e.message : String(e)
    mode = 'mock_fallback'
    generated = getMockPost(post_slug)
  }

  // ── 5. Supabase INSERT ──────────────────────────────────────────
  const { data, error } = await supabase
    .from('thread_posts')
    .insert({
      hook_text:    generated.hook_text,
      body_text:    generated.body_text,
      comment_text: generated.comment_text,
      topic_tag:    generated.topic_tag,
      image_url:    null,
      post_slug,
      status:       'queued',
      generation_meta: {
        mode,
        model:               mode === 'claude' ? 'claude-sonnet-4-6' : null,
        corpus_source:       chunk.source,
        corpus_topic:        chunk.topic,
        style_guide_loaded:  styleGuide.length > 0,
        seo_guide_loaded:    seoGuide.length > 0,
        top10_hooks_count:   top10Hooks.length,
        image_brief:         (generated as { image_brief?: string }).image_brief ?? '',
        ...(claudeError ? { error: claudeError } : {}),
        generated_at:        new Date().toISOString(),
      },
    })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok:       true,
    mode,
    post_slug,
    hook_text:  generated.hook_text,
    body_text:  generated.body_text,
    inserted:   data?.[0],
    ...(claudeError ? { claude_error: claudeError } : {}),
  })
}
