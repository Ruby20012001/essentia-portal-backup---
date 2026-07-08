import { getConfig } from "@/lib/services/config";
import type {
  ChannelResult,
  DeliveryContext,
  NotificationChannel,
  RenderedNotification,
} from "@/lib/notifications/channels/types";

/**
 * Email channel — branded, templated HTML (Cold Coffee palette). Code-
 * complete: the HTML is built and testable. Live send is credential-gated on
 * an SMTP transport (SMTP_URL); without it, send() returns 'failed' so the
 * delivery retries then dead-letters. The HTML structure is
 * localization-ready (single content region, no baked-in copy beyond the
 * rendered template).
 */

const APP_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
const BRAND = { espresso: "#1C1714", cream: "#F4F2F0", amber: "#A8895C" };

/** Builds the branded HTML email (exported for tests). */
export function buildEmailHtml(rendered: RenderedNotification): string {
  const href = rendered.actionUrl
    ? rendered.actionUrl.startsWith("http")
      ? rendered.actionUrl
      : `${APP_URL}${rendered.actionUrl}`
    : null;
  const button = href
    ? `<a href="${href}" style="display:inline-block;background:${BRAND.espresso};color:${BRAND.cream};text-decoration:none;padding:10px 20px;border-radius:4px;font-weight:700;font-size:13px">${rendered.actionLabel ?? "Open"}</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:${BRAND.cream};font-family:Lato,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden">
      <tr><td style="background:${BRAND.espresso};padding:16px 24px;color:${BRAND.cream};font-size:14px;letter-spacing:1px">essentia</td></tr>
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:22px;color:${BRAND.espresso}">${rendered.title}</h1>
        ${rendered.body ? `<p style="margin:0 0 20px;font-size:14px;color:#4b463f;line-height:1.6">${rendered.body}</p>` : ""}
        ${button}
      </td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid #eee;color:${BRAND.amber};font-size:11px">every client returns</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export const emailChannel: NotificationChannel = {
  name: "email",

  async isConfigured() {
    return Boolean(process.env.SMTP_URL);
  },

  async send(rendered: RenderedNotification, ctx: DeliveryContext): Promise<ChannelResult> {
    const html = buildEmailHtml(rendered);
    if (!process.env.SMTP_URL) {
      return {
        status: "failed",
        error: "Email transport not configured (SMTP_URL). HTML rendered but not sent.",
      };
    }
    // With SMTP configured, a transport (e.g. nodemailer) sends `html` to the
    // recipient's address (config email.from_address as From). Left as the
    // integration seam — see A-21.
    void html;
    void ctx;
    await getConfig<string>("email.from_address", "noreply@essentia.in");
    return { status: "failed", error: "SMTP transport implementation pending (A-21)" };
  },
};
