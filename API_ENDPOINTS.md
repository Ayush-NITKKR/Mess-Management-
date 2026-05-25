# Mess Management API Endpoints

Base URL: `http://localhost:4000`

> Note: Some routes require authentication (`verifyToken`) and roles (`requireRole`).

## Auth & Users

### Register
- **POST** `/api/v1/auth/register`

### Login
- **POST** `/api/v1/auth/login`

### Logout
- **POST** `/api/v1/auth/logout`

### Get user details (ADMIN)
- **GET** `/api/v1/auth/getUserDetails`

### Get pending users (ADMIN)
- **GET** `/api/v1/auth/getPendingUser`

### Verify user (ADMIN)
- **PATCH** `/api/v1/auth/verifyUser/:id`

## Resident Profile

### Update resident profile (Authenticated)
- **PATCH** `/api/v1/resident/resident-profile/:rollNumber`

## Fee Config

### List fee configs
- **GET** `/fee-configs`

### Get fee config by id
- **GET** `/fee-config/:id`

### Create fee config (ADMIN)
- **POST** `/fee-config`

### Update fee config (ADMIN)
- **PATCH** `/fee-config/:id`

### Deactivate fee config (ADMIN)
- **PATCH** `/fee-config/:id/deactivate`

## Extra Products

### Create extra product (MUNEEM)
- **POST** `/api/v1/extra/extra-product`

### Update extra product (MUNEEM)
- **PATCH** `/api/v1/extra/Update-extra-product/:id`

### List active extra products
- **GET** `/api/v1/extra/getActiveExtraProduct`

### Add extra product to user
- **POST** `/api/v1/extra/addExtraProduct`

## Rebates

### Create rebate (RESIDENT)
- **POST** `/addRebait`

## Daily Expenses

### Run daily update (ADMIN, MUNEEM)
- **POST** `/api/v1/expences/daily-update`
