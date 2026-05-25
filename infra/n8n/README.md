# n8n (self-hosted)

## Local

```bash
docker compose up redis n8n -d
```

Open http://localhost:5678 and import workflows from `workflows/`.

## Production VPS (Hetzner / DigitalOcean)

1. Provision Ubuntu 22.04, 4GB+ RAM.
2. Install Docker; clone repo; copy `.env` from 1Password vault.
3. Set `N8N_ENCRYPTION_KEY` to a strong random value.
4. Point subdomain (e.g. `n8n.westbound.studio`) with TLS (Caddy or Traefik).
5. Restrict firewall to your IPs + worker callback IP.

Worker callbacks use `WORKER_API_URL` and `N8N_WEBHOOK_SECRET`.
