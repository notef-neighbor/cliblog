# CLIBLOG

> CLI-first headless blog service

A simple REST API for blogging, designed to work seamlessly with AI tools like Claude Code.

**Note:** This service does not embed AI. It provides a clean API that AI tools can interact with.

**Demo:** [blog.dreamcore.gg/b/notf](https://blog.dreamcore.gg/b/notf)

## Features

- **API-first**: No web UI, just a clean REST API
- **AI-friendly**: Works with Claude Code via Skills
- **Markdown-native**: Posts are stored as raw Markdown
- **Self-hostable**: Deploy to your own Cloudflare account
- **Data ownership**: Export or delete your data anytime

## Quick Start

### Option 1: Use the Hosted Version

Install the Claude Code skill (connects to the public instance):

```bash
curl -fsSL https://blog.dreamcore.gg/install-skill.sh | bash
```

Then tell Claude Code: "I want to start a blog"

### Option 2: Self-Host

See [Self-Hosting](#self-hosting) below to deploy your own instance.

## Self-Hosting

### Prerequisites

- Cloudflare account (Workers Paid plan recommended)
- Node.js 20+
- pnpm

### Setup

```bash
# Clone
git clone https://github.com/xxx/cliblog
cd cliblog
pnpm install

# Create Cloudflare resources
wrangler d1 create cliblog
wrangler r2 bucket create cliblog-content
wrangler r2 bucket create cliblog-assets

# Configure
cp apps/api/wrangler.toml.example apps/api/wrangler.toml
# Edit wrangler.toml with your D1 database ID

cp apps/api/.dev.vars.example apps/api/.dev.vars
# Edit .dev.vars with your secrets

# Run migrations
pnpm db:migrate

# Set production secrets
wrangler secret put INTERNAL_KEY
wrangler secret put API_KEY_SECRET

# Deploy
pnpm deploy
```

### Using the Skill with Self-Hosted Instance

After deploying, install the skill and create the config manually:

```bash
# Install skill (uses hosted version's script, but skill supports any API URL)
curl -fsSL https://blog.dreamcore.gg/install-skill.sh | bash

# Create config pointing to your instance
mkdir -p ~/.config/cliblog
cat > ~/.config/cliblog/config.json << 'EOF'
{
  "apiUrl": "https://YOUR-WORKER.workers.dev",
  "apiKey": "",
  "subdomain": "",
  "blogUrl": ""
}
EOF
```

Then tell Claude Code: "I want to start a blog" - it will use your `apiUrl` for registration.

### Fully Self-Hosted Skill

Your worker already serves `/install-skill.sh` and `/skill.md`. To use your own:

```bash
# Install from your own instance
curl -fsSL https://YOUR-WORKER.workers.dev/install-skill.sh | bash
```

The default API URL in the skill points to the hosted version. To change it, edit `apps/api/src/routes/install.ts`:

```typescript
// Find this line in SKILL_CONTENT:
"apiUrl": "https://blog.dreamcore.gg"

// Change to your instance:
"apiUrl": "https://YOUR-WORKER.workers.dev"
```

Then redeploy: `pnpm deploy`

### Environment Variables

| Variable | Description |
|----------|-------------|
| `INTERNAL_KEY` | Secret for internal admin API |
| `API_KEY_SECRET` | HMAC secret for API key verification |
| `SERVICE_DOMAIN` | Base domain for blogs (optional) |

Generate secrets with: `openssl rand -hex 32`

## API Documentation

See [docs/api.md](docs/api.md) for the full API reference.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions and technical details.

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Database**: Cloudflare D1
- **Storage**: Cloudflare R2
- **ORM**: Drizzle

## License

MIT - see [LICENSE](LICENSE)
