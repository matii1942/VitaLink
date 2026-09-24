-- An admission now has three states rather than two: in a bed, waiting for a
-- critical care bed, or ended somewhere. See docs/decisions/0009.
--
-- No backfill. Rows already here have a discharge with no destination, which
-- the next synchronisation fills: the source system is the authority for where
-- a patient went, and the upserts are keyed on the hospital's own identifiers,
-- so running the sync again is enough. Writing 'home' into every past discharge
-- would be inventing data in the one field whose whole job is to say whether
-- the patient went home or to intensive care.

-- AlterTable
ALTER TABLE "Admission" ADD COLUMN "dischargeDestination" TEXT,
ADD COLUMN "transferUnit" TEXT,
ADD COLUMN "transferRequestedAt" TIMESTAMPTZ(3);
