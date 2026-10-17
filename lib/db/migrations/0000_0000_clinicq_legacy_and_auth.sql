-- Add ClinicQ's existing optional fields and clinic authentication fields without
-- recreating tables or changing existing rows. IF NOT EXISTS makes the legacy
-- fields safe to apply where they already exist on the VPS.
ALTER TABLE "clinics"
	ADD COLUMN IF NOT EXISTS "clinic_code" text,
	ADD COLUMN IF NOT EXISTS "location" text,
	ADD COLUMN IF NOT EXISTS "subscription_plan" text,
	ADD COLUMN IF NOT EXISTS "coupon_code" text,
	ADD COLUMN IF NOT EXISTS "subscription_amount" numeric,
	ADD COLUMN IF NOT EXISTS "subscription_renewal_date" date,
	ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "patients"
	ADD COLUMN IF NOT EXISTS "email" text,
	ADD COLUMN IF NOT EXISTS "clerk_user_id" text;
--> statement-breakpoint
ALTER TABLE "queue_entries"
	ADD COLUMN IF NOT EXISTS "patient_joined_online" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "consultations"
	ADD COLUMN IF NOT EXISTS "consultation_notes" text,
	ADD COLUMN IF NOT EXISTS "diagnosis" text,
	ADD COLUMN IF NOT EXISTS "prescription" text,
	ADD COLUMN IF NOT EXISTS "consultation_data" jsonb,
	ADD COLUMN IF NOT EXISTS "doctor_observations" text,
	ADD COLUMN IF NOT EXISTS "follow_up_information" text;
--> statement-breakpoint
ALTER TABLE "clinic_users"
	ADD COLUMN IF NOT EXISTS "clerk_user_id" text,
	ADD COLUMN IF NOT EXISTS "email" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clinic_users_clinic_clerk_user_id_unique"
	ON "clinic_users" USING btree ("clinic_id", "clerk_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clinic_users_clinic_email_unique"
	ON "clinic_users" USING btree ("clinic_id", "email");