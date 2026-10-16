import { getAuth, clerkClient } from "@clerk/express";
import { and, eq, isNull } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { clinicUsersTable, db } from "@workspace/db";
import { DEFAULT_CLINIC_ID } from "../lib/clinic-queue";

export type ClinicRole = "admin" | "assistant" | "doctor";
type ClinicMember = typeof clinicUsersTable.$inferSelect;

declare global {
  namespace Express {
    interface Request {
      clinicMember?: ClinicMember;
    }
  }
}

export async function requireClinicMember(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to access this clinic." });
    return;
  }

  try {
    let [member] = await db
      .select()
      .from(clinicUsersTable)
      .where(
        and(
          eq(clinicUsersTable.clinicId, DEFAULT_CLINIC_ID),
          eq(clinicUsersTable.clerkUserId, userId),
        ),
      );

    if (!member) {
      const clerkUser = await clerkClient.users.getUser(userId);
      const primaryEmail = clerkUser.primaryEmailAddress;
      const verifiedEmail =
        primaryEmail?.verification?.status === "verified"
          ? primaryEmail.emailAddress.trim().toLowerCase()
          : null;

      if (!verifiedEmail) {
        res.status(403).json({
          error: "Verify your email, then ask the clinic owner for access.",
        });
        return;
      }

      const [pendingMembership] = await db
        .select()
        .from(clinicUsersTable)
        .where(
          and(
            eq(clinicUsersTable.clinicId, DEFAULT_CLINIC_ID),
            eq(clinicUsersTable.email, verifiedEmail),
            isNull(clinicUsersTable.clerkUserId),
            eq(clinicUsersTable.isActive, true),
          ),
        );

      if (pendingMembership) {
        await db
          .update(clinicUsersTable)
          .set({ clerkUserId: userId })
          .where(
            and(
              eq(clinicUsersTable.id, pendingMembership.id),
              isNull(clinicUsersTable.clerkUserId),
              eq(clinicUsersTable.isActive, true),
            ),
          );

        [member] = await db
          .select()
          .from(clinicUsersTable)
          .where(
            and(
              eq(clinicUsersTable.clinicId, DEFAULT_CLINIC_ID),
              eq(clinicUsersTable.clerkUserId, userId),
            ),
          );
      }
    }

    if (!member || !member.isActive) {
      res.status(403).json({
        error: "Your account does not have access to this clinic.",
      });
      return;
    }

    req.clinicMember = member;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireClinicRole(
  ...roles: Exclude<ClinicRole, "admin">[]
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const member = req.clinicMember;
    if (!member || !member.isActive) {
      res.status(401).json({ error: "Sign in to access this clinic." });
      return;
    }

    if (member.role !== "admin" && !roles.includes(member.role)) {
      res.status(403).json({ error: "This action is not available for your role." });
      return;
    }

    next();
  };
}

export function requireClinicAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.clinicMember || !req.clinicMember.isActive) {
    res.status(401).json({ error: "Sign in to access this clinic." });
    return;
  }

  if (req.clinicMember.role !== "admin") {
    res.status(403).json({ error: "Only a clinic owner can manage staff access." });
    return;
  }

  next();
}
