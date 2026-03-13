# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**FinVault** is a financial application backed by Supabase (project ref: `zljrojvmjrsmfoauwgcy`).

## MCP / Supabase Integration

This repo has a `.mcp.json` that connects Claude Code to the Supabase MCP server. The `supabase` MCP tools are available for:
- Running SQL queries (`mcp__supabase__execute_sql`)
- Applying migrations (`mcp__supabase__apply_migration`)
- Managing branches, edge functions, and more

Always prefer MCP tools over raw SQL scripts when interacting with the database during development.

## Stack

- **Next.js 16** with App Router (`src/app/`)
- **TypeScript** — strict mode via `tsconfig.json`
- **Tailwind CSS v4** with `@tailwindcss/postcss`
- **Package manager:** npm

## Development Commands

```bash
npm run dev      # Start dev server (http://localhost:3000)
npm run build    # Production build
npm run start    # Run production build locally
```

## Project Structure

- `src/app/` — App Router pages and layouts
- `src/lib/supabase.ts` — Browser Supabase client
- `src/middleware.ts` — Auth route protection
- `public/` — Static assets
- `next.config.ts` — Next.js config
- `postcss.config.mjs` — Tailwind/PostCSS config

## PWA

This app is a Progressive Web App. A web app manifest and service worker will be added later. Every page and component must be **mobile-first and responsive**, working seamlessly on small screens (iPhone) and large screens (desktop). Always use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) throughout.

## Design System

**Philosophy:** Monzo-inspired, dark theme, sharp and modern.

**Fonts:**
- `DM Sans` — body text and UI
- `DM Mono` — numbers, balances, and monetary values

**Colour palette:**

| Token | Hex | Usage |
|---|---|---|
| Background | `#0d1117` | Page background |
| Card | `#131929` | Cards and surfaces |
| Blue | `#00D4FF` | Primary actions, links |
| Green | `#00FF94` | Positive values, success |
| Red | `#FF4488` | Negative values, errors |
| Purple | `#A78BFA` | Accents, tags |

Always use these exact hex values — do not substitute with Tailwind's default colour palette.
