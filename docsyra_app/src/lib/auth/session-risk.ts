import type { DbEnv } from "@/lib/db/client";
import { getRecentSessionFingerprints } from "@/lib/db/queries";
import { sendEmail } from "@/lib/email";
import { suspiciousLoginTemplate } from "@/lib/email/templates";

export type SessionRiskInput = {
  userId: string;
  userEmail: string | null;
  sessionId: string;
  metadata: {
    userAgent: string | null;
    ipAddress: string | null;
  };
  env?: DbEnv;
};

function evaluateRisk(
  metadata: { userAgent: string | null; ipAddress: string | null },
  known: Array<{ userAgent: string | null; ipAddress: string | null }>,
): string[] {
  if (known.length === 0) {
    return [];
  }

  const knownIps = new Set(known.map((entry) => entry.ipAddress).filter((value): value is string => !!value));
  const knownAgents = new Set(known.map((entry) => entry.userAgent).filter((value): value is string => !!value));

  const reasons: string[] = [];

  if (metadata.ipAddress && !knownIps.has(metadata.ipAddress)) {
    reasons.push("new_ip");
  }

  if (metadata.userAgent && !knownAgents.has(metadata.userAgent)) {
    reasons.push("new_user_agent");
  }

  return reasons;
}

export async function maybeAlertSuspiciousSession(input: SessionRiskInput): Promise<void> {
  if (!input.userEmail) {
    return;
  }

  const previousSessions = await getRecentSessionFingerprints(input.userId, input.sessionId, 10, input.env);
  const reasons = evaluateRisk(input.metadata, previousSessions);

  if (reasons.length === 0) {
    return;
  }

  try {
    await sendEmail(
      {
        to: input.userEmail,
        subject: "Docsyra security alert: suspicious login",
        html: suspiciousLoginTemplate({
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
          reasons,
          timeIso: new Date().toISOString(),
        }),
      },
    );
  } catch (error) {
    console.error("[security][session-alert] Failed to send suspicious login email", error);
  }
}
