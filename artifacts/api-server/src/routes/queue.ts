import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  AddQueueEntryBody,
  AddQueueEntryResponse,
  CallNextPatientResponse,
  CancelQueueEntryParams,
  CancelQueueEntryResponse,
  CompleteQueueEntryParams,
  CompleteQueueEntryResponse,
  GetTodayQueueResponse,
} from "@workspace/api-zod";
import {
  clinicsTable,
  consultationsTable,
  db,
  queueEntriesTable,
} from "@workspace/db";
import {
  addQueuePatient,
  broadcastQueueUpdate,
  callNextWaitingPatient,
  DEFAULT_CLINIC_ID,
  getIndiaServiceDate,
  getQueueEntriesForToday,
  getQueueEntryById,
  queueEvents,
} from "../lib/clinic-queue";

const router: IRouter = Router();

router.get("/queue/today", async (req, res): Promise<void> => {
  const entries = await getQueueEntriesForToday();
  const completed = entries.filter((entry) => entry.status === "completed");
  const waits = completed
    .filter((entry) => entry.calledAt)
    .map((entry) =>
      Math.max(
        0,
        (entry.calledAt!.getTime() - entry.createdAt.getTime()) / 60_000,
      ),
    );
  const snapshot = {
    clinicName: "Agilence Family Clinic",
    serviceDate: getIndiaServiceDate(),
    waitingCount: entries.filter((entry) => entry.status === "waiting").length,
    completedToday: completed.length,
    averageWaitMinutes:
      waits.length > 0
        ? Math.round(waits.reduce((total, wait) => total + wait, 0) / waits.length)
        : null,
    entries,
  };
  req.log.info("Loaded today's clinic queue");
  res.json(GetTodayQueueResponse.parse(snapshot));
});

router.post("/queue", async (req, res): Promise<void> => {
  const parsed = AddQueueEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const name = parsed.data.name.trim();
  const issueDescription = parsed.data.issueDescription.trim();
  if (!name || !issueDescription) {
    res.status(400).json({ error: "Patient name and reason for visit are required." });
    return;
  }

  const entry = await addQueuePatient({
    name,
    phone: parsed.data.phone?.trim(),
    issueDescription,
  });
  const response = AddQueueEntryResponse.parse(entry);
  broadcastQueueUpdate();
  res.status(201).json(response);
});

router.post("/queue/call-next", async (req, res): Promise<void> => {
  const result = await callNextWaitingPatient();
  if ("conflict" in result) {
    if (result.conflict === "current") {
      res.status(409).json({ error: "A patient is already with the doctor." });
      return;
    }
    res.status(404).json({ error: "There are no patients waiting." });
    return;
  }

  broadcastQueueUpdate();
  res.json(CallNextPatientResponse.parse(result));
});

router.post("/queue/:entryId/complete", async (req, res): Promise<void> => {
  const parsed = CompleteQueueEntryParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(queueEntriesTable)
    .where(
      and(
        eq(queueEntriesTable.id, parsed.data.entryId),
        eq(queueEntriesTable.clinicId, DEFAULT_CLINIC_ID),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Queue entry not found." });
    return;
  }
  if (existing.status !== "with_doctor") {
    res.status(409).json({ error: "Only the current patient can be completed." });
    return;
  }

  const completedAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(queueEntriesTable)
      .set({ status: "completed", completedAt })
      .where(eq(queueEntriesTable.id, parsed.data.entryId));
    await tx
      .update(consultationsTable)
      .set({ endedAt: completedAt })
      .where(eq(consultationsTable.queueEntryId, parsed.data.entryId));
  });

  const entry = await getQueueEntryById(parsed.data.entryId);
  if (!entry) {
    res.status(404).json({ error: "Queue entry not found." });
    return;
  }
  broadcastQueueUpdate();
  res.json(CompleteQueueEntryResponse.parse(entry));
});

router.post("/queue/:entryId/cancel", async (req, res): Promise<void> => {
  const parsed = CancelQueueEntryParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(queueEntriesTable)
    .where(
      and(
        eq(queueEntriesTable.id, parsed.data.entryId),
        eq(queueEntriesTable.clinicId, DEFAULT_CLINIC_ID),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Queue entry not found." });
    return;
  }
  if (existing.status !== "waiting" && existing.status !== "with_doctor") {
    res.status(409).json({ error: "This queue entry can no longer be cancelled." });
    return;
  }

  const cancelledAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(queueEntriesTable)
      .set({ status: "cancelled" })
      .where(eq(queueEntriesTable.id, parsed.data.entryId));
    await tx
      .update(consultationsTable)
      .set({ endedAt: cancelledAt })
      .where(eq(consultationsTable.queueEntryId, parsed.data.entryId));
  });

  const entry = await getQueueEntryById(parsed.data.entryId);
  if (!entry) {
    res.status(404).json({ error: "Queue entry not found." });
    return;
  }
  broadcastQueueUpdate();
  res.json(CancelQueueEntryResponse.parse(entry));
});

router.get("/queue/events", (req, res): void => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write("event: connected\ndata: {}\n\n");

  const sendQueueUpdate = () => {
    res.write(`event: queue-updated\ndata: {"updatedAt":"${new Date().toISOString()}"}\n\n`);
  };
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 20_000);
  const onClose = () => {
    clearInterval(heartbeat);
    queueEvents.off("queue-updated", sendQueueUpdate);
  };

  queueEvents.on("queue-updated", sendQueueUpdate);
  req.on("close", onClose);
});

export default router;
