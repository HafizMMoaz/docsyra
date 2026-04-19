import { requireDocumentAccess } from "@/lib/docs/access";
import {
  addCollaborator,
  getUserByEmail,
  getUserAccess,
  isUserEmailVerified,
  upsertDocumentInvitation,
  logDocumentActivity,
  type CollaboratorRole,
} from "@/lib/db/queries";
import { rejectCsrf } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { sendEmail } from "@/lib/email";
import { inviteRegistrationTemplate, inviteTemplate } from "@/lib/email/templates";

export const runtime = "edge";

type InviteBody = {
  documentId?: unknown;
  email?: unknown;
  role?: unknown;
};

function isCollaboratorRole(value: unknown): value is CollaboratorRole {
  return value === "viewer" || value === "editor";
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  let body: InviteBody;
  try {
    body = (await request.json()) as InviteBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!documentId || !email || !isCollaboratorRole(body.role)) {
    return Response.json({ success: false, error: "Invalid invite payload" }, { status: 400 });
  }

  const access = await requireDocumentAccess(request, context, documentId);
  if (access instanceof Response) {
    return access;
  }

  if (access.accessRole !== "owner") {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  if (!access.userId) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await rateLimit(request, access.userId, {
      limit: 10,
      windowMs: 60_000,
      route: "invite",
    });
  } catch {
    return Response.json({ success: false, error: "Too many requests. Try again later." }, { status: 429 });
  }

  if (!access.userId || !(await isUserEmailVerified(access.userId, access.env))) {
    return Response.json({ success: false, error: "Verify your email before inviting collaborators" }, { status: 403 });
  }

  const appBase = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://docsyra.app";
  const normalizedBase = appBase.replace(/\/+$/, "");
  const docLink = `${normalizedBase}/editor/${encodeURIComponent(documentId)}`;
  const docTitle = access.document.title?.trim() || "Untitled";
  const registerLink = `${normalizedBase}/login`;

  const user = await getUserByEmail(email, access.env);
  if (!user) {
    await upsertDocumentInvitation(
      {
        documentId,
        inviteeEmail: email,
        invitedByUserId: access.userId,
        role: body.role,
        inviteeUserId: null,
        acceptedAt: null,
      },
      access.env,
    );

    try {
      await sendEmail(
        {
          to: email,
          subject: "You are invited to Docsyra",
          html: inviteRegistrationTemplate({
            docTitle,
            docLink,
            registerLink,
            isPublicDocument: access.document.visibility === "public",
          }),
        },
        access.env as Parameters<typeof sendEmail>[1],
      );
    } catch (error) {
      console.error("[email][invite-register] Failed to send invite email", error);
    }

    return Response.json({ success: true, pendingSignup: true }, { status: 201 });
  }

  if (user.id === access.document.owner_id) {
    return Response.json({ success: false, error: "Owner is already authorized" }, { status: 409 });
  }

  const existingAccess = await getUserAccess(documentId, user.id, access.env);
  if (existingAccess) {
    return Response.json({ success: false, error: "User is already a collaborator" }, { status: 409 });
  }

  await addCollaborator(documentId, user.id, body.role, access.env);

  // 📋 Audit log collaborator addition
  await logDocumentActivity(documentId, access.userId, "collaborator_added", access.env).catch(
    (error) => console.error("[audit] Failed to log collaborator addition", error),
  );

  await upsertDocumentInvitation(
    {
      documentId,
      inviteeEmail: email,
      invitedByUserId: access.userId,
      role: body.role,
      inviteeUserId: user.id,
      acceptedAt: Date.now(),
    },
    access.env,
  );

  if (user.attributes.email) {
    try {
      await sendEmail(
        {
          to: user.attributes.email,
          subject: "You were invited to a document",
          html: inviteTemplate(docTitle, docLink),
        },
        access.env as Parameters<typeof sendEmail>[1],
      );
    } catch (error) {
      console.error("[email][invite] Failed to send invite email", error);
    }
  }

  return Response.json({ success: true }, { status: 201 });
}
