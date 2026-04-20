CREATE SCHEMA IF NOT EXISTS private;
--> statement-breakpoint

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.app_list_auth_sessions(target_user_id uuid)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  refreshed_at timestamptz,
  not_after timestamptz,
  user_agent text,
  ip text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    sessions.id,
    sessions.created_at,
    sessions.updated_at,
    sessions.refreshed_at,
    sessions.not_after,
    sessions.user_agent,
    sessions.ip::text
  FROM auth.sessions AS sessions
  WHERE sessions.user_id = target_user_id
  ORDER BY COALESCE(sessions.refreshed_at, sessions.updated_at, sessions.created_at) DESC;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.app_delete_auth_session(target_user_id uuid, target_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH deleted AS (
    DELETE FROM auth.sessions AS sessions
    WHERE sessions.user_id = target_user_id
      AND sessions.id = target_session_id
    RETURNING 1
  )
  SELECT EXISTS(SELECT 1 FROM deleted);
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.app_delete_other_auth_sessions(target_user_id uuid, current_session_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH deleted AS (
    DELETE FROM auth.sessions AS sessions
    WHERE sessions.user_id = target_user_id
      AND sessions.id <> current_session_id
    RETURNING 1
  )
  SELECT COUNT(*)::integer FROM deleted;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.app_delete_all_auth_sessions(target_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH deleted AS (
    DELETE FROM auth.sessions AS sessions
    WHERE sessions.user_id = target_user_id
    RETURNING 1
  )
  SELECT COUNT(*)::integer FROM deleted;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.app_list_auth_session_counts()
RETURNS TABLE (
  user_id uuid,
  active_sessions bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT sessions.user_id, COUNT(*)::bigint AS active_sessions
  FROM auth.sessions AS sessions
  GROUP BY sessions.user_id;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION private.app_list_auth_sessions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.app_list_auth_sessions(uuid) FROM anon;
REVOKE ALL ON FUNCTION private.app_list_auth_sessions(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.app_list_auth_sessions(uuid) TO service_role;
--> statement-breakpoint

REVOKE ALL ON FUNCTION private.app_delete_auth_session(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.app_delete_auth_session(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION private.app_delete_auth_session(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.app_delete_auth_session(uuid, uuid) TO service_role;
--> statement-breakpoint

REVOKE ALL ON FUNCTION private.app_delete_other_auth_sessions(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.app_delete_other_auth_sessions(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION private.app_delete_other_auth_sessions(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.app_delete_other_auth_sessions(uuid, uuid) TO service_role;
--> statement-breakpoint

REVOKE ALL ON FUNCTION private.app_delete_all_auth_sessions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.app_delete_all_auth_sessions(uuid) FROM anon;
REVOKE ALL ON FUNCTION private.app_delete_all_auth_sessions(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.app_delete_all_auth_sessions(uuid) TO service_role;
--> statement-breakpoint

REVOKE ALL ON FUNCTION private.app_list_auth_session_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.app_list_auth_session_counts() FROM anon;
REVOKE ALL ON FUNCTION private.app_list_auth_session_counts() FROM authenticated;
GRANT EXECUTE ON FUNCTION private.app_list_auth_session_counts() TO service_role;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_list_auth_sessions(target_user_id uuid)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  refreshed_at timestamptz,
  not_after timestamptz,
  user_agent text,
  ip text
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM private.app_list_auth_sessions(target_user_id);
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_delete_auth_session(target_user_id uuid, target_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.app_delete_auth_session(target_user_id, target_session_id);
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_delete_other_auth_sessions(target_user_id uuid, current_session_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.app_delete_other_auth_sessions(target_user_id, current_session_id);
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_delete_all_auth_sessions(target_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.app_delete_all_auth_sessions(target_user_id);
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_list_auth_session_counts()
RETURNS TABLE (
  user_id uuid,
  active_sessions bigint
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM private.app_list_auth_session_counts();
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_list_auth_sessions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_list_auth_sessions(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.app_list_auth_sessions(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_list_auth_sessions(uuid) TO service_role;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_delete_auth_session(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_delete_auth_session(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.app_delete_auth_session(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_delete_auth_session(uuid, uuid) TO service_role;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_delete_other_auth_sessions(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_delete_other_auth_sessions(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.app_delete_other_auth_sessions(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_delete_other_auth_sessions(uuid, uuid) TO service_role;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_delete_all_auth_sessions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_delete_all_auth_sessions(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.app_delete_all_auth_sessions(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_delete_all_auth_sessions(uuid) TO service_role;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_list_auth_session_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_list_auth_session_counts() FROM anon;
REVOKE ALL ON FUNCTION public.app_list_auth_session_counts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_list_auth_session_counts() TO service_role;
