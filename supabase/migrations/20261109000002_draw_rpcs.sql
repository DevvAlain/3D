-- ==============================================================================
-- 00002_draw_rpcs.sql
-- Transactional Lucky Draw RPC Functions with Cryptographically Secure RNG
-- ==============================================================================

-- 1. Helper Function: Uniform Random Bigint in [0, p_max) using pgcrypto & Rejection Sampling
-- Eliminates modulo bias completely. Uses 64-bit BIGINT (2^32 = 4294967296 overflows 32-bit int).
CREATE OR REPLACE FUNCTION public.crypto_random_int(p_max BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_limit BIGINT;
    v_rand BIGINT;
    c_m CONSTANT BIGINT := 4294967296; -- 2^32 (strictly in 64-bit signed BIGINT)
BEGIN
    IF p_max <= 0 THEN
        RAISE EXCEPTION 'crypto_random_int: p_max must be positive, got %', p_max;
    END IF;

    IF p_max = 1 THEN
        RETURN 0;
    END IF;

    -- Calculate upper bound for rejection sampling: M - (M % p_max)
    v_limit := c_m - (c_m % p_max);

    LOOP
        -- Read 4 cryptographically secure random bytes from extensions schema as unsigned 32-bit int
        v_rand := ('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::BIGINT;
        
        -- Reject values in the biased tail [v_limit, c_m)
        IF v_rand < v_limit THEN
            RETURN (v_rand % p_max)::BIGINT;
        END IF;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.crypto_random_int(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crypto_random_int(BIGINT) TO service_role;

-- 2. Main RPC: draw_next
-- Derives is_test directly from events.test_mode. Rejects if event is not active.
-- Atomically locks event, checks revealing state, determines next prize quota,
-- computes valid ticket pool, picks ticket uniformly without bias, records draw.
-- Returns consistent JSON shape in all branches: { draw, prize, is_idempotent }.
CREATE OR REPLACE FUNCTION public.draw_next(
    p_event_id UUID,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_event public.events%ROWTYPE;
    v_prize public.prizes%ROWTYPE;
    v_existing_draw public.draws%ROWTYPE;
    v_new_draw public.draws%ROWTYPE;
    v_is_test BOOLEAN;
    v_valid_count BIGINT;
    v_k BIGINT;
    v_chosen_ticket INT;
    v_next_seq INT;
    v_clean_key TEXT;
BEGIN
    -- 1. Lock the event row to serialize all draws & state transitions
    SELECT * INTO v_event
    FROM public.events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'EVENT_NOT_FOUND: Sự kiện không tồn tại (id: %)', p_event_id;
    END IF;

    IF NOT v_event.is_active THEN
        RAISE EXCEPTION 'EVENT_NOT_ACTIVE: Sự kiện chưa được kích hoạt (is_active = false)';
    END IF;

    -- Derive is_test strictly from event configuration
    v_is_test := v_event.test_mode;
    v_clean_key := NULLIF(trim(p_idempotency_key), '');

    -- 2. Idempotency Check: if key provided and draw exists, return consistent { draw, prize, is_idempotent }
    IF v_clean_key IS NOT NULL THEN
        SELECT d.* INTO v_existing_draw
        FROM public.draws d
        WHERE d.event_id = p_event_id
          AND d.is_test = v_is_test
          AND d.idempotency_key = v_clean_key;

        IF FOUND THEN
            SELECT p.* INTO v_prize
            FROM public.prizes p
            WHERE p.id = v_existing_draw.prize_id;

            RETURN jsonb_build_object(
                'draw', row_to_json(v_existing_draw),
                'prize', row_to_json(v_prize),
                'is_idempotent', true
            );
        END IF;
    END IF;

    -- 3. Safety Check: Reject if there is already an unfinished 'revealing' draw
    IF EXISTS (
        SELECT 1 FROM public.draws
        WHERE event_id = p_event_id
          AND is_test = v_is_test
          AND status = 'revealing'
    ) THEN
        RAISE EXCEPTION 'DRAW_IN_PROGRESS: Đang có lượt quay chưa hoàn tất xác nhận (trạng thái revealing)';
    END IF;

    -- 4. Determine Active Prize: lowest sort_order where (won + revealing) < quantity
    SELECT p.* INTO v_prize
    FROM public.prizes p
    LEFT JOIN (
        SELECT prize_id, COUNT(*) AS filled_count
        FROM public.draws
        WHERE event_id = p_event_id
          AND is_test = v_is_test
          AND status IN ('revealing', 'won')
        GROUP BY prize_id
    ) quota ON quota.prize_id = p.id
    WHERE p.event_id = p_event_id
      AND COALESCE(quota.filled_count, 0) < p.quantity
    ORDER BY p.sort_order ASC, p.created_at ASC
    LIMIT 1
    FOR UPDATE OF p;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ALL_PRIZES_EXHAUSTED: Đã quay hết tất cả các giải thưởng theo cơ cấu';
    END IF;

    -- 5. Count Valid Ticket Pool
    -- Anti-join over generate_series minus excluded_tickets minus tickets in status (revealing, won, absent)
    SELECT COUNT(*)
    INTO v_valid_count
    FROM generate_series(v_event.range_from, v_event.range_to) AS gs(num)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.excluded_tickets et
        WHERE et.event_id = p_event_id AND et.ticket = gs.num
    )
    AND NOT EXISTS (
        SELECT 1 FROM public.draws d
        WHERE d.event_id = p_event_id
          AND d.is_test = v_is_test
          AND d.ticket = gs.num
          AND d.status IN ('revealing', 'won', 'absent')
    );

    IF v_valid_count = 0 THEN
        RAISE EXCEPTION 'NO_VALID_TICKETS: Không còn vé hợp lệ nào trong dải số từ % đến %', v_event.range_from, v_event.range_to;
    END IF;

    -- 6. Sample Uniform Random Index k in [0, v_valid_count) without modulo bias
    v_k := public.crypto_random_int(v_valid_count);

    -- 7. Fetch the k-th valid ticket using deterministic ORDER BY before OFFSET
    SELECT gs.num
    INTO v_chosen_ticket
    FROM generate_series(v_event.range_from, v_event.range_to) AS gs(num)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.excluded_tickets et
        WHERE et.event_id = p_event_id AND et.ticket = gs.num
    )
    AND NOT EXISTS (
        SELECT 1 FROM public.draws d
        WHERE d.event_id = p_event_id
          AND d.is_test = v_is_test
          AND d.ticket = gs.num
          AND d.status IN ('revealing', 'won', 'absent')
    )
    ORDER BY gs.num ASC
    OFFSET v_k LIMIT 1;

    -- 8. Compute Next Sequential Number
    SELECT COALESCE(MAX(seq), 0) + 1
    INTO v_next_seq
    FROM public.draws
    WHERE event_id = p_event_id
      AND is_test = v_is_test;

    -- 9. Insert Draw Record
    INSERT INTO public.draws (
        event_id,
        prize_id,
        ticket,
        status,
        seq,
        idempotency_key,
        is_test
    ) VALUES (
        p_event_id,
        v_prize.id,
        v_chosen_ticket,
        'revealing',
        v_next_seq,
        v_clean_key,
        v_is_test
    )
    RETURNING * INTO v_new_draw;

    -- 10. Return Consistent Composite Object: { draw, prize, is_idempotent }
    RETURN jsonb_build_object(
        'draw', row_to_json(v_new_draw),
        'prize', row_to_json(v_prize),
        'is_idempotent', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.draw_next(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.draw_next(UUID, TEXT) TO service_role;

-- 3. RPC: confirm_won
-- Transitions a draw from 'revealing' to 'won'
-- Always acquires lock on parent event row FIRST to prevent deadlocks and serialize with draw_next/void_last.
CREATE OR REPLACE FUNCTION public.confirm_won(p_draw_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_event_id UUID;
    v_draw public.draws%ROWTYPE;
BEGIN
    -- Look up event_id without lock first
    SELECT event_id INTO v_event_id
    FROM public.draws
    WHERE id = p_draw_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DRAW_NOT_FOUND: Lượt quay không tồn tại (id: %)', p_draw_id;
    END IF;

    -- Lock hierarchy: ALWAYS lock parent events row BEFORE draws row
    PERFORM 1 FROM public.events WHERE id = v_event_id FOR UPDATE;

    -- Lock the draw row now that we hold the event lock
    SELECT * INTO v_draw
    FROM public.draws
    WHERE id = p_draw_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DRAW_NOT_FOUND: Lượt quay không tồn tại (id: %)', p_draw_id;
    END IF;

    IF v_draw.status <> 'revealing' THEN
        RAISE EXCEPTION 'INVALID_STATE_TRANSITION: Chỉ có thể xác nhận trúng thưởng khi đang ở trạng thái revealing (hiện tại: %)', v_draw.status;
    END IF;

    UPDATE public.draws
    SET status = 'won', updated_at = now()
    WHERE id = p_draw_id
    RETURNING * INTO v_draw;

    RETURN jsonb_build_object('success', true, 'draw', row_to_json(v_draw));
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_won(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_won(UUID) TO service_role;

-- 4. RPC: mark_absent
-- Transitions a draw from 'revealing' to 'absent'
-- Always acquires lock on parent event row FIRST to prevent deadlocks and serialize with draw_next/void_last.
-- Ticket remains permanently excluded, does NOT count toward prize quota.
CREATE OR REPLACE FUNCTION public.mark_absent(p_draw_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_event_id UUID;
    v_draw public.draws%ROWTYPE;
BEGIN
    -- Look up event_id without lock first
    SELECT event_id INTO v_event_id
    FROM public.draws
    WHERE id = p_draw_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DRAW_NOT_FOUND: Lượt quay không tồn tại (id: %)', p_draw_id;
    END IF;

    -- Lock hierarchy: ALWAYS lock parent events row BEFORE draws row
    PERFORM 1 FROM public.events WHERE id = v_event_id FOR UPDATE;

    -- Lock the draw row now that we hold the event lock
    SELECT * INTO v_draw
    FROM public.draws
    WHERE id = p_draw_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DRAW_NOT_FOUND: Lượt quay không tồn tại (id: %)', p_draw_id;
    END IF;

    IF v_draw.status <> 'revealing' THEN
        RAISE EXCEPTION 'INVALID_STATE_TRANSITION: Chỉ có thể đánh dấu vắng mặt khi đang ở trạng thái revealing (hiện tại: %)', v_draw.status;
    END IF;

    UPDATE public.draws
    SET status = 'absent', updated_at = now()
    WHERE id = p_draw_id
    RETURNING * INTO v_draw;

    RETURN jsonb_build_object('success', true, 'draw', row_to_json(v_draw));
END;
$$;

REVOKE ALL ON FUNCTION public.mark_absent(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_absent(UUID) TO service_role;

-- 5. RPC: void_last
-- Derives is_test from events.test_mode.
-- Voids ONLY the latest draw for this event & mode. Allowed only from 'revealing' or 'won'.
-- Locks parent event row FIRST to serialize with draw_next / mark_absent / confirm_won.
-- Ticket is returned to the pool because status becomes 'void'.
CREATE OR REPLACE FUNCTION public.void_last(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_event public.events%ROWTYPE;
    v_draw public.draws%ROWTYPE;
BEGIN
    -- Lock parent event row FIRST
    SELECT * INTO v_event
    FROM public.events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'EVENT_NOT_FOUND: Sự kiện không tồn tại (id: %)', p_event_id;
    END IF;

    -- Find and lock the latest draw for the derived test_mode
    SELECT * INTO v_draw
    FROM public.draws
    WHERE event_id = p_event_id
      AND is_test = v_event.test_mode
    ORDER BY seq DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NO_DRAWS_TO_VOID: Chưa có lượt quay nào trong sự kiện để hủy';
    END IF;

    IF v_draw.status NOT IN ('revealing', 'won') THEN
        RAISE EXCEPTION 'INVALID_STATE_TRANSITION: Chỉ có thể hủy lượt quay mới nhất đang ở trạng thái revealing hoặc won (hiện tại: %)', v_draw.status;
    END IF;

    UPDATE public.draws
    SET status = 'void', updated_at = now()
    WHERE id = v_draw.id
    RETURNING * INTO v_draw;

    RETURN jsonb_build_object('success', true, 'draw', row_to_json(v_draw));
END;
$$;

REVOKE ALL ON FUNCTION public.void_last(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_last(UUID) TO service_role;

-- 6. RPC: clear_test_draws
-- Resets only test mode draws for an event
CREATE OR REPLACE FUNCTION public.clear_test_draws(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_deleted_count INT;
BEGIN
    -- Lock parent event row
    PERFORM 1 FROM public.events WHERE id = p_event_id FOR UPDATE;

    DELETE FROM public.draws
    WHERE event_id = p_event_id
      AND is_test = true;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'deleted_count', v_deleted_count);
END;
$$;

REVOKE ALL ON FUNCTION public.clear_test_draws(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_test_draws(UUID) TO service_role;

-- 7. RPC: reset_event
-- Deliberate reset of all draw history for an event (protected by service_role only)
CREATE OR REPLACE FUNCTION public.reset_event(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_deleted_count INT;
BEGIN
    -- Lock parent event row
    PERFORM 1 FROM public.events WHERE id = p_event_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'EVENT_NOT_FOUND: Sự kiện không tồn tại (id: %)', p_event_id;
    END IF;

    DELETE FROM public.draws
    WHERE event_id = p_event_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'deleted_draws', v_deleted_count);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_event(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_event(UUID) TO service_role;
