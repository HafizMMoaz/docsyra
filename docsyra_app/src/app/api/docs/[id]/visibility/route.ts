import { requireDocumentAccess } from "@/lib/docs/access";
import {
  isUserEmailVerified,
  updateDocumentVisibility,
  type DocumentVisibility,
} from "@/lib/db/queries";

export const runtime = "edge";

type RouteParams = {
  id: string;
};

type VisibilityBody = {
  visibility?: unknown;
};

function isVisibility(value: unknown): value is DocumentVisibility {
  return value === "private" || value === "public";
}

export async function PATCH(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  let body: VisibilityBody;
  try {
    body = (await request.json()) as VisibilityBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  if (!isVisibility(body.visibility)) {
    return Response.json({ success: false, error: "Invalid visibility value" }, { status: 400 });
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

  if (access.accessRole !== "owner") {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  if (body.visibility === "public") {
    if (!access.userId || !(await isUserEmailVerified(access.userId, access.env))) {
      return Response.json({ success: false, error: "Verify your email before making documents public" }, { status: 403 });
    }
  }

  await updateDocumentVisibility(id, body.visibility, access.env);

  return Response.json({ success: true, visibility: body.visibility }, { status: 200 });
}
