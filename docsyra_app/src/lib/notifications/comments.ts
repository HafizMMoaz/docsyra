import {
  createNotification,
  getCollaborators,
  getDocumentById,
  getUserById,
  type NotificationType,
} from "@/lib/db/queries";
import { sendEmail } from "@/lib/email";
import { commentNotificationTemplate } from "@/lib/email/templates";
import type { DbEnv } from "@/lib/db/client";

type NotifyOnCommentInput = {
  env?: DbEnv;
  documentId: string;
  actorUserId: string;
  threadId: string;
  commentId: string;
  commentContent: string;
  requestOrigin: string;
};

type Recipient = {
  userId: string;
  name: string | null;
  email: string | null;
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function extractMentionTokens(content: string): string[] {
  const tokens = new Set<string>();
  const regex = /@([a-zA-Z0-9._-]{2,64})/g;
  let match: RegExpExecArray | null = regex.exec(content);

  while (match) {
    const token = normalizeToken(match[1]);
    if (token.length > 1) {
      tokens.add(token);
    }

    match = regex.exec(content);
  }

  return Array.from(tokens);
}

function buildMentionIndex(recipient: Recipient): Set<string> {
  const values = new Set<string>();

  if (recipient.email) {
    const emailToken = normalizeToken(recipient.email);
    values.add(emailToken);

    const localPart = emailToken.split("@")[0];
    if (localPart) {
      values.add(localPart);
    }
  }

  if (recipient.name) {
    const normalizedName = normalizeToken(recipient.name);
    if (normalizedName) {
      values.add(normalizedName);
      values.add(slugify(normalizedName));

      for (const part of normalizedName.split(/\s+/)) {
        if (part) {
          values.add(part);
          values.add(slugify(part));
        }
      }
    }
  }

  return values;
}

export async function notifyOnComment(input: NotifyOnCommentInput): Promise<void> {
  const document = await getDocumentById(input.documentId, input.env);
  if (!document) {
    return;
  }

  const actor = await getUserById(input.actorUserId, input.env);
  const actorName = actor?.attributes.name?.trim() || actor?.attributes.email?.trim() || "Someone";

  const recipients = new Map<string, Recipient>();

  if (document.owner_id && document.owner_id !== input.actorUserId) {
    const owner = await getUserById(document.owner_id, input.env);
    if (owner) {
      recipients.set(owner.id, {
        userId: owner.id,
        name: owner.attributes.name,
        email: owner.attributes.email,
      });
    }
  }

  const collaborators = await getCollaborators(input.documentId, input.env);
  for (const collaborator of collaborators) {
    if (collaborator.user_id === input.actorUserId) {
      continue;
    }

    if (!recipients.has(collaborator.user_id)) {
      recipients.set(collaborator.user_id, {
        userId: collaborator.user_id,
        name: collaborator.name,
        email: collaborator.email,
      });
    }
  }

  if (recipients.size === 0) {
    return;
  }

  const mentionTokens = extractMentionTokens(input.commentContent);
  const mentionByUserId = new Map<string, string>();

  if (mentionTokens.length > 0) {
    for (const recipient of recipients.values()) {
      const index = buildMentionIndex(recipient);
      for (const token of mentionTokens) {
        if (index.has(token) || index.has(slugify(token))) {
          mentionByUserId.set(recipient.userId, token);
          break;
        }
      }
    }
  }

  const documentTitle = document.title?.trim() || "Untitled";
  const documentLink = `${input.requestOrigin}/editor/${encodeURIComponent(input.documentId)}`;

  for (const recipient of recipients.values()) {
    const mentionToken = mentionByUserId.get(recipient.userId) ?? null;
    const type: NotificationType = mentionToken ? "mention" : "comment";

    await createNotification(
      {
        userId: recipient.userId,
        actorUserId: input.actorUserId,
        documentId: input.documentId,
        threadId: input.threadId,
        commentId: input.commentId,
        type,
        mentionToken,
        message: mentionToken
          ? `${actorName} mentioned you in ${documentTitle}`
          : `${actorName} commented on ${documentTitle}`,
      },
      input.env,
    );

    if (!recipient.email) {
      continue;
    }

    try {
      await sendEmail(
        {
          to: recipient.email,
          subject: mentionToken ? `Mention in ${documentTitle}` : `New comment in ${documentTitle}`,
          html: commentNotificationTemplate({
            recipientName: recipient.name?.trim() || "there",
            actorName,
            documentTitle,
            commentContent: input.commentContent,
            documentLink,
            mentionToken,
          }),
        },
        {
          RESEND_API_KEY: (input.env as { RESEND_API_KEY?: string } | undefined)?.RESEND_API_KEY,
        },
      );
    } catch {
      // Non-blocking email failures.
    }
  }
}
