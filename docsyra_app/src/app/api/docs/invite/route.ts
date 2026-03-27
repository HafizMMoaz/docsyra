import { requireDocumentAccess } from "@/lib/docs/access";
import {
  addCollaborator,
  getUserByEmail,
  getUserAccess,
  isUserEmailVerified,
  type CollaboratorRole,
} from "@/lib/db/queries";
import { sendEmail } from "@/lib/email";
import { inviteTemplate } from "@/lib/email/templates";

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

  if (!access.userId || !(await isUserEmailVerified(access.userId, access.env))) {
    return Response.json({ success: false, error: "Verify your email before inviting collaborators" }, { status: 403 });
  }

  const user = await getUserByEmail(email, access.env);
  if (!user) {
    return Response.json({ success: false, error: "User not found" }, { status: 404 });
  }

  if (user.id === access.document.user_id) {
    return Response.json({ success: false, error: "Owner is already authorized" }, { status: 409 });
  }

  const existingAccess = await getUserAccess(documentId, user.id, access.env);
  if (existingAccess) {
    return Response.json({ success: false, error: "User is already a collaborator" }, { status: 409 });
  }

  await addCollaborator(documentId, user.id, body.role, access.env);

  if (user.attributes.email) {
    const appBase = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://docsyra.app";
    const docLink = `${appBase.replace(/\/+$/, "")}/editor/${encodeURIComponent(documentId)}`;
    const docTitle = access.document.title?.trim() || "Untitled";

    try {
      await sendEmail(
        {
          to: user.attributes.email,
          subject: "You were invited to a document",
          html: inviteTemplate(docTitle, docLink),
        },
        access.env,
      );
    } catch (error) {
      console.error("[email][invite] Failed to send invite email", error);
    }
  }

  return Response.json({ success: true }, { status: 201 });
}
