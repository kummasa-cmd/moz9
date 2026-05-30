# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Moz9 is a promotional website for Hong Sung-ho — a developer, author, and digital operations partner for solo creators and writers. The goal is to present a portfolio and receive consulting inquiries.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS only — no inline CSS
- **UI Components**: shadcn/ui
- **Icons**: Lucide Icons
- **Forms**: React Hook Form
- **Deployment**: Vercel

## Development Commands

```bash
npm run dev       # Start local dev server
npm run build     # Production build
npm run lint      # Run ESLint
```

## Site Structure

| Route | Purpose |
|-------|---------|
| `/` | Hero, 3 featured projects, intro, CTA |
| `/about` | Profile photo, bio, career timeline, books |
| `/goods` | Service catalog with pricing |
| `/works` | Portfolio with site images and links |
| `/contact` | Inquiry form + SNS links |

## Code Rules

- All code in **TypeScript**
- Components go in `components/`
- Pages go in `app/` (App Router)
- **Tailwind CSS classes only** — no inline `style={}` props
- Variable names and comments in **English**
- Commit messages follow **Conventional Commits**: `feat:`, `fix:`, `style:`, `chore:`, etc.

## Design Tokens

**Colors:**
- Primary: `#1E40AF` (deep blue)
- Accent: `#F59E0B` (warm orange)
- Background: `#FFFFFF`
- Text: `#111827`
- Muted text: `#6B7280`

**Fonts:**
- Korean body: Pretendard
- English body: Inter
- Headings: Pretendard Bold (weight 700)

**Tone:** Minimal, modern, trustworthy — avoid flashy animations or neon colors.

## Key Constraints

- Images must use **WebP format**
- Page load under **3 seconds**
- Responsive: desktop-first (60% desktop / 40% mobile)
- SEO meta tags required on all pages
- Google Analytics 4 tracking required
- Use only license-free images (Unsplash, Pexels)

## Contact Info (for `/contact` page)

- Email: kummasa.naver.com
- Blog: https://blog.naver.com/kummasa
- Threads: https://www.threads.com/@kumma7
- X: https://x.com/kummasa4791
- Instagram: https://www.instagram.com/kumma7/
