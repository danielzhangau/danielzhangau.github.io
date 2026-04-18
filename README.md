# Bosheng (Daniel) Zhang - Portfolio

[![Live Site](https://img.shields.io/badge/Live-danielzhangau.github.io-blue)](https://danielzhangau.github.io/)
[![Built with Astro](https://img.shields.io/badge/Built%20with-Astro%206-BC52EE)](https://astro.build/)
[![Deploy](https://github.com/danielzhangau/danielzhangau.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/danielzhangau/danielzhangau.github.io/actions/workflows/deploy.yml)

Personal portfolio and blog for an AI/ML Engineer, featuring production AI systems, academic research projects, and technical writing on the latest in AI engineering.

## Tech Stack

- **Framework:** [Astro 6](https://astro.build/) — static site generator with zero JS by default
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com/) via `@tailwindcss/vite`
- **Content:** Markdown with Astro Content Collections
- **Deployment:** GitHub Pages via GitHub Actions
- **Features:** Dark/light mode, SEO (Open Graph, JSON-LD, sitemap), responsive design

## Project Structure

```
src/
├── components/        # Astro components (Header, Hero, About, etc.)
├── content/
│   ├── projects/      # Project markdown files
│   └── blog/          # Blog post markdown files
├── layouts/           # BaseLayout with SEO and theme
├── pages/             # Route pages (index, blog/, projects/)
├── styles/            # Global CSS and Tailwind config
└── content.config.ts  # Content collection schemas
public/
└── img/               # Static images and SVG diagrams
```

## Development

```bash
npm install            # Install dependencies
npm run dev            # Dev server at localhost:4321
npm run build          # Production build to ./dist
npm run preview        # Preview production build
```

Requires Node.js 22+.

## Content

**Adding a project:** Create a markdown file in `src/content/projects/` with frontmatter: `title`, `description`, `tags`, `category` (production/academic), `image`, `order`.

**Adding a blog post:** Create a markdown file in `src/content/blog/` with frontmatter: `title`, `description`, `pubDate`, `tags`.

## Contact

- **Email:** ddaniel.zhang0413@gmail.com
- **LinkedIn:** [bosheng-zhang](https://www.linkedin.com/in/bosheng-zhang-7b7036149/)
- **GitHub:** [danielzhangau](https://github.com/danielzhangau)
