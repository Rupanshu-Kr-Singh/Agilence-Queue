import { EventEmitter } from "node:events";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  clinicUsersTable,
  clinicsTable,
  consultationsTable,
  doctorsTable,
  patientsTable,
  queueCountersTable,
  queueEntriesTable,
} from "@workspace/db";

export const DEFAULT_CLINIC_ID = "00000000-0000-4000-8000-000000000001";
export const DEFAULT_DOCTOR_ID = "00000000-0000-4000-8000-000000000005";

export const queueEvents = new EventEmitter();

export function getIndiaServiceDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function initializeDemoClinic(): Promise<void> {
  const [newClinic] = await db
    .insert(clinicsTable)
    .values({
      id: DEFAULT_CLINIC_ID,
      name: "Agilence Family Clinic",
    })
    .onConflictDoNothing()
    .returning({ id: clinicsTable.id });

  await db
    .insert(clinicUsersTable)
    .values([
      {
        id: "00000000-0000-4000-8000-000000000002",
        clinicId: DEFAULT_CLINIC_ID,
        displayName: "Clinic owner",
        role: "admin",
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        clinicId: DEFAULT_CLINIC_ID,
        displayName: "Reception",
        role: "assistant",
      },
      {
        id: "00000000-0000-4000-8000-000000000004",
        clinicId: DEFAULT_CLINIC_ID,
        displayName: "Dr. Mehta",
        role: "doctor",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(doctorsTable)
    .values({
      id: DEFAULT_DOCTOR_ID,
      clinicId: DEFAULT_CLINIC_ID,
      userId: "00000000-0000-4000-8000-000000000004",
      displayName: "Dr. Mehta",
    })
    .onConflictDoNothing();

  if (!newClinic) return;

  const serviceDate = getIndiaServiceDate();
  const now = Date.now();
  const demoPatients = [
    {
      id: "00000000-0000-4000-8000-000000000011",
      name: "Aarav Sharma",
      phone: "98765 43210",
    },
    {
      id: "00000000-0000-4000-8000-000000000012",
      name: "Meera Patel",
      phone: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000013",
      name: "Kabir Nair",
      phone: "91234 56780",
    },
  ];
  await db
    .insert(patientsTable)
    .values(
      demoPatients.map((patient) => ({
        ...patient,
        clinicId: DEFAULT_CLINIC_ID,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(queueCountersTable)
    .values({
      clinicId: DEFAULT_CLINIC_ID,
      serviceDate,
      nextNumber: 4,
    })
    .onConflictDoNothing();

  await db
    .insert(queueEntriesTable)
    .values([
      {
        id: "00000000-0000-4000-8000-000000000021",
        clinicId: DEFAULT_CLINIC_ID,
        patientId: demoPatients[0]!.id,
        queueNumber: 1,
        serviceDate,
        issueDescription: "Routine follow-up",
        status: "completed",
        createdAt: new Date(now - 55 * 60_000),
        calledAt: new Date(now - 40 * 60_000),
        completedAt: new Date(now - 25 * 60_000),
      },
      {
        id: "00000000-0000-4000-8000-000000000022",
        clinicId: DEFAULT_CLINIC_ID,
        patientId: demoPatients[1]!.id,
        queueNumber: 2,
        serviceDate,
        issueDescription: "Seasonal cough",
        status: "waiting",
        createdAt: new Date(now - 18 * 60_000),
      },
      {
        id: "00000000-0000-4000-8000-000000000023",
        clinicId: DEFAULT_CLINIC_ID,
        patientId: demoPatients[2]!.id,
        queueNumber: 3,
        serviceDate,
        issueDescription: "Fever and tiredness",
        status: "waiting",
        createdAt: new Date(now - 7 * 60_000),
      },
    ])
    .onConflictDoNothing();
}

export async function getQueueEntriesForToday() {
  const serviceDate = getIndiaServiceDate();
  return db
    .select({
      id: queueEntriesTable.id,
      patientId: queueEntriesTable.patientId,
      queueNumber: queueEntriesTable.queueNumber,
      name: patientsTable.name,
      phone: patientsTable.phone,
      issueDescription: queueEntriesTable.issueDescription,
      status: queueEntriesTable.status,
      doctorId: queueEntriesTable.doctorId,
      createdAt: queueEntriesTable.createdAt,
      calledAt: queueEntriesTable.calledAt,
      completedAt: queueEntriesTable.completedAt,
    })
    .from(queueEntriesTable)
    .innerJoin(patientsTable, eq(queueEntriesTable.patientId, patientsTable.id))
    .where(
      sql`${queueEntriesTable.clinicId} = ${DEFAULT_CLINIC_ID} and ${queueEntriesTable.serviceDate} = ${serviceDate}`,
    )
    .orderBy(asc(queueEntriesTable.queueNumber));
}

export async function getQueueEntryById(id: string) {
  const [entry] = await db
    .select({
      id: queueEntriesTable.id,
      patientId: queueEntriesTable.patientId,
      queueNumber: queueEntriesTable.queueNumber,
      name: patientsTable.name,
      phone: patientsTable.phone,
      issueDescription: queueEntriesTable.issueDescription,
      status: queueEntriesTable.status,
      doctorId: queueEntriesTable.doctorId,
      createdAt: queueEntriesTable.createdAt,
      calledAt: queueEntriesTable.calledAt,
      completedAt: queueEntriesTable.completedAt,
    })
    .from(queueEntriesTable)
    .innerJoin(patientsTable, eq(queueEntriesTable.patientId, patientsTable.id))
    .where(eq(queueEntriesTable.id, id));
  return entry;
}

export async function addQueuePatient(input: {
  name: string;
  phone?: string;
  issueDescription: string;
}) {
  const serviceDate = getIndiaServiceDate();
  return db.transaction(async (tx) => {
    const [counter] = await tx
      .insert(queueCountersTable)
      .values({
        clinicId: DEFAULT_CLINIC_ID,
        serviceDate,
        nextNumber: 2,
      })
      .onConflictDoUpdate({
        target: [queueCountersTable.clinicId, queueCountersTable.serviceDate],
        set: { nextNumber: sql`${queueCountersTable.nextNumber} + 1` },
      })
      .returning({ nextNumber: queueCountersTable.nextNumber });

    if (!counter) throw new Error("Could not allocate the next queue number");

    const [patient] = await tx
      .insert(patientsTable)
      .values({
        clinicId: DEFAULT_CLINIC_ID,
        name: input.name,
        phone: input.phone || null,
      })
      .returning();

    if (!patient) throw new Error("Could not save the patient");

    const [entry] = await tx
      .insert(queueEntriesTable)
      .values({
        clinicId: DEFAULT_CLINIC_ID,
        patientId: patient.id,
        queueNumber: counter.nextNumber - 1,
        serviceDate,
        issueDescription: input.issueDescription,
        status: "waiting",
      })
      .returning();

    if (!entry) throw new Error("Could not add the patient to the queue");

    return {
      id: entry.id,
      patientId: patient.id,
      queueNumber: entry.queueNumber,
      name: patient.name,
      phone: patient.phone,
      issueDescription: entry.issueDescription,
      status: entry.status,
      doctorId: entry.doctorId,
      createdAt: entry.createdAt,
      calledAt: entry.calledAt,
      completedAt: entry.completedAt,
    };
  });
}

export async function callNextWaitingPatient() {
  const serviceDate = getIndiaServiceDate();
  return db.transaction(async (tx) => {
    await tx
      .select({ id: clinicsTable.id })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, DEFAULT_CLINIC_ID))
      .for("update");

    const [current] = await tx
      .select({ id: queueEntriesTable.id })
      .from(queueEntriesTable)
      .where(
        sql`${queueEntriesTable.clinicId} = ${DEFAULT_CLINIC_ID} and ${queueEntriesTable.serviceDate} = ${serviceDate} and ${queueEntriesTable.status} = 'with_doctor'`,
      )
      .limit(1);
    if (current) return { conflict: "current" as const };

    const [next] = await tx
      .select({
        id: queueEntriesTable.id,
        patientId: queueEntriesTable.patientId,
      })
      .from(queueEntriesTable)
      .where(
        sql`${queueEntriesTable.clinicId} = ${DEFAULT_CLINIC_ID} and ${queueEntriesTable.serviceDate} = ${serviceDate} and ${queueEntriesTable.status} = 'waiting'`,
      )
      .orderBy(asc(queueEntriesTable.queueNumber))
      .limit(1)
      .for("update");
    if (!next) return { conflict: "empty" as const };

    const now = new Date();
    const [updated] = await tx
      .update(queueEntriesTable)
      .set({
        status: "with_doctor",
        doctorId: DEFAULT_DOCTOR_ID,
        calledAt: now,
      })
      .where(eq(queueEntriesTable.id, next.id))
      .returning();
    if (!updated) throw new Error("Could not call the next patient");

    await tx.insert(consultationsTable).values({
      clinicId: DEFAULT_CLINIC_ID,
      queueEntryId: updated.id,
      doctorId: DEFAULT_DOCTOR_ID,
      startedAt: now,
    });

    const [patient] = await tx
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.id, next.patientId));
    if (!patient) throw new Error("Patient record is missing");

    return {
      id: updated.id,
      patientId: patient.id,
      queueNumber: updated.queueNumber,
      name: patient.name,
      phone: patient.phone,
      issueDescription: updated.issueDescription,
      status: updated.status,
      doctorId: updated.doctorId,
      createdAt: updated.createdAt,
      calledAt: updated.calledAt,
      completedAt: updated.completedAt,
    };
  });
}

export function broadcastQueueUpdate(): void {
  queueEvents.emit("queue-updated");
}

