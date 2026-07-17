# Server Fix — Summary of Changes

Fixed the merged branches so all API routes work correctly.

## Modified

- **`src/routes/appointmentRoutes.js`** — removed a duplicate `require`/`module.exports` block that was crashing the server on startup.
- **`src/routes/doctorRoutes.js`** — fixed route path (`/doctors` → `/`) so `GET /api/v1/doctors` works instead of `/api/v1/doctors/doctors`.
- **`src/controllers/appointmentController.js`** — merged two conflicting booking/cancel implementations into one, fixed a `doctor.name` bug, removed duplicate code.
- **`src/server.js`** — added the new admin routes.

## Added

- **`src/routes/adminRoutes.js`** — new route for `GET /api/v1/admin/appointments` (was missing before).

## Deleted

- **`src/app.js`** — unused duplicate of `server.js`, not referenced anywhere.

## Result

All routes from the spec now work:
- `GET /api/v1/doctors`
- `POST /api/v1/appointments`
- `POST /api/v1/appointments/cancel`
- `GET /api/v1/admin/appointments`
