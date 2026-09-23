import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PubShell } from '../../../_pub/components/PubShell'
import { Hero } from '../../../_pub/components/Hero'
import { Panel } from '../../../_pub/components/Panel'
import { PubArticle } from '../../../_pub/components/PubArticle'
import { columnReadable, renderMarkdown } from '@/lib/columns/markdown'
import { getApprovedColumn } from '@/lib/columns/read'

export const dynamic = 'force-dynamic'

// 공개 읽기 화면. 승인된 칼럼만 그린다 — 없는 slug 와 미승인 칼럼은 똑같이 404 다.
//
// 본문은 dangerouslySetInnerHTML 로 들어간다. 안전한 이유는 renderMarkdown 이 텍스트를
// 전부 이스케이프한 뒤에만 태그를 만들기 때문이고, 그 보장은 scripts/columns-markdown-selftest.mjs
// 의 이스케이프 케이스 9개가 지킨다. 파서를 고칠 때 그 셀프테스트를 같이 돌려라.
//
// 2026-09-23 A3: 화면만 `app/_pub` 라이트 테마로 옮겼다(본문 타이포는 `PubArticle`).
// 조회 조건·케이스 링크·OG 이미지(opengraph-image.tsx)는 손대지 않았다.

const KST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const res = await getApprovedColumn(slug)
  if (!res.ok || !res.data) return { title: '칼럼' }
  return { title: res.data.title, description: columnReadable(res.data.body).summary }
}

export default async function ColumnReadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const res = await getApprovedColumn(slug)

  // 조회 실패를 404 로 접지 않는다(§7.1) — "없다"와 "못 읽었다"는 다른 사건이다.
  if (!res.ok) {
    return (
      <PubShell theme="light">
        <Hero eyebrow="COLUMNS" title="칼럼을 열지 못했다" />
        <Panel tone="alert" titleAs="h2" title="확인 불가 — 칼럼 조회 실패">
          <p className="pub-text">{res.reason} · 이 칼럼이 없다는 뜻이 아니다.</p>
        </Panel>
      </PubShell>
    )
  }
  if (!res.data) notFound()

  const c = res.data
  const { markdown } = columnReadable(c.body)

  return (
    <PubShell theme="light">
      <article className="pub-section">
        {/* h1 은 Hero 하나뿐이다. 본문 마크다운의 `# 제목` 줄은 columnReadable 이 떼 낸다. */}
        <Hero
          eyebrow={c.reader_type}
          title={c.title}
          note={`${KST.format(new Date(c.published_at ?? c.staged_at))} · ${c.char_count.toLocaleString()}자`}
        />

        <PubArticle html={renderMarkdown(markdown)} />

        <footer className="pub-column-foot">
          {/* case_study_slug 는 20260929000003 미적용이면 undefined — 그때는 링크 줄 자체가 없다. */}
          {c.case_study_slug ? (
            <Link className="pub-link" href={`/library/${c.case_study_slug}`}>
              이 칼럼의 근거 케이스 보기 ({c.case_study_slug})
            </Link>
          ) : null}
          <Link className="pub-link" href="/columns/read">다른 칼럼 보기</Link>
        </footer>
      </article>
    </PubShell>
  )
}
