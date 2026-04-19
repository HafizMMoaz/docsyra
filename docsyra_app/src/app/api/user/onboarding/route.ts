import { createLucia } from "@/lib/auth";
import { getEnv } from "@/lib/cloudflare/route-context";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { rejectCsrf } from "@/lib/security/csrf";
import { updateUserProfile, updateUserStatus } from "@/lib/db/queries";

export const runtime = "edge";

type OnboardingBody = {
  name?: unknown;
  profession?: unknown;
  industry?: unknown;
  country?: unknown;
};

function normalizeValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  try {
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

    const body = (await request.json()) as OnboardingBody;
    const name = normalizeValue(body.name);
    const profession = normalizeValue(body.profession);
    const industry = normalizeValue(body.industry);
    const country = normalizeValue(body.country);

    const currentName = typeof result.user.name === "string" ? result.user.name.trim() : "";
    if (!name && currentName.length === 0) {
      return Response.json({ success: false, error: "Name is required" }, { status: 400 });
    }

    await updateUserProfile(
      result.user.id,
      {
        name: name ?? result.user.name,
        profession,
        industry,
        country,
      },
      env,
    );

    await updateUserStatus(result.user.id, "active", env);

    return Response.json({ success: true }, { status: 200 });
  } catch {
    return Response.json({ success: false, error: "Invalid request" }, { status: 400 });
  }
}
