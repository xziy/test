# Mock KAAT Server

This project provides a simple Express server written in TypeScript that mimics the behaviour of the PLINK and KAAT endpoints described in the technical specification.

## Setup

```bash
npm install
npm run build
npm start
```

The server will start on port `3000` by default. You can override the port via the `PORT` environment variable.

All endpoints log their activity to the console so you can see incoming requests
and any validation errors.

## Endpoints

### `POST /auth`
Authenticates a user and returns JSON:

```
{
  "code": 200,
  "message": "Successfully logged in!",
  "data": {
    "token": "<token>",
    "expiresIn": 86400
  }
}
```

Use the returned token for subsequent requests.

### `POST /video/upload`
Requires `Authorization: Bearer <token>` header and accepts `multipart/form-data` with fields `id`, `car_number`, `the_date`, `rule_id`, `video`, `car_photo`, `full_photo`.
Responds with:

```json
{ "code": 200, "data": { "guid": "<guid>", "url": "https://mock.example/<guid>" } }
```

### `POST /billing-api/v1/device-event/create`
Accepts JSON body with violation data and responds with a simulated success message.

### `POST /car-search/v1/device-event/input-all`
Accepts an array of transport events and returns a success message.

This server is intended only for local testing and does not persist data between runs.

When using GitHub Actions, ensure that `package-lock.json` is committed. The
workflow relies on `npm ci`, which requires this lock file to install
dependencies.
