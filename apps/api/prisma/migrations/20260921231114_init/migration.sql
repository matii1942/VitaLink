-- CreateTable
CREATE TABLE "Patient" (
    "mrn" TEXT NOT NULL,
    "nationalId" TEXT,
    "familyName" TEXT NOT NULL,
    "givenName" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "sex" TEXT NOT NULL,
    "news2Scale" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("mrn")
);

-- CreateTable
CREATE TABLE "Admission" (
    "admissionId" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "admittedAt" TIMESTAMP(3) NOT NULL,
    "dischargedAt" TIMESTAMP(3),
    "ward" TEXT NOT NULL,
    "admissionType" TEXT NOT NULL,
    "sourceUnit" TEXT,
    "diagnosis" TEXT,
    "firstAdmission" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("admissionId")
);

-- CreateTable
CREATE TABLE "Observation" (
    "observationId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "respirationRate" INTEGER,
    "oxygenSaturation" INTEGER,
    "respiratorySupport" TEXT NOT NULL,
    "systolicBP" INTEGER,
    "pulse" INTEGER,
    "gcsEye" INTEGER,
    "gcsVerbal" INTEGER,
    "gcsMotor" INTEGER,
    "gcsTotal" INTEGER NOT NULL,
    "temperature" DOUBLE PRECISION,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("observationId")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notEligibleReason" TEXT,
    "aggregate" INTEGER,
    "risk" TEXT,
    "partial" BOOLEAN,
    "redScore" BOOLEAN,
    "scaleUsed" INTEGER,
    "scaleSource" TEXT,
    "respirationRateScore" INTEGER,
    "oxygenSaturationScore" INTEGER,
    "supplementalOxygenScore" INTEGER,
    "systolicBPScore" INTEGER,
    "pulseScore" INTEGER,
    "consciousnessScore" INTEGER,
    "temperatureScore" INTEGER,
    "missing" TEXT[],
    "engineVersion" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "patientsSynced" INTEGER NOT NULL DEFAULT 0,
    "admissionsSynced" INTEGER NOT NULL DEFAULT 0,
    "observationsSynced" INTEGER NOT NULL DEFAULT 0,
    "observationsRejected" INTEGER NOT NULL DEFAULT 0,
    "scoresComputed" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Admission_mrn_idx" ON "Admission"("mrn");

-- CreateIndex
CREATE INDEX "Admission_dischargedAt_idx" ON "Admission"("dischargedAt");

-- CreateIndex
CREATE INDEX "Observation_admissionId_recordedAt_idx" ON "Observation"("admissionId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Score_observationId_key" ON "Score"("observationId");

-- CreateIndex
CREATE INDEX "Score_risk_idx" ON "Score"("risk");

-- CreateIndex
CREATE INDEX "SyncRun_startedAt_idx" ON "SyncRun"("startedAt");

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_mrn_fkey" FOREIGN KEY ("mrn") REFERENCES "Patient"("mrn") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("admissionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("observationId") ON DELETE CASCADE ON UPDATE CASCADE;
