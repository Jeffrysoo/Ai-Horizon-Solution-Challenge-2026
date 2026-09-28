import sys

def update_css(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    marker = "/* --- MACHINED SLATE REDESIGN --- */"
    if marker in content:
        # truncate anything after the marker including the marker itself
        content = content[:content.find(marker)]

    append_css = """
/* --- MACHINED SLATE REDESIGN --- */

:root {
  /* Light mode tokens (Original) */
  --bg-canvas: #f2f2f3;
  --bg-surface: #ffffff; 
  --bg-surface-hover: #e9e9ea;
  --border-subtle: color-mix(in srgb, #1d1f20 16%, transparent);
  --border-focus: #4F82F5;
  --text-primary: #1d1f20;
  --text-secondary: #7a7a7d;
  --accent-primary: #4F82F5;
  --accent-warning: oklch(0.62 0.11 60);

  --font-heading: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Force some base colors for consistency in components */
  --color-accent: var(--accent-primary) !important;
  --color-accent-600: var(--accent-primary) !important;
}

[data-theme="dark"] {
  /* Machined Slate Dark Mode tokens */
  --bg-canvas: #090A0F !important;
  --bg-surface: #12141D !important;
  --bg-surface-hover: #1A1D27 !important;
  --border-subtle: rgba(255, 255, 255, 0.08) !important;
  --border-focus: #4F82F5 !important;
  --text-primary: #F3F4F6 !important;
  --text-secondary: #9CA3AF !important;
  --accent-warning: #F59E0B !important;

  /* Remap old variables to Machined Slate */
  --color-bg: var(--bg-canvas) !important;
  --color-surface: var(--bg-surface) !important;
  --color-text: var(--text-primary) !important;
  --color-divider: var(--border-subtle) !important;

  --color-neutral-100: var(--bg-surface-hover) !important;
  --color-neutral-200: var(--bg-surface-hover) !important;
  --color-neutral-300: var(--border-subtle) !important;
  --color-neutral-400: var(--text-secondary) !important;
  --color-neutral-500: var(--text-secondary) !important;
  --color-neutral-600: var(--text-secondary) !important;
  --color-neutral-700: var(--text-secondary) !important;
  --color-neutral-800: var(--text-primary) !important;
  --color-neutral-900: var(--text-primary) !important;

  --color-accent-100: var(--bg-surface-hover) !important;
  --color-accent-200: var(--bg-surface-hover) !important;
  --color-accent-300: var(--accent-primary) !important;
  --color-accent-400: var(--accent-primary) !important;
  --color-accent-500: var(--accent-primary) !important;
  --color-accent-600: var(--accent-primary) !important;
  --color-accent-700: var(--accent-primary) !important;
  --color-accent-800: var(--accent-primary) !important;
  --color-accent-900: var(--accent-primary) !important;

  --warn: var(--accent-warning) !important;
  --warn-bg: rgba(245, 158, 11, 0.05) !important;
  --warn-border: var(--accent-warning) !important;
  --warn-text: var(--accent-warning) !important;
  --warn-icon: var(--accent-warning) !important;
}

/* Base Body Update */
body {
  background-color: var(--bg-canvas) !important;
  background-repeat: no-repeat !important;
  background-attachment: fixed !important;
  color: var(--text-primary) !important;
}

[data-theme="dark"] body {
  background-image: radial-gradient(circle at 50% 0%, #171A26 0%, #090A0F 100%) !important;
}

/* Headings */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading) !important;
  font-weight: 500 !important;
}
h1, h2, .screen-title, .hero-title, .defect-name {
  font-weight: 700 !important;
}

/* Data Labels */
.kicker, .card-kicker, .date, .hero-meta .line-label, .mono, .history-table td.date {
  font-family: var(--font-mono) !important;
  font-size: 0.85rem !important;
}

/* Top Navigation (Steps) */
.step-pill, [data-theme="dark"] .step-pill {
  background: transparent !important;
  border: none !important;
  border-bottom: 2px solid transparent !important;
  border-radius: 0 !important;
  color: var(--text-secondary) !important;
  padding: 8px 16px !important;
}
.step-pill.current, [data-theme="dark"] .step-pill.current {
  border-bottom-color: var(--accent-primary) !important;
  color: var(--text-primary) !important;
}
.step-pill .lbl, [data-theme="dark"] .step-pill .lbl {
  border-bottom: none !important;
}

/* Cards (Surface Areas) */
.card, [data-theme="dark"] .card {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border-subtle) !important;
  border-radius: 8px !important;
  box-shadow: none !important;
}

/* Input Fields & Textareas */
.input, [data-theme="dark"] .input {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border-subtle) !important;
  border-radius: 4px !important;
  transition: border-color 0.2s;
  color: var(--text-primary) !important;
}
[data-theme="dark"] .input {
  background: #05060A !important;
}
.input:hover, [data-theme="dark"] .input:hover {
  border-color: var(--text-secondary) !important;
}
.input:focus-visible, [data-theme="dark"] .input:focus-visible {
  border-color: var(--border-focus) !important;
  outline: none !important;
}

/* Dropzone */
.dropzone, [data-theme="dark"] .dropzone {
  border: 1px solid var(--border-subtle) !important;
  background: var(--bg-surface) !important;
  border-radius: 8px !important;
}
.dropzone.dragover, [data-theme="dark"] .dropzone.dragover {
  border-color: var(--border-focus) !important;
  background: var(--bg-surface-hover) !important;
}

/* Cause Ranking Bars */
.cause-bar, [data-theme="dark"] .cause-bar {
  height: 4px !important;
  background: rgba(100, 100, 100, 0.1) !important;
  border: none !important;
}
[data-theme="dark"] .cause-bar {
  background: rgba(255, 255, 255, 0.1) !important;
}
.cause-bar i, [data-theme="dark"] .cause-bar i {
  background: linear-gradient(90deg, #3B82F6, #60A5FA) !important;
  inset: 0 auto 0 0 !important;
}
.cause-row, [data-theme="dark"] .cause-row {
  display: grid !important;
  grid-template-columns: 1fr 52px !important;
  grid-template-areas: "name pct" "bar bar" !important;
  align-items: end !important;
  gap: 4px !important;
}
.cause-row .name, [data-theme="dark"] .cause-row .name { grid-area: name !important; }
.cause-row .pct, [data-theme="dark"] .cause-row .pct { 
  grid-area: pct !important;
  font-family: var(--font-heading) !important;
  font-weight: 500 !important;
  text-align: right !important;
  color: var(--text-primary) !important;
}
.cause-row .cause-bar, [data-theme="dark"] .cause-row .cause-bar { grid-area: bar !important; width: 100% !important; margin-top: 4px; }

/* Buttons */
.btn, [data-theme="dark"] .btn {
  border-radius: 4px !important;
}
.btn-primary, [data-theme="dark"] .btn-primary {
  background: var(--text-primary) !important;
  color: var(--bg-canvas) !important;
  font-weight: 600 !important;
  border: none !important;
}
.btn-primary:hover, [data-theme="dark"] .btn-primary:hover {
  opacity: 0.9 !important;
}
.btn-secondary, [data-theme="dark"] .btn-secondary {
  background: transparent !important;
  border: 1px solid var(--border-subtle) !important;
  color: var(--text-secondary) !important;
}
.btn-secondary:hover, [data-theme="dark"] .btn-secondary:hover {
  border-color: var(--text-primary) !important;
  color: var(--text-primary) !important;
}

/* AI Reasoning Box */
.why-box, [data-theme="dark"] .why-box {
  background: var(--warn-bg, rgba(245, 158, 11, 0.05)) !important;
  border: none !important;
  border-left: 3px solid var(--accent-warning) !important;
  border-radius: 0 4px 4px 0 !important;
}
.why-box .lbl, [data-theme="dark"] .why-box .lbl {
  color: var(--accent-warning) !important;
}

/* Action Plan Checkbox */
.plan-row .check, [data-theme="dark"] .plan-row .check {
  border: 1px solid var(--border-subtle) !important;
  border-radius: 0 !important; /* custom square */
  background: transparent !important;
}
.plan-row.done .check, [data-theme="dark"] .plan-row.done .check {
  background: var(--accent-primary) !important;
  border-color: var(--accent-primary) !important;
}
.plan-row .check svg, [data-theme="dark"] .plan-row .check svg {
  display: none !important;
}
.plan-row.done .check svg, [data-theme="dark"] .plan-row.done .check svg {
  display: block !important;
  stroke: #fff !important;
}

/* FIX FOR DARK MODE CTA BAND */
[data-theme="dark"] .cta-band {
  background: var(--bg-surface-hover) !important;
}
[data-theme="dark"] .cta-band .headline {
  color: var(--text-primary) !important;
}
"""
    content += append_css

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("CSS updated perfectly to support both Light and Dark mode!")

if __name__ == "__main__":
    update_css(sys.argv[1])
