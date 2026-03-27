import { getRequestContext } from "@cloudflare/next-on-pages";

type EmailEnv = {
  RESEND_API_KEY?: string;
};

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

function resolveApiKey(env?: EmailEnv): string | null {
  if (env?.RESEND_API_KEY) {
    return env.RESEND_API_KEY;
  }

  try {
    const requestContext = getRequestContext() as unknown as { env?: EmailEnv };
    if (requestContext.env?.RESEND_API_KEY) {
      return requestContext.env.RESEND_API_KEY;
    }
  } catch {
    // Ignore context resolution errors and fall back to process env.
  }

  const fromProcess = process.env.RESEND_API_KEY;
  return fromProcess && fromProcess.length > 0 ? fromProcess : null;
}

export async function sendEmail(input: SendEmailInput, env?: EmailEnv): Promise<void> {
  const apiKey = resolveApiKey(env);
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Docsyra <no-reply@docsyra.app>",
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend error ${response.status}: ${details}`);
  }
}
