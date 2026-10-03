-- Past residents keep their record and history but give up the room, so roomId becomes optional;
-- movedOutFrom records where they lived (e.g. "Raj PG for boys · Room 103").
ALTER TABLE "Resident" ALTER COLUMN "roomId" DROP NOT NULL;
ALTER TABLE "Resident" ADD COLUMN "movedOutFrom" TEXT;
