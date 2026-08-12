/**
 * Send data out to another system.
 *
 * This is the answer to "a person fills in my form and it should land in the
 * right place in my Excel". Creora does not build a Sheets integration, then an
 * Excel one, then a CRM one. It sends a webhook, and Zapier, Make, n8n, Power
 * Automate and every CRM already accept one. One thing built, all of them work.
 */

export interface WebhookPayload {
  source: 'creora';
  pageId: string | null;
  block: string;
  sentAt: string;
  /** Flat, so the receiving tool maps it straight onto columns. */
  data: Record<string, any>;
}

export async function sendWebhook(url: string, payload: WebhookPayload): Promise<void> {
  const body = JSON.stringify(payload);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) throw new Error('The receiver answered ' + res.status);
    return;
  } catch {
    // Many receivers accept the request but send no CORS headers back, so the
    // browser refuses to let us READ the reply even though the POST arrived.
    // no-cors sends it anyway; we simply cannot know the outcome.
    //
    // no-cors forbids application/json, and text/plain is on the allowed list.
    // Zapier, Make and n8n all parse a JSON body sent as text/plain.
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body,
      });
    } catch {
      throw new Error('Could not reach that address. Check it is right and starts with https://');
    }
  }
}
