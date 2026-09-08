# Deployment

## Docker

```bash
docker compose up -d
```

## Production

```bash
docker compose -f docker-compose.production.yml up -d
```

## Environment

Set all variables in `.env` before deploying. Never commit secrets.
