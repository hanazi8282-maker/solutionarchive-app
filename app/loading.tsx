import { PageShell } from './_ds/components/Shell'

// /dashboard 는 Threads API 까지 기다린 뒤에야 그려진다. 그동안 빈 흰 화면 대신 자리를 잡아 둔다.
const block = (h: number) => (
  <div aria-hidden style={{ height: h, borderRadius: 'var(--radius-lg)', background: 'var(--surface-muted)' }} />
)

export default function Loading() {
  return (
    <PageShell>
      <p role="status" aria-live="polite" style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
        불러오는 중…
      </p>
      {block(88)}
      {block(180)}
      {block(180)}
    </PageShell>
  )
}
