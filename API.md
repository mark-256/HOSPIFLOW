# API Reference

Base URL: `/api`

## Auth
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

## Hotel
- `GET /api/guests`
- `POST /api/guests`
- `GET /api/rooms`
- `GET /api/reservations`
- `POST /api/reservations`
- `GET /api/folios`
- `POST /api/folios/:id/transactions`

## POS
- `GET /api/tables`
- `POST /api/tables`
- `GET /api/menus`
- `POST /api/menus`
- `GET /api/products`
- `POST /api/products`
- `GET /api/orders`
- `POST /api/orders`
- `POST /api/orders/:id/items`
- `POST /api/orders/:id/pay`

## Kitchen
- `PATCH /api/orders/:id/status`

## Inventory
- `GET /api/inventory`
- `POST /api/inventory`
- `GET /api/inventory/movements`
- `POST /api/inventory/movements`

## Operations
- `GET /api/housekeeping`
- `POST /api/housekeeping`
- `PATCH /api/housekeeping/:id`
- `GET /api/maintenance`
- `POST /api/maintenance`
- `PATCH /api/maintenance/:id`
- `POST /api/shifts/open`
- `POST /api/shifts/:id/close`

## Reports
- `GET /api/reports/sales`
- `GET /api/reports/occupancy`

## Online Ordering
- `GET /api/online-orders`
- `POST /api/online-orders`

## Loyalty
- `GET /api/loyalty/account?guestId=:id`
- `POST /api/loyalty/points`

## QR
- `POST /api/qr/generate`
- `GET /api/qr/lookup/:token`

## Guest Portal
- `GET /api/guest-portal/reservations?guestId=:id`
- `GET /api/guest-portal/folios?guestId=:id`
