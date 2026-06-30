import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPingQueue } from '@/lib/queues';

export const runtime = 'nodejs';

// Enqueues the Tranche-0 no-op `ping` job to prove the app -> Redis -> worker pipeline.
// Requires a session: the job carries the tenant's organisationId.
export async function POST() {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const job = await getPingQueue().add('ping', {
    organizationId: session.user.orgId,
    echo: 'hi',
  });

  return NextResponse.json({ enqueued: job.id });
}
