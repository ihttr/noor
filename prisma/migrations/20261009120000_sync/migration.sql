-- Phase 9: sync cursor (DECISIONS D-016, D-061) and notes only in "note" (D-046).

-- One sequence orders every change of every synced table; the sync cursor is its last value.
CREATE SEQUENCE "sync_seq";

-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "serverSeq" BIGINT NOT NULL DEFAULT nextval('sync_seq'::regclass);

-- AlterTable
ALTER TABLE "reading_position" ADD COLUMN     "serverSeq" BIGINT NOT NULL DEFAULT nextval('sync_seq'::regclass);

-- AlterTable
ALTER TABLE "reading_day" ADD COLUMN     "serverSeq" BIGINT NOT NULL DEFAULT nextval('sync_seq'::regclass);

-- AlterTable
ALTER TABLE "collection" ADD COLUMN     "serverSeq" BIGINT NOT NULL DEFAULT nextval('sync_seq'::regclass);

-- AlterTable
ALTER TABLE "saved_item" DROP COLUMN "note",
ADD COLUMN     "serverSeq" BIGINT NOT NULL DEFAULT nextval('sync_seq'::regclass);

-- AlterTable
ALTER TABLE "note" ADD COLUMN     "serverSeq" BIGINT NOT NULL DEFAULT nextval('sync_seq'::regclass);

-- AlterTable
ALTER TABLE "memorization_item" ADD COLUMN     "serverSeq" BIGINT NOT NULL DEFAULT nextval('sync_seq'::regclass);

-- AlterTable
ALTER TABLE "goal" ADD COLUMN     "serverSeq" BIGINT NOT NULL DEFAULT nextval('sync_seq'::regclass);

-- AlterTable
ALTER TABLE "adhkar_day" ADD COLUMN     "serverSeq" BIGINT NOT NULL DEFAULT nextval('sync_seq'::regclass);

-- AlterTable
ALTER TABLE "tasbih_session" ADD COLUMN     "serverSeq" BIGINT NOT NULL DEFAULT nextval('sync_seq'::regclass);

-- CreateIndex
CREATE INDEX "user_preferences_userId_serverSeq_idx" ON "user_preferences"("userId", "serverSeq");

-- CreateIndex
CREATE INDEX "reading_position_userId_serverSeq_idx" ON "reading_position"("userId", "serverSeq");

-- CreateIndex
CREATE INDEX "reading_day_userId_serverSeq_idx" ON "reading_day"("userId", "serverSeq");

-- CreateIndex
CREATE INDEX "collection_userId_serverSeq_idx" ON "collection"("userId", "serverSeq");

-- CreateIndex
CREATE INDEX "saved_item_userId_serverSeq_idx" ON "saved_item"("userId", "serverSeq");

-- CreateIndex
CREATE INDEX "note_userId_serverSeq_idx" ON "note"("userId", "serverSeq");

-- CreateIndex
CREATE INDEX "memorization_item_userId_serverSeq_idx" ON "memorization_item"("userId", "serverSeq");

-- CreateIndex
CREATE INDEX "goal_userId_serverSeq_idx" ON "goal"("userId", "serverSeq");

-- One goal per start date (sync natural key, D-061)
DROP INDEX "goal_userId_activeFrom_idx";
CREATE UNIQUE INDEX "goal_userId_activeFrom_key" ON "goal"("userId", "activeFrom");

-- CreateIndex
CREATE INDEX "adhkar_day_userId_serverSeq_idx" ON "adhkar_day"("userId", "serverSeq");

-- CreateIndex
CREATE INDEX "tasbih_session_userId_serverSeq_idx" ON "tasbih_session"("userId", "serverSeq");


-- Every insert and update takes a new sequence number, so a pull returns exactly the rows
-- changed after the cursor.
CREATE FUNCTION "bump_server_seq"() RETURNS trigger AS $$
BEGIN
  NEW."serverSeq" := nextval('sync_seq');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "user_preferences_server_seq" BEFORE UPDATE ON "user_preferences" FOR EACH ROW EXECUTE FUNCTION "bump_server_seq"();
CREATE TRIGGER "reading_position_server_seq" BEFORE UPDATE ON "reading_position" FOR EACH ROW EXECUTE FUNCTION "bump_server_seq"();
CREATE TRIGGER "reading_day_server_seq" BEFORE UPDATE ON "reading_day" FOR EACH ROW EXECUTE FUNCTION "bump_server_seq"();
CREATE TRIGGER "collection_server_seq" BEFORE UPDATE ON "collection" FOR EACH ROW EXECUTE FUNCTION "bump_server_seq"();
CREATE TRIGGER "saved_item_server_seq" BEFORE UPDATE ON "saved_item" FOR EACH ROW EXECUTE FUNCTION "bump_server_seq"();
CREATE TRIGGER "note_server_seq" BEFORE UPDATE ON "note" FOR EACH ROW EXECUTE FUNCTION "bump_server_seq"();
CREATE TRIGGER "memorization_item_server_seq" BEFORE UPDATE ON "memorization_item" FOR EACH ROW EXECUTE FUNCTION "bump_server_seq"();
CREATE TRIGGER "goal_server_seq" BEFORE UPDATE ON "goal" FOR EACH ROW EXECUTE FUNCTION "bump_server_seq"();
CREATE TRIGGER "adhkar_day_server_seq" BEFORE UPDATE ON "adhkar_day" FOR EACH ROW EXECUTE FUNCTION "bump_server_seq"();
CREATE TRIGGER "tasbih_session_server_seq" BEFORE UPDATE ON "tasbih_session" FOR EACH ROW EXECUTE FUNCTION "bump_server_seq"();
