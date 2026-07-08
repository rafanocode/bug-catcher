import type { CSSProperties } from 'react'

export const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

// Injected once per mounted bubble. Class names are prefixed to avoid
// colliding with the consuming app's own CSS.
export const GLOBAL_STYLES = `
@keyframes bug-catcher-pop-in {
  from { opacity: 0; transform: translateY(8px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes bug-catcher-spin {
  to { transform: rotate(360deg); }
}
.bug-catcher-bubble-btn {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.bug-catcher-bubble-btn:hover {
  transform: scale(1.06);
  box-shadow: 0 6px 20px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.2);
}
.bug-catcher-bubble-btn:active {
  transform: scale(0.96);
}
.bug-catcher-bubble-btn:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(0,0,0,0.15);
}
.bug-catcher-panel {
  animation: bug-catcher-pop-in 0.16s ease-out;
}
.bug-catcher-textarea {
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  outline: none;
}
.bug-catcher-btn-primary:hover:not(:disabled) {
  filter: brightness(1.08);
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.bug-catcher-btn-primary:active:not(:disabled) {
  transform: scale(0.97);
}
.bug-catcher-btn-secondary:hover:not(:disabled) {
  background-color: #f3f4f6;
}
.bug-catcher-btn-primary,
.bug-catcher-btn-secondary {
  transition: filter 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease, background-color 0.15s ease;
}
.bug-catcher-spinner {
  animation: bug-catcher-spin 0.6s linear infinite;
}
`

export const panelStyle: CSSProperties = {
  fontFamily: FONT_FAMILY,
  background: '#fff',
  color: '#111827',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 16,
  boxShadow: '0 12px 32px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)',
  width: 300,
}

export const titleStyle: CSSProperties = {
  margin: '0 0 10px',
  fontSize: 14,
  fontWeight: 600,
  color: '#111827',
}

// Inline `border`/`boxShadow` always win over the injected stylesheet's
// `:focus` rule (inline style has higher CSS specificity than any
// selector), so focus styling is driven by React state instead of CSS
// pseudo-classes here.
export function textareaStyle(focused: boolean): CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    padding: '8px 10px',
    border: `1px solid ${focused ? 'var(--bug-catcher-accent, #6366f1)' : '#d1d5db'}`,
    borderRadius: 8,
    resize: 'vertical',
    color: '#111827',
    boxShadow: focused ? '0 0 0 3px rgba(15, 23, 42, 0.08)' : 'none',
  }
}

export const alertStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  marginTop: 8,
  padding: '8px 10px',
  borderRadius: 8,
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#b91c1c',
  fontSize: 12.5,
}

export const successIconWrapStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  background: '#dcfce7',
  color: '#16a34a',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 20,
  marginBottom: 10,
}

export function primaryButtonStyle(primaryColor: string, disabled: boolean): CSSProperties {
  return {
    backgroundColor: primaryColor,
    color: '#fff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

export function secondaryButtonStyle(disabled: boolean): CSSProperties {
  return {
    background: 'transparent',
    color: '#4b5563',
    border: '1px solid #d1d5db',
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

export function accentVars(primaryColor: string): CSSProperties {
  return { '--bug-catcher-accent': primaryColor } as CSSProperties
}
