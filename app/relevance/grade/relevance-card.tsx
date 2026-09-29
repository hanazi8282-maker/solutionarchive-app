'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { gradeRelevance, type RelevanceActionState } from '../actions'
import { NOTE_MAX } from '@/lib/relevance-feedback/sample'
import { IconCheck, IconChevronRight, IconClock, IconExternal, IconUndo } from './icons'

// 카드 1장 = 리뷰 1건 = 제출 1회. 채점 전 카드는 모델 판정·층을 **props 로도 받지 않는다** —
// 클라이언트로 넘어가는 순간 DOM·RSC 페이로드에서 보인다(끌림 방지). 공개는 저장 뒤(revealed)에만.
//
// 번역·제품 배경·스레드 제목(2026-09-29)도 같은 규칙 아래 있다: **순수 사실만** 싣는다. 만든 쪽(lib/relevance-feedback/translate.ts)이
// 프롬프트 제한 + 사후검사로 평가 문구를 걸러 failed 로 남기고, 이 카드는 그 본문 문자열만 받는다 — 판정 계열 prop 은 없다.
//
// 모양은 DESIGN.md §4 (남헌 09-29 승인 목업 operator-grading.html): 머리(번호·제품·상태·배경·스레드) / 원문·번역 2열 / 판정 줄(44px 타일 + kbd).
// 저장은 **5초 뒤 전송**이다(U·되돌리기 창). 서버 액션은 이미 채점된 행을 덮어쓰지 않으므로(../actions.ts) 되돌리기는 전송 전에만 된다 —
// 전송된 뒤에는 "저장됨"이고 다시 열어도 판정 결과만 보인다.

export type Revealed = { stratum: string; human: string; lines: string[] }

/** 번역·맥락 — 전부 사실 문자열이거나 "없음"의 이유다. */
export type CardContext = {
  /** 제품 배경 1~2문장(프로젝트 단위 캐시). 없으면 null 이고 backgroundNote 가 이유를 말한다. */
  background: string | null
  /** 배경이 없을 때 이유("준비 중"·"생성 실패"·"소개 없음"·"미적용"). 배경이 있으면 null. */
  backgroundNote: string | null
  /** 한국어 번역 본문. 없으면 null 이고 translationNote 가 이유를 말한다. */
  translation: string | null
  /** 번역이 없을 때 이유("번역 준비 중"·"번역 실패"·"미적용"·"한국어 원문"). 번역이 있으면 null. */
  translationNote: string | null
  /** 이 댓글이 달린 스레드(저장돼 있는 것만). 원제가 없는 소스(PH·YouTube)는 ref 만 있다. */
  thread: { title: string | null; titleKo: string | null; ref: string | null } | null
}

const PREVIEW = 400
const UNDO_SECONDS = 5

/** 미리보기 끝 — 단어·문장 중간에서 자르지 않게 limit 앞의 마지막 공백·줄바꿈에서 끊는다(없으면 limit). */
function cut(text: string, limit: number): number {
  if (text.length <= limit) return text.length
  const sp = Math.max(text.lastIndexOf(' ', limit), text.lastIndexOf('\n', limit))
  return sp > limit * 0.6 ? sp : limit
}

/**
 * 원문·번역 한쪽. 펼침 상태는 카드가 들고 두 칸에 같이 준다 — 한쪽만 펼쳐 문단 위치가 어긋나지 않게.
 * 펼치면 같은 문단이 이어서 전부 보인다(나머지를 새 문단으로 따로 붙이지 않는다 — 문장이 중간에 끊겨 보였다).
 * 번역은 원문과 같은 비율 지점에서 끊는다(한국어가 더 짧아 같은 글자 수로 자르면 원문보다 훨씬 뒤까지 보인다).
 */
function LongText({ text, lang, limit, open, onToggle }: { text: string; lang: 'ko' | 'en'; limit: number; open: boolean; onToggle: (open: boolean) => void }) {
  const cls = lang === 'en' ? 'v2-cols-body v2-cols-body--en' : 'v2-cols-body'
  const end = cut(text, limit)
  if (end >= text.length) return <p className={cls} lang={lang}>{text}</p>
  return (
    <>
      <p className={cls} lang={lang}>{open ? text : `${text.slice(0, end).trimEnd()} …`}</p>
      <details className="v2-fold v2-mt-sm" open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
        <summary><IconChevronRight />{open ? '접기' : `이어서 ${(text.length - end).toLocaleString('ko-KR')}자 더 보기`}</summary>
      </details>
    </>
  )
}

function ThreadLine({ t }: { t: NonNullable<CardContext['thread']> }) {
  if (!t.titleKo && !t.title && !t.ref) return null
  // HN 은 ref 가 URL(또는 옛 형식이면 제목)이다. PH·YouTube 는 제목이 없고 ref 가 스킴 없는 주소다 — 링크로 연다.
  const url = t.ref && /^https?:\/\//.test(t.ref) ? t.ref : !t.title && t.ref ? `https://${t.ref}` : null
  return (
    <p className="v2-gcard-thread">
      <span className="v2-muted">스레드</span>
      {t.title ? <b lang={t.titleKo ? 'ko' : 'en'}>{t.titleKo ?? t.title}</b> : <span className="v2-muted">제목이 저장되지 않았다. 주소만 있다.</span>}
      {t.titleKo && t.title ? <span className="v2-muted">원제 <span lang="en">{t.title}</span></span> : null}
      {url ? <a className="v2-mono v2-wrap" translate="no" href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https?:\/\//, '')} <IconExternal /></a> : null}
    </p>
  )
}

export function RelevanceCard(props: {
  inputId: string
  n: number
  total: number
  project: string
  text: string
  context: CardContext
  informativeReady: boolean
  noteState: 'present' | 'missing' | 'unknown'
  revealed: Revealed | null
}) {
  const [state, action, pending] = useActionState<RelevanceActionState, FormData>(gradeRelevance, null)
  const [open, setOpen] = useState(props.revealed == null)
  const [queued, setQueued] = useState<number | null>(null) // 남은 초. null 이면 대기 없음.
  const [err, setErr] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [expanded, setExpanded] = useState(false)
  const { text, context } = props
  // 원문 언어 — 번역 배치(needsTranslation)와 같은 기준: 로마자가 한글보다 많으면 영어 글.
  const srcLang = (text.match(/[A-Za-z]/g)?.length ?? 0) > (text.match(/[가-힣]/g)?.length ?? 0) ? 'en' : 'ko'
  const shownRatio = cut(text, PREVIEW) / Math.max(text.length, 1)
  const trLimit = context.translation ? (shownRatio >= 1 ? context.translation.length : Math.round(context.translation.length * shownRatio)) : 0
  const done = props.revealed != null || (state?.ok ?? false)

  // 대기 중이면 1초마다 줄이고 0 에서 전송한다. 되돌리기(U)는 setQueued(null).
  useEffect(() => {
    if (queued === null) return
    const t = setTimeout(() => {
      if (queued <= 1) { setQueued(null); formRef.current?.requestSubmit() } else setQueued(queued - 1)
    }, 1000)
    return () => clearTimeout(t)
  }, [queued])

  const queue = () => {
    const f = formRef.current
    if (!f) return
    if (!f.querySelector<HTMLInputElement>('input[name="verdict"]:checked')) {
      setErr(true)
      f.querySelector<HTMLInputElement>('input[name="verdict"]')?.focus()
      return
    }
    setErr(false)
    setQueued(UNDO_SECONDS)
  }

  const folded = !open || (queued !== null) || done
  const stateLabel = done ? '저장됨' : queued !== null ? `${queued}초 뒤 저장` : pending ? '저장 중…' : '채점 전'
  const head = (
    <div className="v2-gcard-head">
      <span className="v2-gcard-no">{props.n}<small>/{props.total}</small></span>
      <span className="v2-gcard-name v2-wrap">{props.project}</span>
      <span className={done ? 'v2-gcard-state v2-gcard-state--done' : 'v2-gcard-state'} aria-live="polite">
        {done ? <IconCheck /> : <IconClock />} {stateLabel}
      </span>
      <p className="v2-gcard-bg">{context.background ?? context.backgroundNote ?? '제품 배경 준비 중. 야간 배치가 만든다.'}</p>
      {context.thread ? <ThreadLine t={context.thread} /> : null}
      {props.revealed ? (
        <p className="v2-gcard-result"><b>{props.revealed.human}</b> · {props.revealed.stratum} · {props.revealed.lines.join(' · ')}</p>
      ) : state?.ok ? (
        <p className="v2-gcard-result v2-wrap">{state.message}</p>
      ) : null}
    </div>
  )

  return (
    <article
      className={folded ? 'v2-gcard v2-gcard--folded' : 'v2-gcard'}
      id={`c-${props.inputId}`}
      tabIndex={-1}
      data-gcard={done || queued !== null ? 'saved' : 'open'}
    >
      {folded && !done && queued === null
        ? <button type="button" className="v2-gcard-bare" onClick={() => setOpen(true)} aria-expanded={false}>{head}</button>
        : head}

      <div className="v2-cols">
        <div>
          <h3><span>원문</span><span>{text.length.toLocaleString('ko-KR')}자</span></h3>
          <LongText text={text} lang={srcLang} limit={PREVIEW} open={expanded} onToggle={setExpanded} />
        </div>
        <div>
          <h3><span>한국어 번역</span>{context.translation ? <span>{context.translation.length.toLocaleString('ko-KR')}자</span> : null}</h3>
          {context.translation
            ? <LongText text={context.translation} lang="ko" limit={trLimit} open={expanded} onToggle={setExpanded} />
            : <p className="v2-note">{context.translationNote ?? '번역 준비 중. 야간 배치가 만든다. 원문으로 채점한다.'}</p>}
        </div>
      </div>

      {props.revealed ? null : (
        <form ref={formRef} action={action} className="v2-judge" onSubmit={() => setErr(false)}>
          <input type="hidden" name="input_id" value={props.inputId} />
          <div className="v2-judge-row">
            <span className="v2-judge-q">이 글은</span>
            <div className="v2-tiles" role="radiogroup" aria-label="판정">
              {([['relevant', '관련', '1'], ['irrelevant', '무관', '2'], ['unknown', '모름', '3']] as const).map(([v, l, k]) => (
                <label key={v} className="v2-tile">
                  <input type="radio" name="verdict" value={v} required disabled={pending} onChange={() => setErr(false)} />
                  <span className="v2-tile-dot" aria-hidden="true" />{l}<kbd className="v2-kbd">{k}</kbd>
                </label>
              ))}
            </div>
            <span className="v2-note">무관은 확실할 때만. 애매하면 모름.</span>
          </div>
          <div className="v2-judge-row">
            <span className="v2-judge-q">제품 정보가</span>
            {props.informativeReady ? (
              <>
                <div className="v2-tiles" role="radiogroup" aria-label="제품 정보 유무">
                  <label className="v2-tile"><input type="radio" name="informative" value="true" disabled={pending} /><span className="v2-tile-dot" aria-hidden="true" />있음<kbd className="v2-kbd">4</kbd></label>
                  <label className="v2-tile"><input type="radio" name="informative" value="false" disabled={pending} /><span className="v2-tile-dot" aria-hidden="true" />없음<kbd className="v2-kbd">5</kbd></label>
                </div>
                <span className="v2-note">선택. 이 제품(또는 대체재)을 판단할 구체 정보가 있는가.</span>
              </>
            ) : (
              <span className="v2-note">아직 물을 수 없다. 관련·무관·모름만 저장된다. <span className="v2-mono" translate="no">product_informative 미적용 (마이그 000031 전)</span></span>
            )}
          </div>
          <label className="v2-stack-tight">
            <span className="v2-note">기준 보완 메모 (선택)</span>
            <textarea
              name="note"
              rows={2}
              maxLength={NOTE_MAX}
              disabled={pending || props.noteState !== 'present'}
              autoComplete="off"
              spellCheck={false}
              placeholder={props.noteState === 'present' ? '기준이 이 글을 어떻게 다뤄야 했나…' : '아직 쓸 수 없다. 판정은 저장된다.'}
            />
            {props.noteState !== 'present' && (
              <span className="v2-note">
                {props.noteState === 'missing' ? '메모 저장소가 아직 없다.' : '메모 저장소를 확인하지 못했다(없다는 뜻은 아니다).'}{' '}
                <span className="v2-mono" translate="no">relevance_feedback_notes {props.noteState === 'missing' ? '미적용 (마이그 000032 전)' : '확인 불가'}</span>
              </span>
            )}
          </label>
          {err && <p className="v2-err" role="alert">판정을 고르지 않았다. 관련(1)·무관(2)·모름(3) 중 하나를 고른다.</p>}
          {state && !state.ok && <p className="v2-err" role="alert">{state.message}</p>}
          <div className="v2-judge-foot">
            <button type="button" className="v2-gbtn v2-gbtn--primary" data-save disabled={pending || queued !== null} onClick={queue}>저장 <kbd className="v2-kbd">Enter</kbd></button>
            <span className="v2-note">모델 판정과 층은 저장한 뒤에 보인다.</span>
          </div>
        </form>
      )}

      {queued !== null && (
        <div className="v2-toast v2-toast--on" role="status" aria-live="polite">
          <span>{queued}초 뒤 저장</span>
          <button type="button" data-undo onClick={() => { setQueued(null); setOpen(true) }}><IconUndo />되돌리기 <kbd className="v2-kbd">U</kbd></button>
        </div>
      )}
    </article>
  )
}
