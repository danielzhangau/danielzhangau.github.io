# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a personal portfolio website for Bosheng (Daniel) Zhang, built as a static single-page application using the "Black and White" Bootstrap theme from Bootstrapious. The site is hosted on GitHub Pages and showcases Daniel's work as a Machine Learning Engineer.

## Architecture

**Static Site Structure:**
- Single-page application with all content in `index.html`
- Sections are navigated via anchor links with smooth scrolling (handled by `js/front.js`)
- No build process required - pure HTML/CSS/JS

**Key Sections in index.html:**
- `#intro` - Hero section with name and title
- `#about` - About/bio section
- `#portfolio` - Work/project gallery with Lightbox integration
- Contact section with Leaflet.js map integration

**Styling:**
- Main theme: `css/style.default.css` (from Bootstrapious template)
- Custom overrides: `css/custom.css` - use this file for any style modifications
- Framework: Bootstrap 4
- Icons: Font Awesome 4.7
- Fonts: Lora (headings), Cardo (copy)

**JavaScript:**
- `js/front.js` - Core functionality:
  - Sticky navbar on scroll
  - Smooth scroll navigation
  - ScrollSpy for active nav items
  - Leaflet.js map initialization with Stamen TonerLite tiles
  - Theme switching (demo feature using jQuery cookies)
- `js/like_button.js` - React component (currently not integrated in main page)

**Dependencies (vendor/):**
- Bootstrap 4 (framework)
- jQuery (required for Bootstrap and front.js)
- Popper.js (Bootstrap tooltips/popovers)
- Font Awesome 4.7 (icons)
- Lightbox2 (image gallery overlays)
- Leaflet.js (loaded via CDN for map functionality)
- jquery.cookie (theme switching)

## Development Commands

**Local Development:**
```bash
# Serve locally (simple HTTP server)
python3 -m http.server 8000
# or
python -m SimpleHTTPServer 8000
# or using Node.js
npx http-server
```

**Testing:**
- No automated tests currently configured
- Manual testing: Open `index.html` in browser or use local server

**Deployment:**
- Site is deployed via GitHub Pages
- Push to `master` branch to deploy
- No build step required

## Important Notes

**Template Attribution:**
- Based on "Black and White" theme by Bootstrapious
- License requires footer backlink to Bootstrapious (see `license.txt` and `readme.txt`)

**Making Changes:**
- CSS: Add custom styles to `css/custom.css` rather than modifying `css/style.default.css`
- Content: Edit `index.html` directly for text, images, and structure
- Images: Stored in `img/` directory
- Map location: Configured in `js/front.js` (currently set to Brisbane coordinates: -27.4892582, 153.0063968)

**Map Configuration:**
- Uses Leaflet.js with OpenStreetMap tiles (Stamen TonerLite style)
- Map center and marker position set in `map()` function in `js/front.js:84`
- Disable/enable dragging based on screen width (>700px)

**Contact Form:**
- Currently no backend configured
- See `readme.txt` for instructions on implementing contact form with backend

**React Component:**
- `js/like_button.js` exists but is not currently integrated into the main page
- Would require React CDN scripts added to `index.html` and a container element
