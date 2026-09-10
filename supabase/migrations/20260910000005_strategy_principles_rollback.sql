-- 롤백: strategy_principles 테이블 제거 (시드 포함 통째로).
-- 이 테이블을 참조하는 FK 는 없다 (advisor 는 조회 전용, 느슨 참조).
DROP TABLE IF EXISTS public.strategy_principles;
