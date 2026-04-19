import { requireDocumentAccess } from "@/lib/docs/access";
import { rejectCsrf } from "@/lib/security/csrf";
import { transferDocumentOwnership, logDocumentActivity } from "@/lib/db/queries";

export const runtime = "edge";

type RouteParams = {
  id: string;
};

type TransferBody = {
  newOwnerId?: unknown;
};

export async function POST(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  let body: TransferBody;
  try {
    body = (await request.json()) as TransferBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const newOwnerId = typeof body.newOwnerId === "string" ? body.newOwnerId : "";
  if (!newOwnerId) {
    return Response.json({ success: false, error: "newOwnerId is required" }, { status: 400 });
  }

  const { id } = await context.params;
  const access = await requireDocumentAccess(
    request,
    context as { params: Promise<Record<string, string | string[] | undefined>> },
    id,
  );

  if (access instanceof Response) {
    return access;
  }

  // Only owner can transfer ownership
  if (access.accessRole !== "owner") {
    return Response.json({ success: false, error: "Only owner can transfer ownership" }, { status: 403 });
  }

  // Prevent transferring to self
  if (access.userId === newOwnerId) {
    return Response.json({ success: false, error: "Cannot transfer to current owner" }, { status: 400 });
  }

  try {
    await transferDocumentOwnership(id, newOwnerId, access.env);

    // 📋 Audit log ownership transfer
    await logDocumentActivity(id, access.userId, "transfer_ownership", access.env).catch((error) =>
      console.error("[audit] Failed to log ownership transfer", error),
    );

    return Response.json({ success: true, newOwnerId }, { status: 200 });
  } catch (error) {
    console.error("[transfer-ownership] Error:", error);
    return Response.json(
      { success: false, error: "Failed to transfer ownership" },
      { status: 500 },
    );
  }
}
