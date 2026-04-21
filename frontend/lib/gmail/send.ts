import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/encryption";
import {
  getGoogleOAuthConfig,
  isInvalidGrantError,
  refreshAccessToken,
} from "@/lib/gmail/oauth";

export class GmailNotConnectedError extends Error {
  constructor() {
    super("Gmail is not connected for this user/org.");
    this.name = "GmailNotConnectedError";
  }
}

export class GmailNeedsReauthError extends Error {
  constructor() {
    super("Gmail connection requires re-authentication.");
    this.name = "GmailNeedsReauthError";
  }
}

export class GmailSendError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string
  ) {
    super(message);
    this.name = "GmailSendError";
  }
}

type SendParams = {
  userId: string;
  orgId: string;
  to: string;
  subject: string;
  html: string;
  inReplyTo?: string;
};

type GmailApiResponse = {
  id: string;
  threadId: string;
};

export type SendResult = {
  messageId: string;
  threadId: string;
  fromEmail: string;
};

function encodeSubject(subject: string): string {
  // MIME-encode to safely handle non-ASCII subject lines.
  const needsEncoding = /[^\x20-\x7e]/.test(subject);
  if (!needsEncoding) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function buildMimeMessage(opts: {
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
  inReplyTo?: string;
}): string {
  const lines: string[] = [];
  lines.push(`From: ${opts.fromEmail}`);
  lines.push(`To: ${opts.to}`);
  lines.push(`Subject: ${encodeSubject(opts.subject)}`);
  lines.push("MIME-Version: 1.0");
  lines.push("Content-Type: text/html; charset=UTF-8");
  lines.push("Content-Transfer-Encoding: 7bit");
  if (opts.inReplyTo) {
    lines.push(`In-Reply-To: ${opts.inReplyTo}`);
    lines.push(`References: ${opts.inReplyTo}`);
  }
  lines.push("");
  lines.push(opts.html);
  return lines.join("\r\n");
}

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

async function postGmailSend(
  accessToken: string,
  raw: string
): Promise<{ ok: boolean; status: number; body: string; json: GmailApiResponse | null }> {
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    }
  );
  const text = await res.text();
  let json: GmailApiResponse | null = null;
  if (res.ok) {
    try {
      json = JSON.parse(text) as GmailApiResponse;
    } catch {
      json = null;
    }
  }
  return { ok: res.ok, status: res.status, body: text, json };
}

export async function sendGmailMessage(params: SendParams): Promise<SendResult> {
  const admin = createAdminClient();

  const { data: row, error } = await admin
    .from("gmail_credentials")
    .select(
      "id, google_email, access_token_encrypted, refresh_token_encrypted, access_token_expires_at, needs_reauth"
    )
    .eq("user_id", params.userId)
    .eq("org_id", params.orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Gmail credentials: ${error.message}`);
  }
  if (!row) {
    throw new GmailNotConnectedError();
  }
  if (row.needs_reauth === true) {
    throw new GmailNeedsReauthError();
  }

  const cfg = getGoogleOAuthConfig();
  const fromEmail = row.google_email as string;

  let accessToken = decrypt(row.access_token_encrypted as string);
  const refreshToken = decrypt(row.refresh_token_encrypted as string);
  const expiresAt = row.access_token_expires_at
    ? new Date(row.access_token_expires_at as string).getTime()
    : 0;

  // Proactive refresh if the token is about to expire (60s buffer).
  if (!expiresAt || expiresAt < Date.now() + 60_000) {
    accessToken = await refreshAndPersist(
      params.userId,
      params.orgId,
      refreshToken,
      cfg
    );
  }

  const mime = buildMimeMessage({
    fromEmail,
    to: params.to,
    subject: params.subject,
    html: params.html,
    inReplyTo: params.inReplyTo,
  });
  const raw = toBase64Url(mime);

  let send = await postGmailSend(accessToken, raw);

  // Reactive refresh on 401 (covers case where token expired mid-flight or
  // our expiry clock drifted). Try once, then give up.
  if (send.status === 401) {
    try {
      accessToken = await refreshAndPersist(
        params.userId,
        params.orgId,
        refreshToken,
        cfg
      );
    } catch (refreshErr) {
      if (isInvalidGrantError(refreshErr)) {
        await admin
          .from("gmail_credentials")
          .update({
            needs_reauth: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id as string);
        throw new GmailNeedsReauthError();
      }
      throw refreshErr;
    }
    send = await postGmailSend(accessToken, raw);
  }

  if (!send.ok || !send.json) {
    throw new GmailSendError(
      `Gmail send failed (${send.status})`,
      send.status,
      send.body
    );
  }

  // Fire-and-forget last_send_at update; don't block send result on it.
  admin
    .from("gmail_credentials")
    .update({ last_send_at: new Date().toISOString() })
    .eq("id", row.id as string)
    .then(() => {}, () => {});

  return {
    messageId: send.json.id,
    threadId: send.json.threadId,
    fromEmail,
  };
}

async function refreshAndPersist(
  userId: string,
  orgId: string,
  refreshToken: string,
  cfg: { clientId: string; clientSecret: string }
): Promise<string> {
  const admin = createAdminClient();
  const tokens = await refreshAccessToken(refreshToken, cfg);
  const newExpiresAt = new Date(
    Date.now() + tokens.expires_in * 1000
  ).toISOString();

  const update: Record<string, string> = {
    access_token_encrypted: encrypt(tokens.access_token),
    access_token_expires_at: newExpiresAt,
    updated_at: new Date().toISOString(),
  };
  // Google occasionally rotates refresh tokens.
  if (tokens.refresh_token) {
    update.refresh_token_encrypted = encrypt(tokens.refresh_token);
  }

  await admin
    .from("gmail_credentials")
    .update(update)
    .eq("user_id", userId)
    .eq("org_id", orgId);

  return tokens.access_token;
}
