/**
 * 진행 막대 (온보딩 퀴즈 "3 / 10").
 *
 * 네이티브 `<progress>` 를 쓴다 — 스크린리더가 값을 읽어 주고 `role`·`aria-valuenow` 를
 * 직접 달 필요가 없다. div 두 겹으로 만들면 채운 폭을 **인라인 스타일**로 줘야 하는데
 * `_pub` 규칙 3(인라인 스타일 금지)에 걸린다.
 *
 * `label` 은 막대 위에 글자로도 적는다: 막대만 있으면 몇 문제 중 몇 번째인지 못 읽는다.
 */
export function PubProgress({ value, max, label }: {
  value: number
  max: number
  /** 막대 위에 적을 글자. 스크린리더용 이름이기도 하다. */
  label: string
}) {
  return (
    <div className="pub-progress-wrap">
      <p className="pub-caption">{label}</p>
      <progress className="pub-progress" value={value} max={max} aria-label={label} />
    </div>
  )
}
