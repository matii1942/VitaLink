-- CreateTable
CREATE TABLE "LlmCall" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "subjectId" TEXT,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Summary" (
    "admissionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "throughObservationId" TEXT NOT NULL,
    "throughRecordedAt" TIMESTAMPTZ(3) NOT NULL,
    "roundsUsed" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Summary_pkey" PRIMARY KEY ("admissionId")
);

-- CreateIndex
CREATE INDEX "LlmCall_createdAt_idx" ON "LlmCall"("createdAt");

-- AddForeignKey
ALTER TABLE "Summary" ADD CONSTRAINT "Summary_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("admissionId") ON DELETE CASCADE ON UPDATE CASCADE;
