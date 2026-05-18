# Bosheng (Daniel) Zhang — Portfolio

[![Live](https://img.shields.io/badge/Live-danielzhangau.github.io-blue)](https://danielzhangau.github.io/)
[![Astro 6](https://img.shields.io/badge/Astro-6-BC52EE)](https://astro.build/)
[![Tailwind 4](https://img.shields.io/badge/Tailwind-4-38BDF8)](https://tailwindcss.com/)
[![Deploy](https://github.com/danielzhangau/danielzhangau.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/danielzhangau/danielzhangau.github.io/actions/workflows/deploy.yml)

Static portfolio and engineering blog for an AI/ML engineer. Production AI case studies, academic research, and writing on agentic AI, RAG, harness engineering, and adjacent topics.

## Stack

- **Astro 6** — static site generator, zero JS by default, content collections via `glob()` loader
- **Tailwind CSS 4** — via `@tailwindcss/vite` plugin (no `@astrojs/tailwind`)
- **MDX + sitemap + RSS** — `@astrojs/mdx`, `@astrojs/sitemap`, `@astrojs/rss`
- **Self-hosted fonts** — `@fontsource/inter` + `@fontsource/jetbrains-mono` (latin subsets only)
- **GitHub Pages** — auto-deploy on push to `master` via GitHub Actions (Node 22, actions/\* v5–v6)

## Features

| Area        | Capability                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Site**    | Dark/light mode with no-flash, sticky header with scroll-spy (IntersectionObserver), skip-link, `prefers-reduced-motion`, view-on-mobile menu (Escape/click-outside dismiss)         |
| **Blog**    | Reading time, auto-generated TOC, prev/next nav, per-post OG image, client-side fuzzy search, tag detail pages, reading progress bar, copy-to-clipboard on code blocks               |
| **Content** | Astro content collections with zod schema validation, MDX support, draft filter, optional `heroImage` and `updatedDate`                                                              |
| **SEO**     | Open Graph, Twitter Card, sitemap, `Person` + per-page `BlogPosting` JSON-LD, `article:*` meta, canonical URLs, RSS feed at `/rss.xml`                                               |
| **Perf**    | Inlined CSS (no render-blocking), preloaded critical woff2, WebP everywhere, GIFs replaced with mp4+webm, `fetchpriority="high"` on LCP image, all images have explicit width/height |
| **A11y**    | WCAG AA color contrast, focus-visible ring, aria-labels on duplicate landmarks, ≥44px tap targets on icon-only links, semantic landmarks                                             |
| **CI/CD**   | Format check + build gate before deploy, `.github/workflows/deploy.yml` uses `npm install --no-audit --no-fund`                                                                      |

PSI scores (production, as of 2026-05): 100/100/100/100 Desktop, 93–98/100/100/100 Mobile.

## Project Structure

```
src/
├── components/             UI components
│   ├── Header.astro        Sticky nav + ScrollSpy + theme toggle (IO-based)
│   ├── Hero.astro          Full-viewport hero with WebP background
│   ├── About.astro         Bio + portrait + quick facts
│   ├── Experience.astro    Timeline
│   ├── Skills.astro        4-category grid
│   ├── Projects.astro      Featured + academic split
│   ├── ProjectCard.astro   Reusable card
│   ├── BlogPreview.astro   Latest 3 posts on homepage
│   ├── Contact.astro       Email + social CTAs
│   ├── Footer.astro        Copyright + social
│   └── Icon.astro          Centralised SVG icon set
├── content/
│   ├── projects/           Project case studies (md)
│   └── blog/               Blog posts (md)
├── layouts/
│   └── BaseLayout.astro    Head metadata + theme bootstrap + landmarks
├── pages/
│   ├── index.astro         Homepage (composes all section components)
│   ├── 404.astro           Custom not-found
│   ├── rss.xml.ts          RSS feed
│   ├── blog/
│   │   ├── index.astro     Blog index with client-side search
│   │   ├── [...slug].astro Blog post with TOC + progress bar
│   │   └── tags/[tag].astro Tag detail
│   └── projects/
│       ├── index.astro
│       └── [...slug].astro Project detail with video poster fallback
├── styles/
│   ├── global.css          Tailwind import + theme tokens + prose
│   └── fonts.css           Self-hosted font @font-face imports
├── utils/
│   ├── format.ts           formatDate + estimateReadingTime
│   └── slug.ts             tagToSlug for tag URLs
└── content.config.ts       zod schemas for projects + blog
public/
└── img/                    Static images, GIF videos (.mp4 + .webm), favicons
```

## Content schemas

**Projects** (`src/content/projects/*.md`):

```yaml
title: string # required
description: string # required
tags: string[] # required
image: string # optional, /img/... path
video: string # optional, base path (omit .mp4/.webm)
featured: boolean # default false — show on homepage
order: number # default 99 — lower sorts first
github: string # optional URL
demo: string # optional URL
category: production | academic # default academic
```

**Blog** (`src/content/blog/*.md`):

```yaml
title: string
description: string
pubDate: date # e.g. 2026-04-18
updatedDate: date # optional; rendered next to pubDate
tags: string[] # default []
draft: boolean # default false — drafts excluded from /blog and RSS
heroImage: string # optional — used as og:image for social sharing
```

## Local development

```bash
npm install
npm run dev               # http://localhost:4321
npm run build             # → ./dist
npm run preview           # serve the build
npm run format            # prettier write
npm run format:check      # CI-equivalent check
```

Requires Node.js 22+.

## Deployment

Push to `master` → GitHub Actions runs `format:check` + `build`, then publishes `./dist` to GitHub Pages. The full workflow is in `.github/workflows/deploy.yml`.

## Conventions

- **Tailwind 4 specifics** documented in `CLAUDE.md` (custom-variant for dark mode, `@theme` block, `@reference` in scoped styles)
- **Path alias** `@/*` → `src/*`
- **Image strategy** — everything is WebP; GIFs become `<video>` with a static WebP poster. Hero image preloaded with `fetchpriority="high"`
- **Per-page JSON-LD** — homepage emits `Person`, blog posts emit `BlogPosting` + `Person`
- **Lock file note** — `package-lock.json` may drift slightly from `package.json`; CI uses `npm install` (forgiving) rather than `npm ci` to absorb this

## Contact

- **Email:** ddaniel.zhang0413@gmail.com
- **LinkedIn:** [bosheng-zhang](https://www.linkedin.com/in/bosheng-zhang-7b7036149/)
- **GitHub:** [@danielzhangau](https://github.com/danielzhangau)
- **RSS:** [danielzhangau.github.io/rss.xml](https://danielzhangau.github.io/rss.xml)
