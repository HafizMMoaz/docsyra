export function verifyEmailTemplate(link: string): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">Verify your email</h2>
      <p style="margin: 0 0 12px;">Click the button below to verify your email address.</p>
      <p style="margin: 0 0 16px;">
        <a href="${link}" style="background: #0f172a; color: #ffffff; padding: 10px 14px; border-radius: 8px; text-decoration: none; display: inline-block;">Verify Email</a>
      </p>
      <p style="margin: 0; font-size: 12px; color: #475569;">If you did not create this account, you can ignore this email.</p>
    </div>
  `;
}

export function inviteTemplate(docTitle: string, link: string): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">You were invited to a document</h2>
      <p style="margin: 0 0 8px;">Document: <strong>${docTitle}</strong></p>
      <p style="margin: 0 0 16px;">
        <a href="${link}" style="background: #0f172a; color: #ffffff; padding: 10px 14px; border-radius: 8px; text-decoration: none; display: inline-block;">Open Document</a>
      </p>
    </div>
  `;
}

export function resetPasswordTemplate(link: string): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">Reset your password</h2>
      <p style="margin: 0 0 12px;">Click the button below to set a new password.</p>
      <p style="margin: 0 0 16px;">
        <a href="${link}" style="background: #0f172a; color: #ffffff; padding: 10px 14px; border-radius: 8px; text-decoration: none; display: inline-block;">Reset Password</a>
      </p>
      <p style="margin: 0; font-size: 12px; color: #475569;">This link expires soon for your security.</p>
    </div>
  `;
}

export function suspiciousLoginTemplate(input: {
  ipAddress: string | null;
  userAgent: string | null;
  reasons: string[];
  timeIso: string;
}): string {
  const reasonText = input.reasons
    .map((reason) => (reason === "new_ip" ? "New IP address" : "New device/browser"))
    .join(" and ");

  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">Suspicious Login Detected</h2>
      <p style="margin: 0 0 12px;">We detected a login that looks unusual for your account.</p>
      <p style="margin: 0 0 8px;"><strong>Reason:</strong> ${reasonText || "Unusual session metadata"}</p>
      <p style="margin: 0 0 8px;"><strong>Time (UTC):</strong> ${input.timeIso}</p>
      <p style="margin: 0 0 8px;"><strong>IP:</strong> ${input.ipAddress ?? "Unknown"}</p>
      <p style="margin: 0 0 16px;"><strong>Device:</strong> ${input.userAgent ?? "Unknown"}</p>
      <p style="margin: 0; font-size: 12px; color: #475569;">If this was not you, reset your password and review your connected accounts immediately.</p>
    </div>
  `;
}
