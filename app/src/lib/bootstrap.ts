import { admin, type Role } from '@veriterra/db';

export interface OidcProfileSubset {
  sub: string;
  email?: string | null;
  name?: string | null;
}

export interface TenantContext {
  userId: string;
  orgId: string;
  role: Role;
}

/**
 * Idempotent first-login bootstrap. Upserts the user keyed on the OIDC subject (never
 * the email, which is mutable) and, on first login, silently creates their personal
 * organisation with an OWNER membership. Runs through the privileged `admin` client
 * because it crosses the tenant boundary by definition. Returns the tenant context the
 * `jwt` callback bakes into the token.
 */
export async function bootstrapUserOrganisation(profile: OidcProfileSubset): Promise<TenantContext> {
  const user = await admin.user.upsert({
    where: { oidcSubject: profile.sub },
    update: { email: profile.email ?? null, name: profile.name ?? null },
    create: {
      oidcSubject: profile.sub,
      email: profile.email ?? null,
      name: profile.name ?? null,
    },
  });

  let membership = await admin.membership.findFirst({ where: { userId: user.id } });
  if (!membership) {
    const organisation = await admin.organisation.create({
      data: { name: user.email ?? user.oidcSubject },
    });
    membership = await admin.membership.create({
      data: { userId: user.id, organisationId: organisation.id, role: 'OWNER' },
    });
  }

  return { userId: user.id, orgId: membership.organisationId, role: membership.role };
}
