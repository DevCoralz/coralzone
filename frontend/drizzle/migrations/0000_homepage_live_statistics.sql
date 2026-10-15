CREATE TABLE IF NOT EXISTS public.site_visitors (
  visitor_id text PRIMARY KEY,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_visitors TO authenticated;
GRANT ALL ON public.site_visitors TO service_role;

ALTER TABLE public.site_visitors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'site_visitors' AND policyname = 'No direct reads') THEN
    CREATE POLICY "No direct reads" ON public.site_visitors FOR SELECT TO anon, authenticated USING (false);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.touch_site_visitor(p_visitor_id text)
RETURNS TABLE(visitors bigint, users bigint, online bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.site_visitors (visitor_id, first_seen, last_seen)
  VALUES (p_visitor_id, now(), now())
  ON CONFLICT (visitor_id) DO UPDATE SET last_seen = now();

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.site_visitors) AS visitors,
    (SELECT count(*) FROM auth.users) AS users,
    (SELECT count(*) FROM public.site_visitors WHERE last_seen > now() - interval '5 minutes') AS online;
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_site_visitor(text) TO anon, authenticated, service_role;