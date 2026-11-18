-- v71cu S6: 일일 집계 함수가 시간초과(>2분)라 인덱스 추가(추가 전용, 적용 완료). 롤백: _rollback.
CREATE INDEX IF NOT EXISTS analysis_inputs_source_collected_idx ON public.analysis_inputs (source_key, collected_at);
CREATE INDEX IF NOT EXISTS analysis_inputs_collected_idx ON public.analysis_inputs (collected_at);
CREATE INDEX IF NOT EXISTS analysis_inputs_project_idx2 ON public.analysis_inputs (project_id);
