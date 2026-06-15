# Jemaw

![Jemaw Preview](https://huggingface.co/datasets/ebenezermerd/multimedia/resolve/main/_-640x360.jpg)

A Telegram-native expense companion for friend groups.

Add **Jemaw** to your group chat, let it detect and suggest expenses with AI, confirm them through a Telegram Mini App, and settle payments off-platform.

---

## Overview

Jemaw helps friend groups track shared expenses directly inside Telegram.

Instead of switching between apps or manually writing down who paid for what, users can mention expenses in a group chat. Jemaw suggests structured expenses using AI, then users can confirm or edit them in the Mini App.

---

## Features

- Telegram bot for group expense tracking
- AI-suggested expense detection
- Telegram Mini App for confirming expenses
- Shared balance tracking for groups
- Off-platform settlement support
- Postgres database with Drizzle ORM
- TypeScript monorepo using pnpm workspaces

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Language | TypeScript |
| Package Manager | pnpm workspace |
| Bot / API | grammY + Fastify |
| Mini App | Vite + React + TanStack Query |
| Database | Postgres + Drizzle ORM |
| AI | Google Gemini `gemini-2.5-flash` |
| Hosting | Cloud Run for bot, Firebase Hosting for app |

---

## Project Structure

```txt
packages/
├── shared   # Drizzle schema and shared API types
├── bot      # Fastify server, grammY bot, REST API, and domain logic
└── app      # Telegram Mini App SPA
