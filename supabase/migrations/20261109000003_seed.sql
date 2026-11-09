-- ==============================================================================
-- 00003_seed.sql
-- Seed Demo Data: 5 digits, range 1-3000, 4 prize tiers (10 Ba, 5 Nhì, 3 Nhất, 1 Đặc biệt)
-- ==============================================================================

DO $$
DECLARE
    v_event_id UUID;
BEGIN
    -- Check if seed event already exists
    SELECT id INTO v_event_id
    FROM public.events
    WHERE title = 'Đại Hội Giáo Xứ 2026 - Lễ Hội Quay Số May Mắn'
    LIMIT 1;

    IF v_event_id IS NULL THEN
        -- 1. Insert Event
        INSERT INTO public.events (
            id,
            title,
            parish_name,
            logo_url,
            digits,
            range_from,
            range_to,
            theme,
            primary_color,
            bg_music_url,
            test_mode,
            status,
            is_active
        ) VALUES (
            'a0000000-0000-0000-0000-000000000001'::UUID,
            'Đại Hội Giáo Xứ 2026 - Lễ Hội Quay Số May Mắn',
            'Giáo Xứ Thánh Tâm',
            NULL,
            5,
            1,
            3000,
            'classic',
            '#F5C451',
            NULL,
            false,
            'ready',
            true
        )
        RETURNING id INTO v_event_id;

        -- 2. Insert Sample Excluded Tickets (Cancelled / Unissued)
        INSERT INTO public.excluded_tickets (event_id, ticket, reason) VALUES
            (v_event_id, 13, 'Vé rách do bảo quản'),
            (v_event_id, 500, 'Tập vé không phát hành'),
            (v_event_id, 777, 'Vé nhà tài trợ giữ làm kỷ niệm'),
            (v_event_id, 1000, 'Vé thu hồi hủy trước giờ quay'),
            (v_event_id, 2500, 'Vé in lỗi mã vạch');

        -- 3. Insert Prizes (Drawn from lowest to highest: Ba -> Nhì -> Nhất -> Đặc Biệt)
        INSERT INTO public.prizes (event_id, name, reward, quantity, sort_order) VALUES
            (
                v_event_id,
                'Giải Ba',
                'Nồi chiên không dầu Philips 5.6L',
                10,
                1
            ),
            (
                v_event_id,
                'Giải Nhì',
                'Tủ lạnh Inverter Panasonic 300L',
                5,
                2
            ),
            (
                v_event_id,
                'Giải Nhất',
                'Xe máy Honda Vision 2026 Smartkey',
                3,
                3
            ),
            (
                v_event_id,
                'Giải Đặc Biệt',
                'Xe máy Honda SH 150i ABS 2026',
                1,
                4
            );
    END IF;
END $$;
