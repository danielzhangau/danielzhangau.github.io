# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal portfolio and blog for Bosheng (Daniel) Zhang — AI/ML Engineer based in Brisbane, Australia. Previously at Vision HQ (2022-2025), now independently researching domain-specific business chatbots. Site URL: https://danielzhangau.github.io

## Tech Stack

- **Framework:** Astro 6 (`astro@^6.1.7`) — static site generator, zero JS by default
- **Styling:** Tailwind CSS 4 (`tailwindcss@^4.2.2`) via `@tailwindcss/vite` plugin
- **Content:** Markdown with Astro Content Collections (`glob()` loader from `astro/loaders`)
- **Integrations:** `@astrojs/mdx`, `@astrojs/sitemap`
- **Deployment:** GitHub Pages via GitHub Actions (Node.js 22+, push to `master`)
- **Package type:** ESM (`"type": "module"` in package.json)

## Project Structure

```
src/
├── components/          # UI components
│   ├── Header.astro     # Sticky nav + dark/light toggle + mobile menu
│   ├── Hero.astro       # Full viewport hero with bg image + CTA
│   ├── About.astro      # Bio section with profile picture
│   ├── Experience.astro # Timeline (3 entries)
│   ├── Skills.astro     # 4-category grid
│   ├── Projects.astro   # Featured projects section (homepage)
│   ├── ProjectCard.astro # Reusable card with image, tags, hover
│   ├── BlogPreview.astro # Latest 3 posts on homepage
│   ├── Contact.astro    # Email, GitHub, LinkedIn buttons
│   └── Footer.astro     # Copyright + social links
├── content/
│   ├── projects/        # 8 project markdown files
│   └── blog/            # Blog post markdown files
├── layouts/
│   └── BaseLayout.astro # SEO (Open Graph, JSON-LD, sitemap), fonts, theme script
├── pages/
│   ├── index.astro      # Homepage composing all section components
│   ├── blog/index.astro # Blog listing
│   ├── blog/[...slug].astro    # Blog post detail
│   ├── projects/index.astro    # Project listing (production vs academic)
│   └── projects/[...slug].astro # Project detail with cover image
├── styles/global.css    # Tailwind config, theme colors, prose styles, animations
└── content.config.ts    # Content collection schemas
public/
├── img/                 # Project images, profile picture, hero bg
└── img/blog/            # Blog SVG diagrams
```

## Content Schemas

**Projects** (`src/content/projects/*.md`):
```yaml
title: string           # Required
description: string     # Required
tags: string[]           # Required
image: string            # Optional, path like "/img/filename.png"
featured: boolean        # Default false, shows on homepage
order: number            # Default 99, lower = first
github: string           # Optional URL
demo: string             # Optional URL
category: "production" | "academic"  # Default "academic"
```

**Blog** (`src/content/blog/*.md`):
```yaml
title: string
description: string
pubDate: date            # e.g. 2026-04-18
updatedDate: date        # Optional
tags: string[]           # Default []
draft: boolean           # Default false, drafts excluded from listing
```

## Development Commands

```bash
npm install              # Install dependencies
npm run dev              # Dev server at localhost:4321
npm run build            # Production build to ./dist
npm run preview          # Preview production build locally
```

## Deployment

Push to `master` → GitHub Actions builds with Node.js 22 → deploys to GitHub Pages.
Config: `.github/workflows/deploy.yml`

## Design System

**Colors:** Blue primary scale (`--color-primary-50` to `--color-primary-900`) defined in `@theme` block in `global.css`
**Fonts:** Inter (sans), JetBrains Mono (mono) — loaded via Google Fonts in BaseLayout
**Dark mode:** Class-based (`class="dark"` on `<html>`), default light, system preference detection, persisted via `localStorage`. Inline script in `<head>` prevents flash.

## Critical Conventions & Gotchas

**Tailwind CSS 4 (NOT v3):**
- `@import "tailwindcss";` — NOT `@tailwind base/components/utilities`
- `@custom-variant dark (&:where(.dark, .dark *));` — for class-based dark mode
- `@theme { }` block for custom values — NOT `theme.extend` in config
- Scoped `<style>` in Astro components MUST have `@reference "tailwindcss";` at top, otherwise utility classes like `bg-white/95` will fail
- `@astrojs/tailwind` is INCOMPATIBLE with Astro 6 — use `@tailwindcss/vite` directly

**Astro 6 Content Collections:**
- Config file is `src/content.config.ts` (NOT `src/content/config.ts`)
- Uses `glob()` loader from `astro/loaders` (Astro 5+ API)
- Access post ID via `post.id` (not `post.slug`)

**Styling decisions with reasons:**
- Project card image containers use `bg-white` (NOT dark-responsive) — transparent PNGs/SVGs look bad on dark backgrounds
- Card borders use `border-slate-200` + `shadow-sm` — `border-slate-100` was invisible on light `bg-slate-50` background
- Dark mode tags use `dark:bg-slate-700 dark:text-slate-200` — `dark:bg-primary-950 dark:text-primary-300` had poor contrast
- `.prose ul` needs explicit `list-disc`, `.prose ol` needs `list-decimal` — Tailwind preflight removes default list-style

**Git config (this repo):**
- user.name: `danielzhangau`
- user.email: `740807262@qq.com`

**Path aliases:** `@/*` → `src/*` (tsconfig.json)

## Contact Info (for site content)

- Email: ddaniel.zhang0413@gmail.com
- GitHub: danielzhangau
- LinkedIn: bosheng-zhang-7b7036149
