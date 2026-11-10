-- ==============================================================================
-- 000004_prize_speed_mode.sql
-- Adds per-prize reveal speed mode: 'fast' (~8s) vs 'full' (~17s).
-- NULL resolves automatically based on prize tier rank (full for top prizes, fast for smaller ones).
-- ==============================================================================

ALTER TABLE public.prizes
    ADD COLUMN IF NOT EXISTS speed_mode TEXT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_prize_speed_mode'
          AND conrelid = 'public.prizes'::regclass
    ) THEN
        ALTER TABLE public.prizes
            ADD CONSTRAINT chk_prize_speed_mode
            CHECK (speed_mode IS NULL OR speed_mode IN ('fast', 'full'));
    END IF;
END $$;
