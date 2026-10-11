# GpuHedger brand

**Mark: "G-stack"** (direction B in [`preview.html`](preview.html)): isometric slabs stacked into a G. Faces are shaded from
the lime token: top `#d9f7bb` (lime + 25% white), front `#c0f18e` (lime), side `#7f9e5d` (lime + 35% black). Wordmark:
**GpuHedger** in Inter Tight Bold, tracking −0.035em.

| File (in `assets/`, also served from `frontend/public/brand/`) | Use |
|---|---|
| `gpuhedger-submission-1024.png` | **Hackathon submission logo** (1024×1024, mark + wordmark on `#00161b`, 23 KB) |
| `gpuhedger-mark-1024.png` | Mark only, transparent, 1024×1024 |
| `gpuhedger-mark.svg` | Mark, full colour, vector |
| `gpuhedger-mark-white.svg` / `-dark.svg` | Single colour for dark / light backgrounds |
| `gpuhedger-mark-lime-on-teal.svg` | Lime mark on a teal tile |
| `gpuhedger-lockup-white.svg` / `.png` | Horizontal lockup, white wordmark, for dark backgrounds (PNG transparent, 1200×300) |
| `gpuhedger-lockup-dark.svg` / `gpuhedger-lockup-dark-text.png` | Lockup with dark wordmark, for light backgrounds |
| `gpuhedger-lockup-dark.png` | Lockup on the dark canvas (opaque) |
| `og.png` | Social card 1200×630 (`og:image`, `twitter:image`) |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` (180), `icon-512.png` | Browser and app icons |

The lockup SVGs use live text (Inter Tight with fallbacks). If a tool needs a font-free file, outline the text in a
design tool, or use the PNGs.

## Rules

- Lime is the brand and action colour; never use the mark's lime to mean profit.
- Keep clear space of at least one slab height (≈ 1/8 of the mark) around it. Minimum size 16px.
- Don't rotate, recolour (other than the single-colour versions), or add effects.

## Re-exporting the PNGs

The PNGs are rendered from the app's own components by a dev-only page (`frontend/brand.html`, not in the production
build). With the dev server running on port 5174 (`OPEN=0 PORT=5174 ./start.sh`):

```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
shot() { "$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --default-background-color=00000000 \
  --virtual-time-budget=6000 --window-size=$2 --screenshot="frontend/public/brand/$1" "http://localhost:5174/brand.html?$3"; }
shot og.png 1200,630 "asset=og"
shot gpuhedger-submission-1024.png 1024,1024 "asset=submission"
shot gpuhedger-lockup-white.png 1200,300 "asset=lockup&bg=none"
shot gpuhedger-lockup-dark-text.png 1200,300 "asset=lockup&bg=none&text=dark"
shot gpuhedger-lockup-dark.png 1200,300 "asset=lockup&bg=dark"
shot icon-512.png 512,512 "asset=icon&size=512&bg=dark"
shot apple-touch-icon.png 180,180 "asset=icon&size=180&bg=dark"
shot favicon-32.png 32,32 "asset=icon&size=32&bg=none"
shot gpuhedger-mark-1024.png 1024,1024 "asset=icon&size=1024&bg=none"
```
