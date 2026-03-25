import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { getEnv } from "@/lib/cloudflare/route-context";
import { deleteDocument, getDocumentById, updateDocument } from "@/lib/db/queries";

export const runtime = "edge";

type RouteParams = {
  id: string;
};

type UpdateBody = {
  title?: unknown;
  content?: unknown;
};

async function requireUser(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<{ userId: string } | Response> {
  const env = getEnv(context);
  const lucia = createLucia(env);
  const sessionId = readSessionIdFromRequest(request, env);

  if (!sessionId) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await lucia.validateSession(sessionId);
  if (!result.session || !result.user) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return { userId: result.user.id };
}

export async function GET(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const auth = await requireUser(request, context as { params: Promise<Record<string, string | string[] | undefined>> });
  if (auth instanceof Response) {
    return auth;
  }

  const env = getEnv(context);
  const { id } = await context.params;
  const document = await getDocumentById(id, env);

  if (!document) {
    return Response.json({ success: false, error: "Document not found" }, { status: 404 });
  }

  if (document.user_id !== auth.userId) {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  return Response.json({ success: true, document }, { status: 200 });
}

export async function PUT(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const auth = await requireUser(request, context as { params: Promise<Record<string, string | string[] | undefined>> });
  if (auth instanceof Response) {
    return auth;
  }

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const env = getEnv(context);
  const { id } = await context.params;
  const document = await getDocumentById(id, env);

  if (!document) {
    return Response.json({ success: false, error: "Document not found" }, { status: 404 });
  }

  if (document.user_id !== auth.userId) {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : undefined;
  const content = typeof body.content === "string" ? body.content : undefined;

  await updateDocument(
    id,
    {
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
    },
    env,
  );

  return Response.json({ success: true }, { status: 200 });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const auth = await requireUser(request, context as { params: Promise<Record<string, string | string[] | undefined>> });
  if (auth instanceof Response) {
    return auth;
  }

  const env = getEnv(context);
  const { id } = await context.params;
  const document = await getDocumentById(id, env);

  if (!document) {
    return Response.json({ success: false, error: "Document not found" }, { status: 404 });
  }

  if (document.user_id !== auth.userId) {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  await deleteDocument(id, env);

  return Response.json({ success: true }, { status: 200 });
}
