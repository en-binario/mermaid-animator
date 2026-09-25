# Spec Delta

## MODIFIED Requirements

### Requirement: Nonce-based Content Security Policy
The webview document SHALL carry a Content Security Policy with `default-src 'none'`, scripts allowed only by a per-render random nonce or from the extension's webview resource origin, style elements and stylesheets only from that origin or by nonce, inline style attributes permitted (`style-src-attr 'unsafe-inline'`, required because Mermaid's own renderer writes style attributes in the generic fallback), images from that origin plus `data:` and `blob:`, fonts from that origin plus `data:`, workers from that origin plus `blob:`, and `connect-src 'none'`. Style content extracted from Mermaid's output SHALL be applied as constructed stylesheets, never as inline `<style>` elements.

#### Scenario: Policy present and nonce fresh
- **WHEN** the animator panel's HTML is generated twice
- **THEN** each document contains the policy above and the two nonces differ and are at least 128 bits of randomness

#### Scenario: Injected inline script is blocked
- **WHEN** content containing an inline `<script>` element without the nonce is inserted into the webview document
- **THEN** the script does not execute

#### Scenario: Injected style element is blocked
- **WHEN** a `<style>` element without the nonce is inserted into the webview document
- **THEN** its rules are not applied
