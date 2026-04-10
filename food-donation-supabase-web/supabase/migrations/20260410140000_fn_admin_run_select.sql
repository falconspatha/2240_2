-- Deploy: from project folder, `supabase db push` or paste into Dashboard SQL Editor.

CREATE OR REPLACE FUNCTION public.fn_admin_run_select(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sql text;
  v_result jsonb;
BEGIN
  v_sql := trim(p_sql);
  IF v_sql = '' THEN
    RAISE EXCEPTION 'empty sql';
  END IF;

  v_sql := regexp_replace(v_sql, ';+\s*$', '');
  IF position(';' IN v_sql) > 0 THEN
    RAISE EXCEPTION 'multiple statements not allowed';
  END IF;

  IF NOT (v_sql ~* '^(WITH\s|SELECT\s)') THEN
    RAISE EXCEPTION 'only SELECT or WITH … SELECT is allowed';
  END IF;

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM (%s) t',
    v_sql
  ) INTO v_result;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_admin_run_select(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_admin_run_select(text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_admin_run_select(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_admin_run_select(text) TO service_role;

NOTIFY pgrst, 'reload schema';
