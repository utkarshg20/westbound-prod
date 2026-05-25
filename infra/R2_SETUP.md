# Cloudflare R2 setup

1. Create bucket `westbound-assets` in Cloudflare dashboard.
2. Create API token with Object Read & Write.
3. Set in `.env`:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME=westbound-assets`
   - `R2_PUBLIC_URL` (optional custom domain for signed URLs)

Key layout: `{project}/{entity}/v{version}/{filename}`

Example: `studio/sammy_rane/v3/hero_portrait.png`
