-- Migration 00003: Atomic activate_event RPC (service_role only)
-- Ensures deactivating the current active event and activating the target event
-- happens inside a single serialized PostgreSQL transaction.

CREATE OR REPLACE FUNCTION public.activate_event(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_target public.events%ROWTYPE;
BEGIN
    -- Serialize concurrent activation switches across requests
    PERFORM pg_advisory_xact_lock(hashtext('public.events.activate_event'));

    -- Ensure target exists and lock its row
    SELECT * INTO v_target
    FROM public.events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'EVENT_NOT_FOUND: Sự kiện không tồn tại (id: %)', p_event_id;
    END IF;

    -- Deactivate any other currently active event first (inside the same transaction)
    UPDATE public.events
    SET is_active = false, updated_at = now()
    WHERE is_active = true
      AND id <> p_event_id;

    -- Activate target event
    UPDATE public.events
    SET is_active = true, updated_at = now()
    WHERE id = p_event_id
    RETURNING * INTO v_target;

    RETURN jsonb_build_object(
        'success', true,
        'event', row_to_json(v_target)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_event(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_event(UUID) TO service_role;
