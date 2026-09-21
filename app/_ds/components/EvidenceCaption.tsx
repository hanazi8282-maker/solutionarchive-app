/**
 * 숫자·인용 아래 한 줄 근거 캡션 — "몇 건 중 몇 건 · 어느 기간 · 어디서 · 어떻게 셌나".
 *
 * §7.1: 세 상태를 **문장으로** 가른다. 0건(셌는데 없었다)과 확인 불가(못 셌다)를
 * 같은 `—` 로 뭉개면, 못 읽은 것이 "없음"으로 굳는다.
 *   n === null → "확인 불가 — {method}"
 *   n === 0    → "검증된 인용 없음 ({method})"
 *   그 밖      → "{n}/{total ?? '?'}건 · {period} · {source} · {method}"
 * 없는 조각은 빼되 구분점이 남지 않게 붙인다.
 *
 * ⚠️ 아직 소비처가 없다 — PR2(result·remedy) · PR4(review) · PR5(cases)가 붙인다.
 */
export function EvidenceCaption({ n, total, period, source, method }: {
  n: number | null
  total: number | null
  period?: string
  source?: string
  method: string
}) {
  const text = n === null
    ? `확인 불가 — ${method}`
    : n === 0
      ? `검증된 인용 없음 (${method})`
      : [`${n}/${total ?? '?'}건`, period, source, method].filter(Boolean).join(' · ')

  return (
    <p style={{
      margin: 0, fontSize: 'var(--fs-xs)', lineHeight: 1.5,
      color: 'var(--text-muted)', overflowWrap: 'anywhere',
    }}>
      {text}
    </p>
  )
}
