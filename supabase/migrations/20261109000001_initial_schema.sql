-- ==============================================================================
-- 00001_initial_schema.sql
-- Church Lucky Draw - Core Schema, Constraints, RLS, Realtime & Storage
-- ==============================================================================

-- 0. SCHEMAS & EXTENSIONS SETUP
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- Mock/fallback for auth.jwt() if running in standard Postgres / local test environment
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

-- Default Privileges: revoke execution on future functions from public/anon/authenticated
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

-- 1. EVENTS TABLE
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    parish_name TEXT NOT NULL,
    logo_url TEXT,
    digits INT NOT NULL,
    range_from INT NOT NULL DEFAULT 1,
    range_to INT NOT NULL,
    theme TEXT NOT NULL DEFAULT 'classic',
    primary_color TEXT NOT NULL DEFAULT '#F5C451',
    bg_music_url TEXT,
    test_mode BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'draft',
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT chk_digits_range CHECK (digits BETWEEN 3 AND 7),
    CONSTRAINT chk_range_positive CHECK (range_from >= 0),
    CONSTRAINT chk_range_bounds CHECK (range_from <= range_to),
    CONSTRAINT chk_range_max_digits CHECK (range_to < (10 ^ digits)::BIGINT),
    CONSTRAINT chk_theme CHECK (theme IN ('classic', 'christmas', 'easter')),
    CONSTRAINT chk_status CHECK (status IN ('draft', 'ready', 'active', 'completed', 'paused'))
);

-- Partial Unique Index: ONLY ONE event can be active at any time
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_single_active 
    ON public.events (is_active) 
    WHERE is_active = true;

-- 2. EXCLUDED TICKETS TABLE (Cancelled, unsold, or disqualified tickets)
CREATE TABLE IF NOT EXISTS public.excluded_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    ticket INT NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_excluded_event_ticket UNIQUE (event_id, ticket)
);

CREATE INDEX IF NOT EXISTS idx_excluded_event_id ON public.excluded_tickets (event_id);
CREATE INDEX IF NOT EXISTS idx_excluded_ticket ON public.excluded_tickets (event_id, ticket);

-- 3. PRIZES TABLE
CREATE TABLE IF NOT EXISTS public.prizes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    reward TEXT NOT NULL,
    quantity INT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_prize_quantity CHECK (quantity > 0),
    CONSTRAINT chk_prize_sort_order CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS idx_prizes_event_sort ON public.prizes (event_id, sort_order ASC);

-- 4. DRAWS TABLE
CREATE TABLE IF NOT EXISTS public.draws (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    prize_id UUID NOT NULL REFERENCES public.prizes(id) ON DELETE CASCADE,
    ticket INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'revealing',
    seq INT NOT NULL,
    idempotency_key TEXT,
    is_test BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_draw_status CHECK (status IN ('revealing', 'won', 'absent', 'void'))
);

-- Partial Unique Index:
-- Only 'void' returns a ticket to the pool.
-- 'revealing', 'won', and 'absent' permanently claim or exclude the ticket for this event and mode.
CREATE UNIQUE INDEX IF NOT EXISTS idx_draws_unique_claimed_ticket
    ON public.draws (event_id, is_test, ticket)
    WHERE status IN ('revealing', 'won', 'absent');

-- Unique constraint on idempotency key per event and test mode
CREATE UNIQUE INDEX IF NOT EXISTS idx_draws_event_idempotency
    ON public.draws (event_id, is_test, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Index for sequence lookup and sorting
CREATE INDEX IF NOT EXISTS idx_draws_event_seq
    ON public.draws (event_id, is_test, seq DESC);

-- Index for counting prize quota: only 'won' + 'revealing' count toward quantity
CREATE INDEX IF NOT EXISTS idx_draws_prize_status
    ON public.draws (prize_id, is_test, status);

-- 5. TRIGGER: Prevent modifying events.test_mode when real (non-test) draws exist
CREATE OR REPLACE FUNCTION public.check_event_test_mode_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.test_mode IS DISTINCT FROM NEW.test_mode THEN
        IF EXISTS (
            SELECT 1 FROM public.draws
            WHERE event_id = NEW.id AND is_test = false
        ) THEN
            RAISE EXCEPTION 'CANNOT_CHANGE_TEST_MODE: Không thể thay đổi test_mode khi sự kiện đã có lượt quay chính thức (is_test = false)';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_event_test_mode_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_event_test_mode_update() TO service_role;

DROP TRIGGER IF EXISTS trg_events_prevent_test_mode_change ON public.events;
CREATE TRIGGER trg_events_prevent_test_mode_change
    BEFORE UPDATE OF test_mode ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION public.check_event_test_mode_update();

-- 6. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excluded_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draws ENABLE ROW LEVEL SECURITY;

-- Helper to verify if authenticated user has 'admin' in app_metadata
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- RLS Policies: Anonymous / Public has NO SELECT by default
-- Admin has full CRUD permissions
CREATE POLICY admin_all_events ON public.events
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY admin_all_excluded_tickets ON public.excluded_tickets
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY admin_all_prizes ON public.prizes
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY admin_all_draws ON public.draws
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 7. REALTIME PUBLICATION
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime FOR TABLE public.draws;
    ELSIF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'draws'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.draws;
    END IF;
END $$;

-- 8. STORAGE BUCKET: event-assets
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'event-assets',
            'event-assets',
            true,
            26214400, -- 25MB limit
            ARRAY[
                'image/png',
                'image/jpeg',
                'image/webp',
                'image/svg+xml',
                'audio/mpeg',
                'audio/ogg',
                'audio/wav',
                'audio/aac'
            ]
        )
        ON CONFLICT (id) DO UPDATE SET
            public = true,
            file_size_limit = 26214400,
            allowed_mime_types = EXCLUDED.allowed_mime_types;

        -- Storage bucket RLS policies
        DROP POLICY IF EXISTS "Public view event assets" ON storage.objects;
        CREATE POLICY "Public view event assets"
            ON storage.objects FOR SELECT
            TO public
            USING (bucket_id = 'event-assets');

        DROP POLICY IF EXISTS "Admin upload event assets" ON storage.objects;
        CREATE POLICY "Admin upload event assets"
            ON storage.objects FOR INSERT
            TO authenticated
            WITH CHECK (bucket_id = 'event-assets' AND public.is_admin());

        DROP POLICY IF EXISTS "Admin update event assets" ON storage.objects;
        CREATE POLICY "Admin update event assets"
            ON storage.objects FOR UPDATE
            TO authenticated
            USING (bucket_id = 'event-assets' AND public.is_admin());

        DROP POLICY IF EXISTS "Admin delete event assets" ON storage.objects;
        CREATE POLICY "Admin delete event assets"
            ON storage.objects FOR DELETE
            TO authenticated
            USING (bucket_id = 'event-assets' AND public.is_admin());
    END IF;
END $$;
