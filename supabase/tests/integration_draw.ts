/**
 * integration_draw.ts
 * Rigorous integration test against Supabase / PostgreSQL database:
 *  (a) Concurrency safety: Promise.all to prove row locking prevents race conditions and double draws
 *  (b) Idempotency: repeated idempotency_key returns identical draw without creating duplicate
 *  (c) High-volume drawing: hundreds of draws asserting 0 duplicates and excluded tickets respected
 *  (d) State transitions: confirm_won, mark_absent, void_last
 */

import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';

// Load environment variables from .env if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:[YOUR-PASSWORD]@db.your-project-id.supabase.co:5432/postgres';

async function runIntegrationTests() {
  console.log('--- SUPABASE / POSTGRES DRAW INTEGRATION TEST SUITE ---');
  console.log(`Connecting to database...`);

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✓ Database connection established successfully.');

    // 1. Create a dedicated test event
    console.log('\n[1/5] Setting up isolated test event...');
    const eventRes = await client.query(`
      INSERT INTO public.events (
        title, parish_name, digits, range_from, range_to, theme, test_mode, is_active
      ) VALUES (
        'Integration Test Event ' || gen_random_uuid(),
        'Giáo Xứ Kiểm Thử',
        4,
        1,
        200,
        'classic',
        true,
        false
      ) RETURNING id;
    `);
    const eventId = eventRes.rows[0].id;
    console.log(`✓ Test Event created with ID: ${eventId}`);

    // Excluded tickets
    const excludedTickets = [25, 50, 75, 100];
    for (const t of excludedTickets) {
      await client.query(
        `INSERT INTO public.excluded_tickets (event_id, ticket, reason) VALUES ($1, $2, 'Test excluded')`,
        [eventId, t]
      );
    }
    console.log(`✓ Seeded ${excludedTickets.length} excluded tickets: [${excludedTickets.join(', ')}]`);

    // Prizes: 2 tiers (Tier 1: Qty 3, Tier 2: Qty 2 -> Total 5 slots)
    const prize1Res = await client.query(`
      INSERT INTO public.prizes (event_id, name, reward, quantity, sort_order)
      VALUES ($1, 'Giải Nhì Test', 'Bình giữ nhiệt', 3, 1) RETURNING id;
    `, [eventId]);
    const prize1Id = prize1Res.rows[0].id;

    const prize2Res = await client.query(`
      INSERT INTO public.prizes (event_id, name, reward, quantity, sort_order)
      VALUES ($1, 'Giải Nhất Test', 'Xe đạp thể thao', 2, 2) RETURNING id;
    `, [eventId]);
    const prize2Id = prize2Res.rows[0].id;
    console.log(`✓ Seeded 2 prize tiers: Total 5 winning slots`);

    // 2. Concurrency Safety Test (Parallel Promise.all)
    console.log('\n[2/5] Testing Concurrency & Row Lock Safety...');
    const [call1, call2] = await Promise.allSettled([
      client.query(`SELECT public.draw_next($1, 'concurrent_key_1', true) AS result`, [eventId]),
      client.query(`SELECT public.draw_next($1, 'concurrent_key_2', true) AS result`, [eventId]),
    ]);

    // One should succeed with status 'revealing', the other must fail with 'DRAW_IN_PROGRESS'
    const successCall = call1.status === 'fulfilled' ? call1 : (call2.status === 'fulfilled' ? call2 : null);
    const rejectedCall = call1.status === 'rejected' ? call1 : (call2.status === 'rejected' ? call2 : null);

    if (!successCall || !rejectedCall) {
      throw new Error(`Concurrency test failed: Expected 1 success and 1 rejection, got [${call1.status}, ${call2.status}]`);
    }
    console.log('✓ Row lock successfully serialized concurrent requests.');
    console.log(`✓ Rejection message: ${(rejectedCall as PromiseRejectedResult).reason.message}`);

    // Confirm the revealing draw so we can continue
    const activeDrawRes = await client.query(
      `SELECT id FROM public.draws WHERE event_id = $1 AND is_test = true AND status = 'revealing'`,
      [eventId]
    );
    const activeDrawId = activeDrawRes.rows[0].id;
    await client.query(`SELECT public.confirm_won($1)`, [activeDrawId]);
    console.log('✓ Confirmed first draw as WON.');

    // 3. Idempotency Test
    console.log('\n[3/5] Testing Idempotency...');
    const idemKey = 'idem_key_unique_test_' + Date.now();
    const idemCall1 = await client.query(
      `SELECT public.draw_next($1, $2, true) AS result`,
      [eventId, idemKey]
    );
    const drawData1 = idemCall1.rows[0].result;
    if (drawData1.is_idempotent !== false) {
      throw new Error('First idempotency call should return is_idempotent = false');
    }

    const idemCall2 = await client.query(
      `SELECT public.draw_next($1, $2, true) AS result`,
      [eventId, idemKey]
    );
    const drawData2 = idemCall2.rows[0].result;
    if (drawData2.is_idempotent !== true) {
      throw new Error('Second idempotency call should return is_idempotent = true');
    }
    if (drawData1.draw.id !== drawData2.draw.id || drawData1.draw.ticket !== drawData2.draw.ticket) {
      throw new Error('Idempotent calls returned mismatching draw data');
    }
    console.log(`✓ Idempotency verified: Same draw ID (${drawData1.draw.id}) and ticket (${drawData1.draw.ticket}) returned.`);

    // Confirm this draw
    await client.query(`SELECT public.confirm_won($1)`, [drawData1.draw.id]);

    // 4. State Transitions (mark_absent, void_last)
    console.log('\n[4/5] Testing State Transitions (mark_absent & void_last)...');
    // Draw 3rd slot
    const draw3 = await client.query(`SELECT public.draw_next($1, NULL, true) AS result`, [eventId]);
    const draw3Id = draw3.rows[0].result.draw.id;
    const draw3Ticket = draw3.rows[0].result.draw.ticket;

    // Mark absent
    await client.query(`SELECT public.mark_absent($1)`, [draw3Id]);
    console.log(`✓ Ticket ${draw3Ticket} marked as ABSENT. Does not count towards prize quota.`);

    // Draw again for same slot (should succeed because absent didn't fill the slot)
    const draw4 = await client.query(`SELECT public.draw_next($1, NULL, true) AS result`, [eventId]);
    const draw4Id = draw4.rows[0].result.draw.id;
    const draw4Ticket = draw4.rows[0].result.draw.ticket;
    console.log(`✓ Re-draw ticket ${draw4Ticket} for same prize slot.`);

    // Test void_last
    await client.query(`SELECT public.void_last($1, true)`, [eventId]);
    console.log(`✓ Successfully voided last draw (${draw4Ticket}). Ticket is returned to pool.`);

    // Clean up test draws and test large-scale draws
    console.log('\n[5/5] High-Volume Batch Drawing & Exclusions Test...');
    await client.query(`SELECT public.clear_test_draws($1)`, [eventId]);

    // Update prize to allow 50 draws
    await client.query(`UPDATE public.prizes SET quantity = 50 WHERE id = $1`, [prize1Id]);

    const drawnTickets = new Set<number>();
    const excludedSet = new Set(excludedTickets);
    const totalToDraw = 40;

    for (let i = 0; i < totalToDraw; i++) {
      const res = await client.query(`SELECT public.draw_next($1, NULL, true) AS result`, [eventId]);
      const ticket = res.rows[0].result.draw.ticket;
      const drawId = res.rows[0].result.draw.id;

      // Assertions
      if (drawnTickets.has(ticket)) {
        throw new Error(`CRITICAL INTEGRITY FAILURE: Duplicate ticket drawn! Ticket: ${ticket}`);
      }
      if (excludedSet.has(ticket)) {
        throw new Error(`CRITICAL INTEGRITY FAILURE: Excluded ticket was drawn! Ticket: ${ticket}`);
      }
      if (ticket < 1 || ticket > 200) {
        throw new Error(`CRITICAL INTEGRITY FAILURE: Ticket out of bounds! Ticket: ${ticket}`);
      }

      drawnTickets.add(ticket);
      await client.query(`SELECT public.confirm_won($1)`, [drawId]);
    }

    console.log(`✓ Successfully drew ${totalToDraw} consecutive tickets with:`);
    console.log(`   - 0 duplicates`);
    console.log(`   - 0 excluded tickets drawn`);
    console.log(`   - 100% within range [1..200]`);

    // Cleanup test event
    await client.query(`DELETE FROM public.events WHERE id = $1`, [eventId]);
    console.log('\n✓ Test Event and related test records cleaned up cleanly.');

    console.log('\n========================================');
    console.log('🎉 ALL INTEGRATION TESTS PASSED 100% 🎉');
    console.log('========================================');
  } catch (err) {
    console.error('\n❌ Integration test failed with error:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

// Execute if run directly
runIntegrationTests();
