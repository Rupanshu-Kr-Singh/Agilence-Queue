import { Router, type IRouter } from "express";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  AddClinicMemberBody,
  AddClinicMemberResponse,
  GetCurrentClinicUserResponse,
  ListClinicMembersResponse,
} from "@workspace/api-zod";
import {
  clinicUsersTable,
  clinicsTable,
  db,
} from "@workspace/db";
import {
  requireClinicAdmin,
  requireClinicMember,
} from "../middlewares/clinicAuthorization";
import { DEFAULT_CLINIC_ID } from "../lib/clinic-queue";

const router: IRouter = Router();

router.get(
  "/auth/me",
  requireClinicMember,
  async (req, res): Promise<void> => {
    const member = req.clinicMember;
    if (!member?.email) {
      res.status(403).json({ error: "Clinic membership is not configured." });
      return;
    }

    const [clinic] = await db
      .select({ id: clinicsTable.id, name: clinicsTable.name })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, member.clinicId));
    if (!clinic) {
      res.status(404).json({ error: "Clinic not found." });
      return;
    }

    res.json(
      GetCurrentClinicUserResponse.parse({
        user: {
          id: member.id,
          displayName: member.displayName,
          email: member.email,
          role: member.role,
          clinicId: clinic.id,
          clinicName: clinic.name,
        },
      }),
    );
  },
);

router.get(
  "/auth/members",
  requireClinicMember,
  requireClinicAdmin,
  async (_req, res): Promise<void> => {
    const members = await db
      .select({
        id: clinicUsersTable.id,
        displayName: clinicUsersTable.displayName,
        email: clinicUsersTable.email,
        role: clinicUsersTable.role,
        isActive: clinicUsersTable.isActive,
        clerkUserId: clinicUsersTable.clerkUserId,
      })
      .from(clinicUsersTable)
      .where(
        and(
          eq(clinicUsersTable.clinicId, DEFAULT_CLINIC_ID),
          isNotNull(clinicUsersTable.email),
        ),
      );

    res.json(
      ListClinicMembersResponse.parse({
        members: members.map((member) => ({
          id: member.id,
          displayName: member.displayName,
          email: member.email,
          role: member.role,
          isActive: member.isActive,
          hasAccount: Boolean(member.clerkUserId),
        })),
      }),
    );
  },
);

router.post(
  "/auth/members",
  requireClinicMember,
  requireClinicAdmin,
  async (req, res): Promise<void> => {
    const parsed = AddClinicMemberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const displayName = parsed.data.displayName.trim();
    const email = parsed.data.email.trim().toLowerCase();
    if (!displayName) {
      res.status(400).json({ error: "Enter a staff name." });
      return;
    }

    const [existing] = await db
      .select({ id: clinicUsersTable.id })
      .from(clinicUsersTable)
      .where(
        and(
          eq(clinicUsersTable.clinicId, DEFAULT_CLINIC_ID),
          eq(clinicUsersTable.email, email),
        ),
      );
    if (existing) {
      res.status(409).json({ error: "This email already has clinic access." });
      return;
    }

    const [member] = await db
      .insert(clinicUsersTable)
      .values({
        clinicId: DEFAULT_CLINIC_ID,
        displayName,
        email,
        role: parsed.data.role,
      })
      .returning({
        id: clinicUsersTable.id,
        displayName: clinicUsersTable.displayName,
        email: clinicUsersTable.email,
        role: clinicUsersTable.role,
        isActive: clinicUsersTable.isActive,
        clerkUserId: clinicUsersTable.clerkUserId,
      });

    if (!member || !member.email) {
      res.status(500).json({ error: "Could not grant clinic access." });
      return;
    }

    req.log.info({ role: member.role }, "Granted clinic staff access");
    res.status(201).json(
      AddClinicMemberResponse.parse({
        member: {
          id: member.id,
          displayName: member.displayName,
          email: member.email,
          role: member.role,
          isActive: member.isActive,
          hasAccount: Boolean(member.clerkUserId),
        },
      }),
    );
  },
);

export default router;
