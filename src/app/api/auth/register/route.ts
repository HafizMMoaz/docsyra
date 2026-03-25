import { createUser, createLucia, setSessionCookie } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import { getEnv } from "@/lib/cloudflare/route-context";
import { getUserPasswordHashByEmail } from "@/lib/db/queries";

export const runtime = "edge";

type Body = {
  email?: unknown;
  password?: unknown;
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
    const passwordValue = typeof body.password === "string" ? body.password : "";

    if (!emailValue || !isValidEmail(emailValue)) {
      return Response.json({ success: false, error: "Valid email is required" }, { status: 400 });
    }

    if (passwordValue.length < 8) {
      return Response.json({ success: false, error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const env = getEnv(context);
    const existing = await getUserPasswordHashByEmail(emailValue, env);

    if (existing) {
      return Response.json(
        { success: false, error: "Account already exists. Continue with email and enter password." },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(passwordValue);
    const user = await createUser(
      crypto.randomUUID(),
      emailValue,
      null,
      null,
      "incomplete",
      null,
      null,
      null,
      env,
      passwordHash,
    );

    const lucia = createLucia(env);
    const session = await lucia.createSession(user.id, {});
    const headers = new Headers();
    setSessionCookie(headers, session.id, env);

    return Response.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.attributes.email,
          status: user.attributes.status,
        },
      },
      { status: 201, headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
