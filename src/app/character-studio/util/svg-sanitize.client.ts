import DOMPurify from 'dompurify';

/**
 * CLIENT-SIDE SVG sanitization — PREVIEW ONLY, NOT AUTHORITATIVE.
 *
 * User-drawn SVG is a stored-XSS vector. This DOMPurify pass (svg profile +
 * hardening) makes a drawn part safe enough to render in the live preview, but
 * it is NOT the security boundary: before any drawn part is persisted or served,
 * the user-bff server-side sanitizer (allowlist safe-subset) must re-sanitize it
 * — SANITIZE → MODERATE → STORE. Never trust client output. See
 * hugmesh-vn-character-studio-v2 §0/§2.
 */
export function sanitizeSvgClient(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // belt-and-braces over the profile defaults: no scripting / external-ref vectors.
    FORBID_TAGS: ['foreignObject', 'use', 'image', 'a', 'script', 'style', 'iframe'],
    FORBID_ATTR: ['href', 'xlink:href', 'onload', 'onclick', 'onmouseover'],
    // keep the region recolor classes
    ADD_ATTR: ['class'],
    // strip DOCTYPE/processing-instructions (XXE-ish surface)
    WHOLE_DOCUMENT: false,
  });
}
