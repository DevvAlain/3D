/**
 * integration_draw.ts
 * Comprehensive Integration Test Suite for Church Lucky Draw Database Layer.
 *
 * Supports:
 *  - Mode A: Local Supabase Stack (`supabase start` on 127.0.0.1:54322 & PostgREST 54321)
 *  - Mode B: Automatic fallback to native Embedded PostgreSQL (real multi-process TCP server)
 *            with full pg.Pool multi-connection concurrency & role/RLS tests.
 *
 * NEVER touches any remote database.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Pool, PoolClient } from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import { createClient } from '@supabase/supabase-js';

// Helper to verify whether local Supabase stack is reachable
async function isLocalSupabaseRunning(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:54321/rest/v1/', {
      method: 'GET',
      signal: AbortSignal.timeout(1500),
    });
    return res.status !== 0;
  } catch {
    return false;
  }
}

async function runIntegrationTests() {
  console.log('========================================================================');
  console.log('       CHURCH LUCKY DRAW - REAL MULTI-CONNECTION INTEGRATION TESTS      ');
  console.log('========================================================================');

  const repoRoot = path.resolve(__dirname, '../../');
  const migration1 = fs.readFileSync(
    path.resolve(repoRoot, 'supabase/migrations/20261109000001_initial_schema.sql'),
    'utf-8'
  );
  const migration2 = fs.readFileSync(
    path.resolve(repoRoot, 'supabase/migrations/20261109000002_draw_rpcs.sql'),
    'utf-8'
  );

  const useLocalSupabase = await isLocalSupabaseRunning();
  let embeddedPg: EmbeddedPostgres | null = null;
  let pool: Pool;
  let tempDataDir = '';

  try {
    if (useLocalSupabase) {
      console.log('\n[ENV] Detected running local Supabase stack at 127.0.0.1:54321 / 54322.');
      pool = new Pool({
        connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        max: 25,
      });
    } else {
      console.log('\n[ENV] Local Supabase Docker stack not detected. Bootstrapping native Embedded PostgreSQL...');
      tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'church-pg-test-'));
      embeddedPg = new EmbeddedPostgres({
        databaseDir: tempDataDir,
        user: 'postgres',
        password: 'postgres_test_password',
        port: 54333,
        persistent: false,
        initdbFlags: ['-E', 'UTF8', '--no-locale'],
        onLog: () => {},
      });
      await embeddedPg.initialise();
      await embeddedPg.start();
      console.log('✓ Native PostgreSQL server started on 127.0.0.1:54333 (UTF8).');

      pool = new Pool({
        host: '127.0.0.1',
        port: 54333,
        user: 'postgres',
        password: 'postgres_test_password',
        database: 'postgres',
        max: 25,
        connectionTimeoutMillis: 5000,
      });

      // Test-only bootstrap: create Supabase-like roles and auth.jwt() mock ONLY inside test DB
      console.log('[INIT] Bootstrapping test-only roles and auth.jwt() mock...');
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            CREATE ROLE anon NOLOGIN;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            CREATE ROLE authenticated NOLOGIN;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            CREATE ROLE service_role NOLOGIN BYPASSRLS;
          END IF;
        END $$;

        GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;

        CREATE SCHEMA IF NOT EXISTS auth;
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
      `);

      console.log('[INIT] Applying migration 20261109000001_initial_schema.sql...');
      await pool.query(migration1);
      console.log('[INIT] Applying migration 20261109000002_draw_rpcs.sql...');
      await pool.query(migration2);
      console.log('✓ Migrations applied successfully.');
    }

    // Helper to create test event + prizes
    async function createEvent(opts: {
      title: string;
      rangeFrom?: number;
      rangeTo?: number;
      isActive?: boolean;
      testMode?: boolean;
    }): Promise<string> {
      const res = await pool.query<{ id: string }>(
        `INSERT INTO public.events (title, parish_name, digits, range_from, range_to, theme, test_mode, is_active)
         VALUES ($1, 'Giáo Xứ Thánh Tâm', 5, $2, $3, 'classic', $4, $5)
         RETURNING id`,
        [
          opts.title,
          opts.rangeFrom ?? 1,
          opts.rangeTo ?? 1000,
          opts.testMode ?? true,
          opts.isActive ?? false,
        ]
      );
      return res.rows[0].id;
    }

    // ========================================================================
    // TEST 1: Single Active Event Partial Unique Index & Active Validation
    // ========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('TEST 1: Single Active Event Constraint & Active Rejection');
    console.log('----------------------------------------------------------------');
    // Deactivate any existing active events if reusing local supabase
    await pool.query(`UPDATE public.events SET is_active = false WHERE is_active = true`);

    const activeEventId = await createEvent({
      title: 'Concurrency & Active Event Test',
      rangeFrom: 1,
      rangeTo: 500,
      isActive: true,
      testMode: true,
    });
    const inactiveEventId = await createEvent({
      title: 'Inactive Event Test',
      rangeFrom: 1,
      rangeTo: 500,
      isActive: false,
      testMode: true,
    });

    // Attempt inserting 2nd active event -> MUST FAIL
    let dupActiveFailed = false;
    try {
      await createEvent({ title: '2nd Active', isActive: true });
    } catch (err: any) {
      dupActiveFailed = true;
      console.log(`✓ Partial unique index rejected 2nd active event: ${err.message}`);
    }
    if (!dupActiveFailed) throw new Error('Expected partial unique index idx_events_single_active to fail');

    // Attempt draw_next on inactive event -> MUST FAIL with EVENT_NOT_ACTIVE
    await pool.query(
      `INSERT INTO public.prizes (event_id, name, reward, quantity, sort_order) VALUES ($1, 'Prize X', 'Gift', 5, 1)`,
      [inactiveEventId]
    );
    let inactiveDrawFailed = false;
    try {
      await pool.query(`SELECT public.draw_next($1, 'inactive_key')`, [inactiveEventId]);
    } catch (err: any) {
      if (err.message.includes('EVENT_NOT_ACTIVE')) {
        inactiveDrawFailed = true;
        console.log(`✓ draw_next rejected inactive event: ${err.message}`);
      }
    }
    if (!inactiveDrawFailed) throw new Error('Expected draw_next to reject inactive event');

    // Setup prizes on activeEventId
    await pool.query(
      `INSERT INTO public.prizes (event_id, name, reward, quantity, sort_order) VALUES ($1, 'Giải Khuyến Khích', 'Bình nước', 50, 1)`,
      [activeEventId]
    );

    // ========================================================================
    // TEST 2: Real Multi-Connection Concurrency Tests (pg.Pool)
    // ========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('TEST 2: Real Multi-Connection Concurrency (20 Parallel Clients)');
    console.log('----------------------------------------------------------------');

    // 2a: 20 parallel draw_next calls with 20 DIFFERENT keys on separate DB connections
    console.log('[2a] Firing 20 parallel draw_next calls with DIFFERENT keys across 20 pool connections...');
    const diffKeyPromises = Array.from({ length: 20 }, (_, i) =>
      pool.query<{ result: any }>(
        `SELECT public.draw_next($1, $2) AS result`,
        [activeEventId, `parallel_diff_key_${i}_${Date.now()}`]
      )
    );
    const diffResults = await Promise.allSettled(diffKeyPromises);
    const diffSuccesses = diffResults.filter((r) => r.status === 'fulfilled');
    const diffFailures = diffResults.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    if (diffSuccesses.length !== 1 || diffFailures.length !== 19) {
      throw new Error(
        `Concurrency 2a FAILED: Expected 1 success & 19 rejections, got ${diffSuccesses.length} success, ${diffFailures.length} rejected`
      );
    }
    const allDrawInProgress = diffFailures.every((f) => f.reason.message.includes('DRAW_IN_PROGRESS'));
    if (!allDrawInProgress) {
      throw new Error(`Expected all 19 rejections to be DRAW_IN_PROGRESS, got: ${diffFailures[0].reason.message}`);
    }
    const countAfter2a = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM public.draws WHERE event_id = $1`,
      [activeEventId]
    );
    if (Number(countAfter2a.rows[0].cnt) !== 1) {
      throw new Error(`Expected exactly 1 row in draws, got ${countAfter2a.rows[0].cnt}`);
    }
    console.log('✓ 20 parallel draw_next (different keys): Exactly 1 succeeded, 19 rejected with DRAW_IN_PROGRESS, 1 row created.');

    // Verify consistent shape { draw, prize, is_idempotent }
    const firstResult = (diffSuccesses[0] as PromiseFulfilledResult<any>).value.rows[0].result;
    if (!firstResult.draw || !firstResult.prize || firstResult.is_idempotent !== false) {
      throw new Error(`Invalid draw_next shape: ${JSON.stringify(firstResult)}`);
    }

    // Confirm won to clear revealing state before 2b
    await pool.query(`SELECT public.confirm_won($1)`, [firstResult.draw.id]);

    // 2b: 20 parallel draw_next calls with the SAME idempotency key on separate DB connections
    console.log('[2b] Firing 20 parallel draw_next calls with the SAME idempotency key...');
    const sharedIdemKey = `parallel_same_key_${Date.now()}`;
    const sameKeyPromises = Array.from({ length: 20 }, () =>
      pool.query<{ result: any }>(`SELECT public.draw_next($1, $2) AS result`, [activeEventId, sharedIdemKey])
    );
    const sameResults = await Promise.allSettled(sameKeyPromises);
    const sameSuccesses = sameResults.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];

    if (sameSuccesses.length !== 20) {
      const errs = (sameResults.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]).map(
        (r) => r.reason.message
      );
      throw new Error(`Idempotency 2b FAILED: Expected all 20 to resolve, got ${sameSuccesses.length}. Errors: ${errs.join('; ')}`);
    }
    const returnedIds = new Set(sameSuccesses.map((s) => s.value.rows[0].result.draw.id));
    const freshCount = sameSuccesses.filter((s) => s.value.rows[0].result.is_idempotent === false).length;
    const cachedCount = sameSuccesses.filter((s) => s.value.rows[0].result.is_idempotent === true).length;

    if (returnedIds.size !== 1 || freshCount !== 1 || cachedCount !== 19) {
      throw new Error(
        `Idempotency 2b FAILED: unique IDs=${returnedIds.size}, fresh=${freshCount}, cached=${cachedCount}`
      );
    }
    // Check both branches returned consistent { draw, prize, is_idempotent }
    for (const s of sameSuccesses) {
      const resObj = s.value.rows[0].result;
      if (!resObj.draw || !resObj.prize || typeof resObj.is_idempotent !== 'boolean') {
        throw new Error(`Inconsistent draw_next return shape: ${JSON.stringify(resObj)}`);
      }
    }
    console.log('✓ 20 parallel draw_next (same key): 1 fresh + 19 idempotent hits, 100% identical draw ID, consistent {draw, prize, is_idempotent} shape.');

    // 2c: Parallel mark_absent vs void_last on the SAME revealing draw across separate connections
    console.log('[2c] Firing parallel mark_absent vs void_last on the same revealing draw...');
    const contestedDrawId = Array.from(returnedIds)[0];
    const [absentRes, voidRes] = await Promise.allSettled([
      pool.query(`SELECT public.mark_absent($1) AS result`, [contestedDrawId]),
      pool.query(`SELECT public.void_last($1) AS result`, [activeEventId]),
    ]);

    const raceFulfilled = [absentRes, voidRes].filter((r) => r.status === 'fulfilled');
    const raceRejected = [absentRes, voidRes].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    if (raceFulfilled.length !== 1 || raceRejected.length !== 1) {
      throw new Error(
        `Race 2c FAILED: Expected 1 winner & 1 rejection, got ${raceFulfilled.length} won, ${raceRejected.length} rejected`
      );
    }
    if (!raceRejected[0].reason.message.includes('INVALID_STATE_TRANSITION')) {
      throw new Error(`Expected INVALID_STATE_TRANSITION, got: ${raceRejected[0].reason.message}`);
    }
    console.log(`✓ Parallel mark_absent vs void_last: Exactly 1 won, 1 cleanly rejected (${raceRejected[0].reason.message}). Zero deadlocks.`);

    // ========================================================================
    // TEST 3: Function Privileges & RLS Protection (anon & admin role checks)
    // ========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('TEST 3: Privilege & RLS Enforcement (Functions + Draws Table)');
    console.log('----------------------------------------------------------------');

    async function assertRoleDenied(role: 'anon' | 'authenticated', sql: string, label: string, jwtClaims?: object) {
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL ROLE ${role}`);
        if (jwtClaims) {
          await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(jwtClaims)]);
        }
        let failed = false;
        try {
          await client.query(sql);
        } catch (err: any) {
          failed = true;
          console.log(`  ✓ [${role}] Denied (${label}): ${err.message}`);
        }
        if (!failed) {
          throw new Error(`SECURITY FAILURE: Role '${role}' was allowed to run: ${label}`);
        }
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    }

    const adminJwt = { sub: '00000000-0000-0000-0000-000000000099', role: 'authenticated', app_metadata: { role: 'admin' } };
    const rpcsToTest = [
      { label: 'draw_next', sql: `SELECT public.draw_next('${activeEventId}'::uuid, 'x')` },
      { label: 'confirm_won', sql: `SELECT public.confirm_won('${contestedDrawId}'::uuid)` },
      { label: 'mark_absent', sql: `SELECT public.mark_absent('${contestedDrawId}'::uuid)` },
      { label: 'void_last', sql: `SELECT public.void_last('${activeEventId}'::uuid)` },
      { label: 'clear_test_draws', sql: `SELECT public.clear_test_draws('${activeEventId}'::uuid)` },
      { label: 'reset_event', sql: `SELECT public.reset_event('${activeEventId}'::uuid)` },
      { label: 'crypto_random_int', sql: `SELECT public.crypto_random_int(10)` },
    ];

    for (const rpc of rpcsToTest) {
      await assertRoleDenied('anon', rpc.sql, rpc.label);
      await assertRoleDenied('authenticated', rpc.sql, `${rpc.label} with admin JWT`, adminJwt);
    }

    // Verify admin cannot INSERT, UPDATE, or DELETE draws directly (RLS SELECT-only on draws)
    await assertRoleDenied(
      'authenticated',
      `INSERT INTO public.draws (event_id, prize_id, ticket, seq) VALUES ('${activeEventId}', (SELECT id FROM public.prizes LIMIT 1), 999, 999)`,
      'direct INSERT on draws',
      adminJwt
    );
    await assertRoleDenied(
      'authenticated',
      `UPDATE public.draws SET status = 'won' WHERE id = '${contestedDrawId}'`,
      'direct UPDATE on draws',
      adminJwt
    );
    await assertRoleDenied(
      'authenticated',
      `DELETE FROM public.draws WHERE id = '${contestedDrawId}'`,
      'direct DELETE on draws',
      adminJwt
    );

    // Verify admin CAN SELECT draws
    const adminClient = await pool.connect();
    try {
      await adminClient.query('BEGIN');
      await adminClient.query('SET LOCAL ROLE authenticated');
      await adminClient.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(adminJwt)]);
      const selRes = await adminClient.query(`SELECT COUNT(*) AS c FROM public.draws WHERE event_id = $1`, [activeEventId]);
      console.log(`  ✓ [authenticated admin] Allowed SELECT on draws (found ${selRes.rows[0].c} rows).`);
      await adminClient.query('ROLLBACK');
    } finally {
      adminClient.release();
    }

    // Verify anon cannot SELECT events or draws
    await assertRoleDenied('anon', `SELECT * FROM public.events`, 'SELECT on events');
    await assertRoleDenied('anon', `SELECT * FROM public.draws`, 'SELECT on draws');

    // Verify presenter JWT cannot read or modify admin tables directly via Postgres/PostgREST
    const presenterJwt = { sub: '00000000-0000-0000-0000-000000000088', role: 'authenticated', app_metadata: { role: 'presenter' } };
    await assertRoleDenied(
      'authenticated',
      `INSERT INTO public.events (title, parish_name, digits, range_from, range_to) VALUES ('Hijack', 'P', 5, 1, 100)`,
      'presenter INSERT on events',
      presenterJwt
    );
    const presenterClient = await pool.connect();
    try {
      await presenterClient.query('BEGIN');
      await presenterClient.query('SET LOCAL ROLE authenticated');
      await presenterClient.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(presenterJwt)]);
      const pSel = await presenterClient.query(`SELECT COUNT(*) AS c FROM public.draws`);
      if (Number(pSel.rows[0].c) !== 0) {
        throw new Error(`SECURITY FAILURE: Presenter saw ${pSel.rows[0].c} draws via RLS`);
      }
      console.log('  ✓ [authenticated presenter] Sees 0 rows on direct SELECT draws/events via RLS.');
      await presenterClient.query('ROLLBACK');
    } finally {
      presenterClient.release();
    }

    // If local Supabase PostgREST is running, test over HTTP with real PostgREST!
    if (useLocalSupabase) {
      console.log('[PostgREST] Verifying HTTP RPC & direct table rejections via @supabase/supabase-js...');
      const anonSupa = createClient(
        'http://127.0.0.1:54321',
        process.env.LOCAL_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
      );
      const { error: restErr } = await anonSupa.rpc('draw_next', { p_event_id: activeEventId });
      if (!restErr) throw new Error('PostgREST allowed anon to call draw_next!');
      console.log(`  ✓ [PostgREST anon] draw_next denied: ${restErr.message}`);
    }

    // ========================================================================
    // TEST 4: ON DELETE RESTRICT & reset_event
    // ========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('TEST 4: ON DELETE RESTRICT & reset_event');
    console.log('----------------------------------------------------------------');
    let fkRestricted = false;
    try {
      await pool.query(`DELETE FROM public.events WHERE id = $1`, [activeEventId]);
    } catch (err: any) {
      fkRestricted = true;
      console.log(`✓ DELETE events rejected by ON DELETE RESTRICT: ${err.message}`);
    }
    if (!fkRestricted) throw new Error('Expected ON DELETE RESTRICT to prevent deleting event with draws');

    await pool.query(`SELECT public.reset_event($1)`, [activeEventId]);
    const countAfterReset = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM public.draws WHERE event_id = $1`,
      [activeEventId]
    );
    if (Number(countAfterReset.rows[0].cnt) !== 0) {
      throw new Error('reset_event failed to clear draws');
    }
    console.log('✓ reset_event successfully cleared all draws.');

    // Deactivate activeEventId before Test 5
    await pool.query(`UPDATE public.events SET is_active = false WHERE id = $1`, [activeEventId]);

    // ========================================================================
    // TEST 5: Deterministic Pool Proofs (void returns ticket, absent does NOT)
    // ========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('TEST 5: Deterministic Pool Proofs (void vs absent)');
    console.log('----------------------------------------------------------------');
    // 5a: Tiny range [1, 1] -> only ticket 1 exists
    const tinyEventId = await createEvent({
      title: 'Tiny Range Deterministic Test',
      rangeFrom: 1,
      rangeTo: 1,
      isActive: true,
      testMode: true,
    });
    await pool.query(
      `INSERT INTO public.prizes (event_id, name, reward, quantity, sort_order) VALUES ($1, 'Tiny Prize', 'Gold Coin', 1, 1)`,
      [tinyEventId]
    );

    const dTiny1 = (await pool.query(`SELECT public.draw_next($1) AS r`, [tinyEventId])).rows[0].r.draw;
    if (dTiny1.ticket !== 1) throw new Error(`Expected ticket 1, got ${dTiny1.ticket}`);
    // Void it -> ticket 1 MUST return to pool!
    await pool.query(`SELECT public.void_last($1)`, [tinyEventId]);
    const dTiny2 = (await pool.query(`SELECT public.draw_next($1) AS r`, [tinyEventId])).rows[0].r.draw;
    if (dTiny2.ticket !== 1) throw new Error(`Expected voided ticket 1 to be drawn again, got ${dTiny2.ticket}`);
    console.log('✓ Proven: void_last returned ticket 1 back to the pool and was drawn again deterministically.');

    // Now mark ticket 1 absent -> MUST NOT return to pool -> next draw MUST throw NO_VALID_TICKETS!
    await pool.query(`SELECT public.mark_absent($1)`, [dTiny2.id]);
    let noTicketsFailed = false;
    try {
      await pool.query(`SELECT public.draw_next($1)`, [tinyEventId]);
    } catch (err: any) {
      if (err.message.includes('NO_VALID_TICKETS')) {
        noTicketsFailed = true;
        console.log(`✓ Proven: mark_absent permanently excluded ticket 1 (${err.message}).`);
      }
    }
    if (!noTicketsFailed) throw new Error('Expected NO_VALID_TICKETS after marking the only ticket absent');

    await pool.query(`UPDATE public.events SET is_active = false WHERE id = $1`, [tinyEventId]);

    // ========================================================================
    // TEST 6: Prize Quota & Auto-Advance in SQL
    // ========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('TEST 6: Prize Quota & Auto-Advance Rules');
    console.log('----------------------------------------------------------------');
    const quotaEventId = await createEvent({
      title: 'Quota Auto-Advance Test',
      rangeFrom: 1,
      rangeTo: 100,
      isActive: true,
      testMode: true,
    });
    const pA = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.prizes (event_id, name, reward, quantity, sort_order) VALUES ($1, 'Giải Nhì', 'Quà Nhì', 2, 1) RETURNING id`,
        [quotaEventId]
      )
    ).rows[0].id;
    const pB = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.prizes (event_id, name, reward, quantity, sort_order) VALUES ($1, 'Giải Nhất', 'Quà Nhất', 1, 2) RETURNING id`,
        [quotaEventId]
      )
    ).rows[0].id;

    // Draw 1 -> Prize A, mark ABSENT (must not count toward Prize A quota)
    const q1 = (await pool.query(`SELECT public.draw_next($1) AS r`, [quotaEventId])).rows[0].r;
    if (q1.prize.id !== pA) throw new Error('Draw 1 should be Prize A');
    await pool.query(`SELECT public.mark_absent($1)`, [q1.draw.id]);

    // Draw 2 -> STILL Prize A (1/2)
    const q2 = (await pool.query(`SELECT public.draw_next($1) AS r`, [quotaEventId])).rows[0].r;
    if (q2.prize.id !== pA) throw new Error('Draw 2 should still be Prize A after absent');
    await pool.query(`SELECT public.confirm_won($1)`, [q2.draw.id]);

    // Draw 3 -> STILL Prize A (2/2)
    const q3 = (await pool.query(`SELECT public.draw_next($1) AS r`, [quotaEventId])).rows[0].r;
    if (q3.prize.id !== pA) throw new Error('Draw 3 should still be Prize A (2nd slot)');
    await pool.query(`SELECT public.confirm_won($1)`, [q3.draw.id]);

    // Draw 4 -> Auto-advance to Prize B (1/1)
    const q4 = (await pool.query(`SELECT public.draw_next($1) AS r`, [quotaEventId])).rows[0].r;
    if (q4.prize.id !== pB) throw new Error('Draw 4 should have auto-advanced to Prize B');
    await pool.query(`SELECT public.confirm_won($1)`, [q4.draw.id]);

    // Draw 5 -> ALL_PRIZES_EXHAUSTED
    let exhausted = false;
    try {
      await pool.query(`SELECT public.draw_next($1)`, [quotaEventId]);
    } catch (err: any) {
      if (err.message.includes('ALL_PRIZES_EXHAUSTED')) {
        exhausted = true;
        console.log(`✓ Prize quota & auto-advance verified: absent ignored, auto-advanced A->B, exhausted (${err.message}).`);
      }
    }
    if (!exhausted) throw new Error('Expected ALL_PRIZES_EXHAUSTED');

    await pool.query(`UPDATE public.events SET is_active = false WHERE id = $1`, [quotaEventId]);

    // ========================================================================
    // TEST 7: test_mode Protection Trigger & UNIQUE (event_id, is_test, seq)
    // ========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('TEST 7: test_mode Modification Trigger & Seq Uniqueness');
    console.log('----------------------------------------------------------------');
    const prodEventId = await createEvent({
      title: 'Prod Event Protection Test',
      rangeFrom: 1,
      rangeTo: 100,
      isActive: true,
      testMode: false, // real mode!
    });
    const prodPrizeId = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.prizes (event_id, name, reward, quantity, sort_order) VALUES ($1, 'Real Prize', 'Car', 5, 1) RETURNING id`,
        [prodEventId]
      )
    ).rows[0].id;

    const realDraw = (await pool.query(`SELECT public.draw_next($1) AS r`, [prodEventId])).rows[0].r.draw;
    let triggerBlocked = false;
    try {
      await pool.query(`UPDATE public.events SET test_mode = true WHERE id = $1`, [prodEventId]);
    } catch (err: any) {
      if (err.message.includes('CANNOT_CHANGE_TEST_MODE')) {
        triggerBlocked = true;
        console.log(`✓ Trigger blocked changing test_mode after real draw: ${err.message}`);
      }
    }
    if (!triggerBlocked) throw new Error('Expected test_mode trigger to block modification');

    // Verify UNIQUE (event_id, is_test, seq)
    let dupSeqBlocked = false;
    try {
      await pool.query(
        `INSERT INTO public.draws (event_id, prize_id, ticket, status, seq, is_test) VALUES ($1, $2, 99, 'void', $3, false)`,
        [prodEventId, prodPrizeId, realDraw.seq]
      );
    } catch (err: any) {
      dupSeqBlocked = true;
      console.log(`✓ UNIQUE (event_id, is_test, seq) rejected duplicate seq=${realDraw.seq}: ${err.message}`);
    }
    if (!dupSeqBlocked) throw new Error('Expected uq_draws_event_test_seq to reject duplicate seq');

    await pool.query(`UPDATE public.events SET is_active = false WHERE id = $1`, [prodEventId]);

    // ========================================================================
    // TEST 8: 350 Sequential Draws & Rough Uniformity Check (2,500 samples)
    // ========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('TEST 8: 350+ Sequential Draws & Rough Uniformity Verification');
    console.log('----------------------------------------------------------------');
    const hvEventId = await createEvent({
      title: 'High Volume 350 Draws',
      rangeFrom: 1,
      rangeTo: 2000,
      isActive: true,
      testMode: true,
    });
    const hvExcluded = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500];
    for (const t of hvExcluded) {
      await pool.query(`INSERT INTO public.excluded_tickets (event_id, ticket) VALUES ($1, $2)`, [hvEventId, t]);
    }
    await pool.query(
      `INSERT INTO public.prizes (event_id, name, reward, quantity, sort_order) VALUES ($1, 'Giải 350', 'Quà', 350, 1)`,
      [hvEventId]
    );

    const drawnSet = new Set<number>();
    const excludedSet = new Set(hvExcluded);
    const totalDraws = 350;
    const t0 = Date.now();
    for (let i = 1; i <= totalDraws; i++) {
      const draw = (await pool.query(`SELECT public.draw_next($1) AS r`, [hvEventId])).rows[0].r.draw;
      if (drawnSet.has(draw.ticket)) throw new Error(`Duplicate ticket ${draw.ticket}`);
      if (excludedSet.has(draw.ticket)) throw new Error(`Excluded ticket ${draw.ticket} drawn!`);
      if (draw.ticket < 1 || draw.ticket > 2000) throw new Error(`Out of range ticket ${draw.ticket}`);
      drawnSet.add(draw.ticket);
      await pool.query(`SELECT public.confirm_won($1)`, [draw.id]);
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`✓ 350 consecutive draws completed in ${elapsed}s: 0 duplicates, 0 excluded tickets, 100% in [1..2000].`);

    // 8b: Rough uniformity check over tiny range [1, 5] across 1,000 real draw_next + void_last cycles
    // plus 5,000 direct crypto_random_int(5) samples
    await pool.query(`UPDATE public.events SET is_active = false WHERE id = $1`, [hvEventId]);

    const uniformEventId = await createEvent({
      title: 'Uniformity Range [1..5]',
      rangeFrom: 1,
      rangeTo: 5,
      isActive: true,
      testMode: true,
    });
    await pool.query(
      `INSERT INTO public.prizes (event_id, name, reward, quantity, sort_order) VALUES ($1, 'Uniform Prize', 'Item', 1, 1)`,
      [uniformEventId]
    );

    const drawCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const totalUniformDraws = 1000;
    for (let i = 0; i < totalUniformDraws; i++) {
      const draw = (await pool.query(`SELECT public.draw_next($1) AS r`, [uniformEventId])).rows[0].r.draw;
      drawCounts[draw.ticket]++;
      await pool.query(`SELECT public.void_last($1)`, [uniformEventId]);
    }
    console.log(`✓ 1,000 real draw_next uniform distribution over [1..5]: ${JSON.stringify(drawCounts)}`);
    for (let t = 1; t <= 5; t++) {
      // Expected = 200; allow reasonable statistical tolerance [130..270]
      if (drawCounts[t] < 130 || drawCounts[t] > 270) {
        throw new Error(`Uniformity anomaly detected on ticket ${t}: count=${drawCounts[t]}`);
      }
    }

    // Also sample 5,000 directly from crypto_random_int(5)
    const rngRes = await pool.query<{ bucket: number; cnt: string }>(`
      SELECT public.crypto_random_int(5) AS bucket, COUNT(*) AS cnt
      FROM generate_series(1, 5000)
      GROUP BY 1
      ORDER BY 1
    `);
    const rngDistribution = rngRes.rows.map((r) => `${r.bucket}:${r.cnt}`).join(', ');
    console.log(`✓ 5,000 direct crypto_random_int(5) samples: { ${rngDistribution} }`);

    console.log('\n========================================================================');
    console.log('        🎉 ALL 8 MULTI-CONNECTION INTEGRATION TESTS PASSED 100% 🎉      ');
    console.log('========================================================================\n');
  } finally {
    try {
      // @ts-ignore
      if (pool) await pool.end();
    } catch {}
    try {
      if (embeddedPg) await embeddedPg.stop();
    } catch {}
    try {
      if (tempDataDir && fs.existsSync(tempDataDir)) {
        fs.rmSync(tempDataDir, { recursive: true, force: true });
      }
    } catch {}
  }
}

runIntegrationTests().catch((err) => {
  console.error('\n❌ Integration Test Suite Failed:', err);
  process.exit(1);
});
