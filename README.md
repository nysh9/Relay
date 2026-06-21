This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## RELAY — running the Ear (Person A)

The audio/WebSocket/Deepgram stage lives in `server/` as its **own Node
process**, separate from this Next app (per CLAUDE.md §3 — the WS server and
`next dev` run side by side locally, not bundled together).

```bash
cd server
npm install
cp .env.example .env   # add your DEEPGRAM_API_KEY
npm run dev
```

Open `http://localhost:8080` for a bare mic-capture test harness (not the
real demo UI — that's ported into `app/` separately). See `server/README.md`
for details on the contracts, what's stubbed (the Brain), and what's
deliberately not built yet (Sentry, per §13).
