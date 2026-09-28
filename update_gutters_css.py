import sys

def append_css(filepath):
    with open(filepath, 'a', encoding='utf-8') as f:
        f.write("""

/* --- AMBIENT BACKGROUND GUTTERS --- */

:root {
  --gutter-stroke: rgba(30, 41, 59, 0.05);
  --gutter-accent: rgba(59, 130, 246, 0.08);
  --gutter-fade: linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.8) 0%,
    rgba(255, 255, 255, 0) 25%,
    rgba(255, 255, 255, 0) 75%,
    rgba(255, 255, 255, 0.8) 100%
  );
}

[data-theme="dark"], body.dark-mode {
  --gutter-stroke: rgba(248, 250, 252, 0.04);
  --gutter-accent: rgba(96, 165, 250, 0.09);
  --gutter-fade: linear-gradient(
    to bottom,
    rgba(9, 10, 15, 0.9) 0%,
    rgba(9, 10, 15, 0) 20%,
    rgba(9, 10, 15, 0) 80%,
    rgba(9, 10, 15, 0.9) 100%
  );
}

.ambient-gutters {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  pointer-events: none;
  user-select: none;
  z-index: 0;
  display: flex;
  justify-content: space-between;
}

.gutter-left, .gutter-right {
  width: 340px;
  height: 100%;
  position: relative;
}

.ambient-gutters svg {
  width: 100%;
  height: 100%;
  display: block;
}

/* Edge Softening & Vignette via mask-image and overlay */
.gutter-left {
  -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%);
  mask-image: linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%);
}

.gutter-right {
  -webkit-mask-image: linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%);
  mask-image: linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%);
}

.gutter-left::after, .gutter-right::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: var(--gutter-fade);
}

/* Ensure content is layered above the ambient graphics */
main, .screen-wide, .screen-report {
  position: relative;
  z-index: 1;
}
/* Ensure topbar is also above */
.topbar {
  position: relative;
  z-index: 2;
}

/* Responsiveness */
@media (max-width: 1279px) {
  .ambient-gutters {
    opacity: 0.5;
  }
}

@media (max-width: 1023px) {
  .ambient-gutters {
    display: none;
  }
}
""")
    print("Ambient gutters CSS appended!")

if __name__ == "__main__":
    append_css(sys.argv[1])
