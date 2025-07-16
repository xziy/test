# Mock KAAT Server

This project provides a simple Express server written in TypeScript that mimics the behaviour of the PLINK and KAAT endpoints described in the technical specification.

## Setup

```bash
npm install
npm run build
npm start
```

The server will start on port `3000` by default. You can override the port via the `PORT` environment variable.

### Environment Variables

Create a `.env` file (see `.env.example` for reference):

- `KAAT_TOKEN` - Authentication token for KAAT endpoints
- `PORT` - Server port (default: 3000)
- `PLINK_AUTH_URL` - (Optional) Real PLINK auth URL for proxy mode
- `PLINK_UPLOAD_URL` - (Optional) Real PLINK upload URL for proxy mode

If both `PLINK_AUTH_URL` and `PLINK_UPLOAD_URL` are set, the server will enable proxy endpoints that forward requests to the real PLINK server.

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

## PLINK Proxy Endpoints (Optional)

When `PLINK_AUTH_URL` and `PLINK_UPLOAD_URL` environment variables are configured, the following proxy endpoints become available:

### `POST /plink/auth`
Proxies authentication requests to the real PLINK server. Forwards all headers and body content, returning the exact response from the upstream server.

### `POST /plink/video/upload`
Proxies video upload requests to the real PLINK server. Handles multipart form data including files and forwards everything to the upstream server.

These proxy endpoints are useful for:
- Testing against real PLINK infrastructure
- Development environments that need to connect to staging PLINK servers
- Debugging issues with PLINK integration

This server is intended only for local testing and does not persist data between runs.

When using GitHub Actions, ensure that `package-lock.json` is committed. The
workflow relies on `npm ci`, which requires this lock file to install
dependencies.
