import DOMPurify from 'dompurify';

const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true },
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

export function sanitizeHtml(html) {
  return DOMPurify.sanitize(String(html || ''), SANITIZE_CONFIG);
}

