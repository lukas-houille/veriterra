-- Veriterra, invitations multi-membres. Nouvelle table `Invitation` scopée au tenant (RLS).
-- Réversible : rien ne dépend encore de cette table (DROP TABLE + DROP TYPE suffisent à annuler).

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" UUID,
    "acceptedByUserId" UUID,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invitation_organisationId_idx" ON "Invitation"("organisationId");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_organisationId_email_key" ON "Invitation"("organisationId", "email");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (isolation tenant), ENABLE + FORCE, fail-closed comme les autres tables scopées. Le rôle
-- applicatif restreint hérite du DML via les ALTER DEFAULT PRIVILEGES posés à la migration RLS ;
-- la gestion (créer/révoquer) passe par les clients scopés, l'acceptation au login par le rôle
-- privilégié (qui franchit la frontière tenant, comme le bootstrap d'organisation).
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Invitation"
  USING ("organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
