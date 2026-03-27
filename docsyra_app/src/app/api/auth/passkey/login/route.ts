import { createPasskeyLoginOptions } from "@/lib/auth/passkeys";
import { getEnv } from "@/lib/cloudflare/route-context";
import { getUserByEmail, getPasskeysByUserId } from "@/lib/db/queries";

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

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) {
    return Response.json({ success: false, error: "Valid email is required" }, { status: 400 });
  }

  const env = getEnv(context);
  const user = await getUserByEmail(email, env);
  if (!user) {
    return Response.json({ success: false, error: "No passkeys found for this account" }, { status: 404 });
  }

  const passkeys = await getPasskeysByUserId(user.id, env);
  if (passkeys.length === 0) {
    return Response.json({ success: false, error: "No passkeys found for this account" }, { status: 404 });
  }

  const loginOptions = await createPasskeyLoginOptions({
    email,
    credentialIds: passkeys.map((entry) => entry.credentialId),
    env,
  });

  const headers = new Headers();
  headers.append("Set-Cookie", loginOptions.setCookie);

  return Response.json(
    {
      success: true,
      options: loginOptions.options,
    },
    { status: 200, headers },
  );
}
