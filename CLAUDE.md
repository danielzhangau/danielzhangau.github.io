# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal portfolio website for Bosheng (Daniel) Zhang — AI/ML Engineer. Built with Astro 6, Tailwind CSS 4, and deployed to GitHub Pages via GitHub Actions.

## Architecture

**Framework:** Astro 6 (static site generator, zero JS by default)
**Styling:** Tailwind CSS 4 via `@tailwindcss/vite` plugin (NOT `@astrojs/tailwind`)
**Content:** Markdown files in `src/content/` using Astro Content Collections with `glob()` loader
**Dark Mode:** Class-based (`class="dark"` on `<html>`), default light, persisted via `localStorage`

**Key Directories:**
- `src/components/` — Astro components (Header, Hero, About, Experience, Skills, Projects, BlogPreview, Contact, Footer, ProjectCard)
- `src/layouts/BaseLayout.astro` — Global layout with SEO meta, fonts, theme script
- `src/pages/` — Route pages (index, blog/[slug], projects/[slug])
- `src/content/projects/` — Project markdown files (production & academic categories)
- `src/content/blog/` — Blog post markdown files
- `src/content.config.ts` — Content collection schemas
- `src/styles/global.css` — Tailwind config, custom theme colors, prose styles
- `public/img/` — Static images and SVG diagrams
- `.github/workflows/deploy.yml` — GitHub Actions CI/CD

**Content Schema (projects):** title, description, tags[], image?, featured?, order?, github?, demo?, category (production|academic)
**Content Schema (blog):** title, description, pubDate, updatedDate?, tags[], draft?

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server at localhost:4321
npm run build        # Build to ./dist
npm run preview      # Preview production build
```

## Deployment

- Push to `master` triggers GitHub Actions → build → deploy to GitHub Pages
- Requires Node.js 22+ (Astro 6 requirement)
- Deploy config: `.github/workflows/deploy.yml`

## Important Conventions

**Tailwind CSS 4 specifics:**
- Use `@custom-variant dark (&:where(.dark, .dark *));` for dark mode
- Use `@theme { }` block for custom values (not `theme.extend`)
- Scoped `<style>` blocks in Astro components require `@reference "tailwindcss";` at top
- Use `@import "tailwindcss";` instead of `@tailwind` directives

**Styling rules:**
- Custom styles go in `src/styles/global.css`
- Image containers for project cards use `bg-white` (not dark-responsive) to handle transparent PNGs/SVGs
- Card borders use `border-slate-200` + `shadow-sm` for light mode visibility

**Content:**
- Add new projects as markdown in `src/content/projects/`
- Add new blog posts as markdown in `src/content/blog/`
- Images go in `public/img/` (referenced as `/img/filename`)
- Blog diagrams go in `public/img/blog/`

**Path aliases:** `@/*` maps to `src/*` (configured in `tsconfig.json`)
