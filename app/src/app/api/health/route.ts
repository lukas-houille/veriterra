import { NextResponse } from 'next/server';
import { prisma } from '@veriterra/db';
import { getRedisConnection } from '@veriterra/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// US-0.3 health check: verifies the app can reach Postgres (as the restricted role) and
// Redis. Returns 200 only if both are reachable, otherwise 503.
export async function GET() {
  const checks = { db: false, redis: false };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = true;
  } catch (err) {
    console.error('[health] db check failed:', err);
  }

  try {
    const pong = await getRedisConnection().ping();
    checks.redis = pong === 'PONG';
  } catch (err) {
    console.error('[health] redis check failed:', err);
  }

  const ok = checks.db && checks.redis;
  return NextResponse.json({ status: ok ? 'ok' : 'degraded', checks }, { status: ok ? 200 : 503 });
}
