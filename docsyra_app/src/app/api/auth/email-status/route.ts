import { getEnv } from "@/lib/cloudflare/route-context";
import { getUserPasswordHashByEmail } from "@/lib/db/queries";

export const runtime = "edge";

type Body = {
  email?: unknown;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  let body: Body;

  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  try {
    const emailValue = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!emailValue || !isValidEmail(emailValue)) {
      return Response.json({ success: false, error: "Valid email is required" }, { status: 400 });
    }

    const env = getEnv(context);
    const record = await getUserPasswordHashByEmail(emailValue, env);

    if (!record) {
      return Response.json({ success: true, exists: false, needsPassword: false }, { status: 200 });
    }

    return Response.json(
      {
        success: true,
        exists: true,
        needsPassword: !!record.password_hash,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
