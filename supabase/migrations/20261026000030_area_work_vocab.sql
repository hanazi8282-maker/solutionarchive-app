-- 20261026000030_area_work_vocab — v71bg: 새 영역 ⑧ 업무관리 코드 'work' 를 어휘에 더한다(허용값 확장, add-only).
-- 영역 번호·코드 대응: ① '1' · ② '2' · ③ '3' · ④ '4' · ⑤ '5'(개명: 글쓰기·문서·노트) · ⑥⑦ 'hold' · ⑧ 'work'(신규) · ⑨ 'design'(기존 코드, 표시만 ⑨).
-- 기존 행·값 무변경. 이 파일은 CHECK 한 개만 바꾼다: 같은 이름으로 DROP 후 ADD, 새 어휘는 기존의 상위집합이다.
-- 롤백: *_rollback.sql — 'work' 행이 하나도 없을 때만 되돌릴 수 있다(있으면 ADD 가 실패해 트랜잭션 전체 롤백 = 변화 없음).
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.analysis_projects DROP CONSTRAINT IF EXISTS analysis_projects_area_code_check;
ALTER TABLE public.analysis_projects ADD CONSTRAINT analysis_projects_area_code_check
  CHECK (area_code IS NULL OR area_code IN ('1', '2', '3', '4', '5', 'work', 'design', 'hold', 'out-consumer', 'out-founder'));
COMMIT;
