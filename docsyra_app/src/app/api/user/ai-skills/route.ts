import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { getEnv } from "@/lib/cloudflare/route-context";
import { rejectCsrf } from "@/lib/security/csrf";
import {
  createUserAISkill,
  deleteUserAISkill,
  getUserAISkills,
  updateUserAISkill,
} from "@/lib/db/queries";

export const runtime = "edge";

type SkillBody = {
  skillId?: unknown;
  name?: unknown;
  description?: unknown;
  instructions?: unknown;
  enabled?: unknown;
};

function readText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }
  }

  return undefined;
}

async function requireUser(request: Request, env: any): Promise<{ id: string } | Response> {
  const lucia = createLucia(env);
  const sessionId = readSessionIdFromRequest(request, env);

  if (!sessionId) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await lucia.validateSession(sessionId);
  if (!result.session || !result.user) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return { id: result.user.id };
}

function readSkillInput(body: SkillBody): { name: string; description: string | null; instructions: string; enabled: boolean } | null {
  const name = readText(body.name);
  const instructions = readText(body.instructions);

  if (!name || !instructions) {
    return null;
  }

  return {
    name,
    description: readText(body.description) ?? null,
    instructions,
    enabled: readBoolean(body.enabled) ?? true,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const env = getEnv(context);
  const auth = await requireUser(request, env);

  if (auth instanceof Response) {
    return auth;
  }

  const skills = await getUserAISkills(auth.id, env).catch(() => []);
  return Response.json({ success: true, skills }, { status: 200 });
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  const env = getEnv(context);
  const auth = await requireUser(request, env);
  if (auth instanceof Response) {
    return auth;
  }

  let body: SkillBody;
  try {
    body = (await request.json()) as SkillBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const input = readSkillInput(body);
  if (!input) {
    return Response.json({ success: false, error: "Name and instructions are required" }, { status: 400 });
  }

  try {
    const skill = await createUserAISkill(auth.id, input, env);
    return Response.json({ success: true, skill }, { status: 200 });
  } catch {
    return Response.json({ success: false, error: "Failed to create AI skill" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  const env = getEnv(context);
  const auth = await requireUser(request, env);
  if (auth instanceof Response) {
    return auth;
  }

  let body: SkillBody;
  try {
    body = (await request.json()) as SkillBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const skillId = readText(body.skillId);
  if (!skillId) {
    return Response.json({ success: false, error: "skillId is required" }, { status: 400 });
  }

  const input = readSkillInput(body);
  if (!input) {
    return Response.json({ success: false, error: "Name and instructions are required" }, { status: 400 });
  }

  try {
    const skill = await updateUserAISkill(auth.id, skillId, input, env);
    if (!skill) {
      return Response.json({ success: false, error: "Skill not found" }, { status: 404 });
    }

    return Response.json({ success: true, skill }, { status: 200 });
  } catch {
    return Response.json({ success: false, error: "Failed to update AI skill" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  const env = getEnv(context);
  const auth = await requireUser(request, env);
  if (auth instanceof Response) {
    return auth;
  }

  let body: SkillBody;
  try {
    body = (await request.json()) as SkillBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const skillId = readText(body.skillId);
  if (!skillId) {
    return Response.json({ success: false, error: "skillId is required" }, { status: 400 });
  }

  const deleted = await deleteUserAISkill(auth.id, skillId, env).catch(() => false);
  if (!deleted) {
    return Response.json({ success: false, error: "Skill not found" }, { status: 404 });
  }

  return Response.json({ success: true }, { status: 200 });
}