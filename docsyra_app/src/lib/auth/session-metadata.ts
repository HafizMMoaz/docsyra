export type SessionClientMetadata = {
  userAgent: string | null;
  ipAddress: string | null;
};

function takeFirstForwardedIp(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const first = value
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.length > 0);

  return first ?? null;
}

export function getSessionClientMetadata(request: Request): SessionClientMetadata {
  const userAgentRaw = request.headers.get("user-agent");
  const cfIp = request.headers.get("cf-connecting-ip");
  const forwardedIp = takeFirstForwardedIp(request.headers.get("x-forwarded-for"));

  const userAgent = userAgentRaw ? userAgentRaw.slice(0, 255) : null;
  const ipAddress = (cfIp ?? forwardedIp)?.slice(0, 64) ?? null;

  return {
    userAgent,
    ipAddress,
  };
}
