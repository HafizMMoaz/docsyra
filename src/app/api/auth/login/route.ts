import { createUser, createLucia, setSessionCookie } from "@/lib/auth";
import { getEnv } from "@/lib/cloudflare/route-context";
import { getUserByEmail } from "@/lib/db/queries";

export const runtime = "edge";

type LoginBody = {
  email?: unknown;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  try {
    const body = (await request.json()) as LoginBody;
    const emailValue = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!emailValue || !isValidEmail(emailValue)) {
      return Response.json({ success: false, error: "Valid email is required" }, { status: 400 });
    }

    const env = getEnv(context);
    const lucia = createLucia(env);

    let user = await getUserByEmail(emailValue, env);
    if (!user) {
      user = await createUser(crypto.randomUUID(), emailValue, null, null, env);
    }

    const session = await lucia.createSession(user.id, {});
    const headers = new Headers();
    setSessionCookie(headers, session.id, env);

    return Response.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.attributes.email,
          name: user.attributes.name,
          avatar_url: user.attributes.avatar_url,
        },
      },
      { status: 200, headers },
    );
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }
}
