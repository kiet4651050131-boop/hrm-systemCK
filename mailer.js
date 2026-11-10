const nodemailer = require('nodemailer');

function getMailConfig() {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const appUrl = String(process.env.APP_URL || '').replace(/\/+$/, '');
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM || !appUrl
    || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  let url;
  try { url = new URL(appUrl); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHost)) return null;
  return {
    host: process.env.SMTP_HOST,
    port,
    secure,
    from: process.env.SMTP_FROM,
    appUrl,
    auth: process.env.SMTP_USER && process.env.SMTP_PASS
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  };
}

function sendEmail(config, message) {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    ...(config.auth ? { auth: config.auth } : {}),
  });
  return transporter.sendMail({ from: config.from, ...message });
}

let missingConfigReported = false;
function notifyWorkflowEmail(recipients, subject, text) {
  const config = getMailConfig();
  if (!config) {
    if (!missingConfigReported) {
      console.error('Không gửi được email quy trình: cấu hình SMTP hoặc APP_URL chưa đầy đủ.');
      missingConfigReported = true;
    }
    return;
  }
  missingConfigReported = false;
  [...new Set(recipients.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean))]
    .forEach((to) => {
      sendEmail(config, { to, subject, text: `${text}\n\n${config.appUrl}` })
        .catch((error) => console.error(`Không gửi được email quy trình đến ${to}:`, error.message));
    });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

module.exports = { getMailConfig, sendEmail, notifyWorkflowEmail, escapeHtml };
