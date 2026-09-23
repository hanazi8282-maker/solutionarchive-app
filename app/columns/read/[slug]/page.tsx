import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '../../../_ds/components/Badge'
import { Notice, PageShell } from '../../../_ds/components/Shell'
import { columnReadable, renderMarkdown } from '@/lib/columns/markdown'
import { getApprovedColumn } from '@/lib/columns/read'
import '../column-read.css'

export const dynamic = 'force-dynamic'

// 공개 읽기 화면. 승인된 칼럼만 그린다 — 없는 slug 와 미승인 칼럼은 똑같이 404 다.
//
// 본문은 dangerouslySetInnerHTML 로 들어간다. 안전한 이유는 renderMarkdown 이 텍스트를
// 전부 이스케이프한 뒤에만 태그를 만들기 때문이고, 그 보장은 scripts/columns-markdown-selftest.mjs
// 의 이스케이프 케이스 9개가 지킨다. 파서를 고칠 때 그 셀프테스트를 같이 돌려라.

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
      <PageShell maxWidth={760}>
        <Notice tone="danger" title="확인 불가 — 칼럼 조회 실패">
          {res.reason} · 이 칼럼이 없다는 뜻이 아니다.
        </Notice>
      </PageShell>
    )
  }
  if (!res.data) notFound()

  const c = res.data
  const { markdown } = columnReadable(c.body)

  return (
    <PageShell maxWidth={760}>
      <article className="sa-column">
        <header style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Badge tone="neutral" size="sm">{c.reader_type}</Badge>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {KST.format(new Date(c.published_at ?? c.staged_at))} · {c.char_count.toLocaleString()}자
            </span>
          </div>
          <h1 style={{
            margin: 0, fontSize: 'var(--fs-h1)', fontWeight: 'var(--fw-bold)',
            lineHeight: 'var(--lh-snug)', letterSpacing: 'var(--ls-tight)', color: 'var(--text-strong)',
          }}>
            {c.title}
          </h1>
        </header>

        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }} />

        <footer style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'grid', gap: 8, fontSize: 13 }}>
          {/* case_study_slug 는 20260929000003 미적용이면 undefined — 그때는 링크 줄 자체가 없다. */}
          {c.case_study_slug ? (
            <Link href={`/library/${c.case_study_slug}`}>이 칼럼의 근거 케이스 보기 ({c.case_study_slug})</Link>
          ) : null}
          <Link href="/columns/read">다른 칼럼 보기</Link>
        </footer>
      </article>
    </PageShell>
  )
}
