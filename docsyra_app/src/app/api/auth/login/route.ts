import { createLucia, setSessionCookie } from "@/lib/auth";
import { verifyPassword } from "@/lib/auth/password";
import { getEnv } from "@/lib/cloudflare/route-context";
import { getUserByEmail, getUserPasswordHashByEmail } from "@/lib/db/queries";

export const runtime = "edge";

type LoginBody = {
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
  let body: LoginBody;

  try {
    body = (await request.json()) as LoginBody;
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
      return Response.json(
        { success: false, error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    const env = getEnv(context);
    const lucia = createLucia(env);

    const user = await getUserByEmail(emailValue, env);
    if (!user) {
      return Response.json({ success: false, error: "Account not found. Continue with email to create one." }, { status: 404 });
    }

    const credentials = await getUserPasswordHashByEmail(emailValue, env);

    if (!credentials?.password_hash) {
      return Response.json(
        {
          success: false,
          error: "This account uses social login. Continue with Google/GitHub.",
        },
        { status: 403 },
      );
    }

    const validPassword = await verifyPassword(passwordValue, credentials.password_hash);
    if (!validPassword) {
      return Response.json({ success: false, error: "Invalid email or password" }, { status: 401 });
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
          status: user.attributes.status,
          profession: user.attributes.profession,
          industry: user.attributes.industry,
          country: user.attributes.country,
        },
      },
      { status: 200, headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
