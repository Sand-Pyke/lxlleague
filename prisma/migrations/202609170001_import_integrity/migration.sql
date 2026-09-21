ALTER TABLE "PlayerProfile"
  ALTER COLUMN "puuid" DROP DEFAULT,
  ALTER COLUMN "puuid" DROP NOT NULL;

-- Empty strings were used before the LCU importer existed. Convert them to NULL
-- so PostgreSQL can enforce uniqueness for the actual Riot PUUID values.
UPDATE "PlayerProfile" SET "puuid" = NULL WHERE "puuid" = '';

CREATE UNIQUE INDEX "PlayerProfile_puuid_key" ON "PlayerProfile"("puuid");
