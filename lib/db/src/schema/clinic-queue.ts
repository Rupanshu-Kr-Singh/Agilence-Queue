import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const clinicRoleEnum = pgEnum("clinic_role", [
  "admin",
  "assistant",
  "doctor",
]);

export const queueStatusEnum = pgEnum("queue_status", [
  "waiting",
  "with_doctor",
  "completed",
  "cancelled",
]);

export const clinicsTable = pgTable("clinics", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const clinicUsersTable = pgTable("clinic_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clinicId: uuid("clinic_id")
    .references(() => clinicsTable.id)
    .notNull(),
  clerkUserId: text("clerk_user_id"),
  displayName: text("display_name").notNull(),
  email: text("email"),
  role: clinicRoleEnum("role").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  uniqueIndex("clinic_users_clinic_clerk_user_id_unique").on(
    table.clinicId,
    table.clerkUserId,
  ),
  uniqueIndex("clinic_users_clinic_email_unique").on(
    table.clinicId,
    table.email,
  ),
]);

export const doctorsTable = pgTable("doctors", {
  id: uuid("id").defaultRandom().primaryKey(),
  clinicId: uuid("clinic_id")
    .references(() => clinicsTable.id)
    .notNull(),
  userId: uuid("user_id").references(() => clinicUsersTable.id),
  displayName: text("display_name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const patientsTable = pgTable("patients", {
  id: uuid("id").defaultRandom().primaryKey(),
  clinicId: uuid("clinic_id")
    .references(() => clinicsTable.id)
    .notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const queueCountersTable = pgTable(
  "queue_counters",
  {
    clinicId: uuid("clinic_id")
      .references(() => clinicsTable.id)
      .notNull(),
    serviceDate: date("service_date").notNull(),
    nextNumber: integer("next_number").notNull(),
  },
  (table) => [primaryKey({ columns: [table.clinicId, table.serviceDate] })],
);

export const queueEntriesTable = pgTable(
  "queue_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .references(() => clinicsTable.id)
      .notNull(),
    patientId: uuid("patient_id")
      .references(() => patientsTable.id)
      .notNull(),
    queueNumber: integer("queue_number").notNull(),
    serviceDate: date("service_date").notNull(),
    doctorId: uuid("doctor_id").references(() => doctorsTable.id),
    issueDescription: text("issue_description").notNull(),
    status: queueStatusEnum("status").default("waiting").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    calledAt: timestamp("called_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    unique("queue_entries_clinic_date_number_unique").on(
      table.clinicId,
      table.serviceDate,
      table.queueNumber,
    ),
  ],
);

export const consultationsTable = pgTable("consultations", {
  id: uuid("id").defaultRandom().primaryKey(),
  clinicId: uuid("clinic_id")
    .references(() => clinicsTable.id)
    .notNull(),
  queueEntryId: uuid("queue_entry_id")
    .references(() => queueEntriesTable.id)
    .notNull()
    .unique(),
  doctorId: uuid("doctor_id").references(() => doctorsTable.id),
  startedAt: timestamp("started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});
