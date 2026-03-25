import { createLucia } from "@/lib/auth";
import { getEnv } from "@/lib/cloudflare/route-context";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { updateUserProfile } from "@/lib/db/queries";

export const runtime = "edge";

type ProfileBody = {
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

export async function PUT(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
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

    const body = (await request.json()) as ProfileBody;
    const name = normalizeValue(body.name);
    const profession = normalizeValue(body.profession);
    const industry = normalizeValue(body.industry);
    const country = normalizeValue(body.country);

    await updateUserProfile(
      result.user.id,
      {
        name,
        profession,
        industry,
        country,
      },
      env,
    );

    return Response.json({ success: true }, { status: 200 });
  } catch {
    return Response.json({ success: false, error: "Invalid request" }, { status: 400 });
  }
}
