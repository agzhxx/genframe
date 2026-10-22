# Install-test apps

Fresh shadcn apps that `pnpm test:install` (scripts/install-test.ts) installs every registry item
into. They're what shadcn 4.22.1 generates, without `.git` and its README, with their lockfiles:

```bash
npx shadcn@4.22.1 init -t vite -n consumer-base -b base -p nova -y --no-monorepo
npx shadcn@4.22.1 init -t vite -n consumer-radix -b radix -p nova -y --no-monorepo
```

`consumer-base` is shadcn's default (Base UI); `consumer-radix` is the style the Kit is written in.
Don't edit them by hand: to refresh, generate them again outside this repo and copy them in.
