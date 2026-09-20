# SpaceUp Vol 8 — Baseline Context

Paste this file's content alongside every phase prompt in BUILD_PHASES.md. It does not change between phases — it's the standing spec the agent should hold constant throughout the build.

---

## Project
SpaceUp Vol 8 — India's Biggest Space Unconference. Marketing/info site + registration flow, retro 16-bit arcade / sci-fi terminal theme (mature, not childish). Reference image: pixel-art "GAME OVER" space screen — navy sky, rust-orange painterly planets, bordered YES/NO buttons, pixel mountain strip. Check every new component against that image's chrome before considering it done.

## Stack
- React + Vite (no Next.js)
- React Router for `/`, `/register`, `/team`
- Supabase (Postgres + client SDK) for registration data — added in Phase 11, not before
- Razorpay/UPI for payment — added in Phase 11
- Plain CSS with custom properties for tokens (no Tailwind/Bootstrap/Material unless explicitly instructed otherwise)

## Folder Structure
```
src/
  components/
    layout/       Nav.jsx, Footer.jsx
    sections/      Hero.jsx, About.jsx, Countdown.jsx, Speakers.jsx,
                    Schedule.jsx, Journey.jsx, Sponsors.jsx, Contact.jsx, Location.jsx
    ui/            Button.jsx, Card.jsx, MarqueeText.jsx, MarqueeImages.jsx
  pages/
    Landing.jsx    (composes all sections in order)
    Register.jsx
    Team.jsx
  styles/
    tokens.css     (all CSS custom properties — colors, fonts, spacing)
    global.css
  assets/
    sprites/       astronaut, planets, terrain (pixel art)
    photos/        past event photos, sponsor logos
  lib/
    supabaseClient.js
  App.jsx
  main.jsx
```

## Design Tokens (put these in `styles/tokens.css`, reference via `var(--...)` everywhere — never hardcode hex inline)
```css
:root {
  --bg: #0B0E1A;
  --bg-panel: #131A2C;
  --accent-orange: #D4703A;
  --accent-tan: #E8C9A0;
  --accent-cyan: #5FA8B0;
  --text: #EDEDED;
  --text-muted: #8B93A7;
  --font-pixel: 'VT323', monospace;   /* or Silkscreen / Departure Mono */
  --font-body: 'Inter', sans-serif;
}
```
Max 3 colors in the palette (navy base + orange + cyan). No purple/green/pink/neon saturation anywhere.

## Typography Rule
`--font-pixel` is used ONLY for: section headlines, button labels, eyebrow/label text. Never for body paragraphs, form fields, or nav links — those always use `--font-body`. If a component ends up with pixel-font body text, that's a bug, fix it.

## Component Chrome Rules (non-negotiable across every phase)
- No `border-radius` anywhere in base button/card styles.
- No `box-shadow` used as drop-shadow (soft shadows). `box-shadow` is allowed only as a hover/focus glow effect in `--accent-orange` or `--accent-cyan`, low opacity.
- No gradients on buttons or cards.
- No glassmorphism, no skeuomorphic bevels.
- Buttons/cards: 1-2px solid border in an accent color, flat background.
- Every interactive element needs a visible focus state (accessibility) using the same border/glow language.

## Content Rules
- Never invent placeholder speakers, fake stats, or fabricated sponsor names. If real content isn't provided yet, leave a clearly marked `{/* TODO: content */}` placeholder — do not fill it with fictional data.
- Registration/Schedule/Contact copy stays plain and clear — no arcade/sci-fi voice in functional copy. Sci-fi framing is reserved for section transitions, loading text, and button labels only (and only once we reach that phase).

## What NOT to build yet
Do not implement any of the following unless the current phase explicitly says to:
- Clickable/interactive planets, boot-loader/loading sequence, custom cursor, or any other Easter egg
- Supabase wiring or payment integration
- `/register` or `/team` page content (routes can exist as empty placeholders once routing is scaffolded, but no content until their phase)
