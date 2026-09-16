# Deploying Ignis with Authentication

Ignis has no built-in authentication. These examples provide ready-to-use Docker Compose setups that put an authentication layer in front of Ignis using [Caddy](https://caddyserver.com/) as a reverse proxy.

## Prerequisites

- Docker and Docker Compose installed
- A domain name pointing to your server (or a local DNS setup)
- Ports 80 and 443 available

## Choose Your Setup

| Setup | Complexity | Features |
| ----- | ---------- | -------- |
| [Caddy + Basic Auth](#caddy--basic-auth) | Minimal | Username/password prompt on every new browser session |
| [Caddy + Authelia](#caddy--authelia) | Low | Login page, sessions, optional 2FA, multi-user support |

Basic auth is fine if you just need a password gate for yourself. Authelia is better if you want a proper login page, persistent sessions, or might add more users later.

---

## Caddy + Basic Auth

The simplest option. Caddy prompts for a username and password before allowing access.

### Setup

1. Copy the `caddy-basic-auth/` folder to wherever you want to run Ignis.

2. Generate a password hash:
   ```bash
   docker run --rm caddy:2 caddy hash-password --plaintext YOUR_PASSWORD
   ```

3. Edit `Caddyfile`:
   - Replace `ignis.example.com` with your domain.
   - Replace `$2a$14$REPLACE_THIS_WITH_YOUR_BCRYPT_HASH` with the hash from step 2.
   - Optionally change the username `admin` to something else.

4. Start it:
   ```bash
   docker compose up -d
   ```

Caddy will automatically obtain a TLS certificate from Let's Encrypt for your domain.

---

## Caddy + Authelia

A more robust setup with a dedicated login page, session cookies, and optional two-factor authentication.

### Setup

1. Copy the `caddy-authelia/` folder to wherever you want to run Ignis.

2. Generate two random secrets (used for signing tokens and encrypting the database):
   ```bash
   openssl rand -hex 32
   ```
   Run this twice. You need two different values.

3. Edit `authelia/configuration.yml`:
   - Replace both `REPLACE_WITH_A_RANDOM_SECRET` and `REPLACE_WITH_ANOTHER_RANDOM_SECRET` with the secrets from step 2.
   - Replace `example.com` with your root domain (e.g. `mydomain.com`).
   - Replace `auth.example.com` with your auth subdomain (e.g. `auth.mydomain.com`).

4. Generate a password hash for your user:
   ```bash
   docker run --rm authelia/authelia:latest authelia crypto hash generate argon2 --password YOUR_PASSWORD
   ```

5. Edit `authelia/users_database.yml`:
   - Replace the placeholder hash with the output from step 4.
   - Optionally change the username, display name, and email.

6. Edit `Caddyfile`:
   - Replace `auth.example.com` with your auth subdomain.
   - Replace `ignis.example.com` with your Ignis domain.

7. Start it:
   ```bash
   docker compose up -d
   ```

### Adding more users

Add entries to `authelia/users_database.yml` following the same format as the existing user. Each user needs a unique username, email, and password hash. Restart Authelia after editing:
```bash
docker compose restart authelia
```

### Enabling two-factor authentication

Authelia supports TOTP (authenticator apps like Google Authenticator, Authy, etc.) out of the box. To require 2FA, change the access control policy in `authelia/configuration.yml`:

```yaml
access_control:
  default_policy: two_factor
```

After restarting, users will be prompted to register a TOTP device on their next login.

### Password reset

The default configuration uses a filesystem notifier, which writes password reset links to a file inside the container instead of emailing them. To check for reset links:
```bash
docker compose exec authelia cat /data/notification.txt
```

For production use, replace the `notifier` section in `configuration.yml` with your SMTP server details. See the [Authelia notifier docs](https://www.authelia.com/configuration/notifications/smtp/).

---

## Common Notes

### DNS

Both examples require DNS records pointing to your server:
- For basic auth: one A/CNAME record for your Ignis domain.
- For Authelia: two A/CNAME records, one for Ignis and one for the auth subdomain.

### HTTPS

HTTPS is required for full functionality, not just for confidentiality: served over plain HTTP at a non-localhost origin, the browser disables the crypto and clipboard APIs Obsidian relies on, breaking graph view, the outline, clipboard operations, and Sync. Both examples below terminate TLS.

Caddy handles TLS automatically via Let's Encrypt. For this to work, your domain must be publicly resolvable and ports 80/443 must be reachable from the internet (Let's Encrypt needs to verify domain ownership).

If you're running on a local network without public DNS, you can use Caddy's [internal TLS](https://caddyserver.com/docs/caddyfile/directives/tls#internal) to generate self-signed certificates. Add `tls internal` inside each site block in the Caddyfile, or use `tailscale serve` to put HTTPS in front of Ignis on a tailnet.

### Vault data

Both examples store vault data in a `vaults/` directory and Ignis state in a `data/` directory next to the compose file. These are bind mounts, so your data lives on the host filesystem and persists across container restarts.

### Building from source

If you're building Ignis from source instead of using the published image, edit `docker-compose.yml` and swap `image: nobbe/ignis:latest` for `build: ../../` (assuming you're running from the cloned repo's `examples/` folder).

### Alternative: Cloudflare Tunnel

If you don't want to expose ports 80/443, [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) can route traffic to your server without opening any inbound ports. Cloudflare Access can also provide authentication. This is a different approach entirely and not covered by these examples, but it's worth considering if you already use Cloudflare.
