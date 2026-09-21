-- Promote the earliest existing ADMIN (the original bootstrap account) to
-- SUPER_ADMIN. On a brand-new database with no admins yet, this is a no-op -
-- the seed script creates the first account directly as SUPER_ADMIN.
-- Split into its own migration (after the enum value migration) because
-- Postgres does not allow a newly-added enum value to be referenced in the
-- same transaction that added it.
UPDATE "users"
SET "role" = 'SUPER_ADMIN'
WHERE "id" = (
  SELECT "id" FROM "users" WHERE "role" = 'ADMIN' ORDER BY "createdAt" ASC LIMIT 1
);

-- Hard DB-level guarantee that only one SUPER_ADMIN can ever exist, on top
-- of the application never exposing a way to create a second one.
CREATE UNIQUE INDEX "users_single_super_admin" ON "users" ("role") WHERE "role" = 'SUPER_ADMIN';
