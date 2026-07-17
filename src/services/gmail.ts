import type { RelayEmail, TrashRow } from "../inbox/types";

const GMAIL_API = "https://www.googleapis.com/gmail/v1/users/me";

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: string;
  payload: {
    headers: { name: string; value: string }[];
    parts?: {
      mimeType: string;
      body: { data?: string; size: number };
    }[];
    body?: { data?: string; size: number };
    mimeType: string;
  };
}

interface GmailMessageList {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailLabel {
  id: string;
  name: string;
}

const LABEL_TO_TYPE: Record<string, string> = {
  CATEGORY_PERSONAL: "casual",
  CATEGORY_SOCIAL: "social",
  CATEGORY_PROMOTIONS: "promotional",
  CATEGORY_UPDATES: "newsletter",
  CATEGORY_FORUMS: "newsletter",
  CATEGORY_NEWSLETTERS: "newsletter",
  CATEGORY_WORK: "work",
  CATEGORY_FINANCE: "finance",
  CATEGORY_RESERVATIONS: "travel",
  CATEGORY_PURCHASES: "ecommerce",
};

function decodeBody(data: string): string {
  try {
    return atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return "";
  }
}

function getHeader(
  headers: { name: string; value: string }[],
  name: string,
): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractEmail(body: string): string {
  const match = body.match(/<([^>]+@[^>]+)>/);
  return match ? match[1] : body;
}

function classifyType(labelIds: string[], subject: string): string {
  for (const label of labelIds) {
    if (LABEL_TO_TYPE[label]) return LABEL_TO_TYPE[label];
  }

  const lower = subject.toLowerCase();
  if (/\bsecurity|alert|breach|password|2fa|otp\b/i.test(lower)) return "security";
  if (/\breceipt|invoice|order|payment|statement\b/i.test(lower)) return "finance";
  if (/\breservation|flight|hotel|booking|travel\b/i.test(lower)) return "travel";
  if (/\bnewsletter|digest|weekly|monthly|unsubscribe\b/i.test(lower)) return "newsletter";
  if (/\bsale|discount|offer|promo|deal|off\b/i.test(lower)) return "promotional";
  if (/\breminder|appointment|calendar\b/i.test(lower)) return "reminder";
  if (/\bverification|verify|confirm|account\b/i.test(lower)) return "security";

  return "casual";
}

function gmailToRelay(
  msg: GmailMessage,
): RelayEmail {
  const headers = msg.payload?.headers ?? [];
  const from = getHeader(headers, "From");
  const nameParts = from.match(/^"?([^"<]+)"?\s*</);
  const name = nameParts ? nameParts[1].trim() : undefined;
  const email = extractEmail(from);
  const sender = name ?? email.split("@")[0];
  const subject = getHeader(headers, "Subject") || "(no subject)";
  const type = classifyType(msg.labelIds, subject);

  let body = "";
  if (msg.payload?.body?.data) {
    body = decodeBody(msg.payload.body.data);
  } else if (msg.payload?.parts) {
    const textPart = msg.payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) {
      body = decodeBody(textPart.body.data);
    } else {
      const htmlPart = msg.payload.parts.find((p) => p.mimeType === "text/html");
      if (htmlPart?.body?.data) {
        body = decodeBody(htmlPart.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
  }

  const snippet = msg.snippet ?? "";
  const displayBody = body || snippet;

  return {
    id: parseInt(msg.id, 10),
    sender,
    name,
    email,
    receivedAt: parseInt(msg.internalDate, 10),
    subject,
    body: displayBody.length > 200 ? displayBody.slice(0, 200) + "…" : displayBody,
    type,
    starred: msg.labelIds.includes("STARRED"),
    urgent: msg.labelIds.includes("IMPORTANT") || msg.labelIds.includes("STARRED"),
  };
}

export async function fetchGmailMessages(
  accessToken: string,
  maxResults = 100,
): Promise<{ emails: RelayEmail[]; trash: TrashRow[] }> {
  let allMessages: { id: string; threadId: string }[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ maxResults: String(maxResults) });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${GMAIL_API}/messages?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      if (res.status === 401) throw new Error("TOKEN_EXPIRED");
      throw new Error(`Gmail API error: ${res.status}`);
    }

    const data: GmailMessageList = await res.json();
    allMessages = allMessages.concat(data.messages ?? []);
    pageToken = data.nextPageToken;
  } while (pageToken && allMessages.length < maxResults);

  const emails: RelayEmail[] = [];
  const trashSenders = new Set<string>();

  for (const { id } of allMessages) {
    try {
      const msgRes = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!msgRes.ok) continue;

      const msg: GmailMessage = await msgRes.json();

      if (msg.labelIds.includes("TRASH") || msg.labelIds.includes("SPAM")) {
        const trashHeaders = msg.payload?.headers ?? [];
        const trashFrom = getHeader(trashHeaders, "From");
        const trashEmail = extractEmail(trashFrom);
        const sender = msg.labelIds.includes("TRASH")
          ? (trashFrom.match(/^"?([^"<]+)"?\s*</)?.[1]?.trim() ?? trashEmail.split("@")[0])
          : undefined;
        if (sender && msg.labelIds.includes("TRASH")) {
          trashSenders.add(sender);
        }
        continue;
      }

      emails.push(gmailToRelay(msg));
    } catch {
      continue;
    }
  }

  const trash: TrashRow[] = [...trashSenders].map((sender) => ({ sender }));

  return { emails, trash };
}

export async function fetchGmailLabels(
  accessToken: string,
): Promise<GmailLabel[]> {
  const res = await fetch(`${GMAIL_API}/labels`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return [];
  const data = await res.json();
  return data.labels ?? [];
}

export async function modifyGmailMessage(
  accessToken: string,
  messageId: string,
  addLabelIds?: string[],
  removeLabelIds?: string[],
): Promise<boolean> {
  const res = await fetch(`${GMAIL_API}/messages/${messageId}/modify`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
  return res.ok;
}


