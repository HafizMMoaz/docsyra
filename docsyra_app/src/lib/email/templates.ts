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

export function welcomeEmailTemplate(dashboardLink: string): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">Welcome to Docsyra</h2>
      <p style="margin: 0 0 12px;">Your email has been verified and your account is ready.</p>
      <p style="margin: 0 0 16px;">
        <a href="${dashboardLink}" style="background: #0f172a; color: #ffffff; padding: 10px 14px; border-radius: 8px; text-decoration: none; display: inline-block;">Open Dashboard</a>
      </p>
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

export function inviteRegistrationTemplate(input: {
  docTitle: string;
  docLink: string;
  registerLink: string;
  isPublicDocument: boolean;
}): string {
  const accessMessage = input.isPublicDocument
    ? "This document is public, so you can view it without signing up."
    : "Create your Docsyra account with this email to open the shared document.";

  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">You were invited to a document</h2>
      <p style="margin: 0 0 8px;">Document: <strong>${input.docTitle}</strong></p>
      <p style="margin: 0 0 8px;">${accessMessage}</p>
      <p style="margin: 0 0 16px;">
        <a href="${input.registerLink}" style="background: #0f172a; color: #ffffff; padding: 10px 14px; border-radius: 8px; text-decoration: none; display: inline-block; margin-right: 8px;">Create account</a>
        <a href="${input.docLink}" style="background: #e2e8f0; color: #0f172a; padding: 10px 14px; border-radius: 8px; text-decoration: none; display: inline-block;">Open document</a>
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

export function commentNotificationTemplate(input: {
  recipientName: string;
  actorName: string;
  documentTitle: string;
  commentContent: string;
  documentLink: string;
  mentionToken?: string | null;
}): string {
  const heading = input.mentionToken
    ? `${input.actorName} mentioned you in ${input.documentTitle}`
    : `${input.actorName} commented on ${input.documentTitle}`;

  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">${heading}</h2>
      <p style="margin: 0 0 10px;">Hi ${input.recipientName || "there"},</p>
      <p style="margin: 0 0 10px;">${input.actorName} left a new ${input.mentionToken ? "mention" : "comment"}:</p>
      <blockquote style="margin: 0 0 14px; border-left: 3px solid #cbd5e1; padding: 8px 12px; background: #f8fafc;">${input.commentContent}</blockquote>
      <p style="margin: 0 0 16px;">
        <a href="${input.documentLink}" style="background: #0f172a; color: #ffffff; padding: 10px 14px; border-radius: 8px; text-decoration: none; display: inline-block;">Open discussion</a>
      </p>
    </div>
  `;
}
