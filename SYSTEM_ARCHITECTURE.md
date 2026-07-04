# SYSTEM_ARCHITECTURE.md — Apex Care Hospital Appointment System

## 1. Database Entity-Relationship (ER) Design

### departments

| Column | Type | Notes |
|---|---|---|
| department_id | INT (PK) | Auto-increment |
| name | VARCHAR(50) | Pediatrics, Orthopedics, Cardiology, General Medicine |

### doctors

| Column | Type | Notes |
|---|---|---|
| doctor_id | INT (PK) | Auto-increment |
| name | VARCHAR(100) | Doctor's name |
| department_id | INT (FK) | → departments.department_id |
| is_available_today | BOOLEAN | Shown in directory |

### appointments

| Column | Type | Notes |
|---|---|---|
| appointment_id | INT (PK) | Auto-increment |
| doctor_id | INT (FK) | → doctors.doctor_id |
| patient_name | VARCHAR(100) | Required |
| patient_age | INT | Required |
| patient_phone | VARCHAR(15) | Required, used for lookup/cancel |
| health_issue | TEXT | Short description |
| appointment_date | DATE | Booking date |
| batch | ENUM('MORNING','EVENING') | Morning 9AM–1PM, Evening 4PM–8PM |
| status | ENUM('SCHEDULED','DONE','ABANDONED','CANCELLED') | DEFAULT 'SCHEDULED' |
| booking_reference | VARCHAR(20) | Unique, shown to patient (see Section 6) |
| idempotency_key | VARCHAR(64) | Unique, prevents duplicate submissions (see Section 5) |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP |

### staff

| Column | Type | Notes |
|---|---|---|
| staff_id | INT (PK) | Auto-increment |
| username | VARCHAR(50) | Unique login |
| password_hash | VARCHAR(255) | bcrypt hash (see Section 7) |

### Relationships

| Relationship | Cardinality |
|---|---|
| departments → doctors | 1 : N |
| doctors → appointments | 1 : N |

### Business Rules Enforced at Schema Level

| Rule | Enforcement |
|---|---|
| Max 15 SCHEDULED appointments per (doctor_id, appointment_date, batch) | Row-locking transaction check (Section 4) |
| One patient (by phone) can have only 1 active (SCHEDULED) appointment **per batch** — i.e. max 2 active at a time, one morning + one evening | Unique partial constraint (below) |
| A patient cannot have 2 active appointments with the **same doctor** (even across different batches/dates) | Application-layer check (below) |
| No duplicate appointment from repeated form submission | Unique `idempotency_key` (Section 5) |

**Rule in plain terms:** A patient CAN book a morning appointment with Dr. A and an evening appointment with Dr. B on the same day. A patient CANNOT book two appointments with Dr. A (regardless of batch), and CANNOT book two morning appointments (even with different doctors).

```sql
-- Rule 1: One active appointment per phone number PER BATCH (not overall)
-- PostgreSQL:
CREATE UNIQUE INDEX uq_patient_active_per_batch 
ON appointments (patient_phone, batch) 
WHERE status = 'SCHEDULED';

-- MySQL (no partial index support): enforced at application layer —
-- check for existing SCHEDULED row for that phone + batch before insert,
-- inside the same transaction as the slot-capacity check.
```

```sql
-- Rule 2: No active appointment with the SAME doctor for this patient
-- (checked at application layer, works on both Postgres & MySQL)
SELECT COUNT(*) FROM appointments
WHERE patient_phone = ? AND doctor_id = ? AND status = 'SCHEDULED';
-- If count > 0 → reject with 409 DOCTOR_ALREADY_BOOKED
```

---

## 2. Indexes (for 500-concurrent-user load)

| Table | Index | Columns | Purpose |
|---|---|---|---|
| appointments | idx_patient_phone | (patient_phone, status) | Fast lookup/cancel by phone |
| appointments | idx_slot_availability | (doctor_id, appointment_date, batch, status) | Fast slot count check on every booking |
| appointments | idx_abandoned_job | (appointment_date, status) | Fast end-of-day batch update |
| appointments | idx_idempotency_key | (idempotency_key) UNIQUE | Fast duplicate-submission check |
| doctors | idx_department | (department_id) | Fast filtering by department |

---

## 3. Scheduled Jobs & Automation

### Daily Abandoned Appointment Job

| Detail | Value |
|---|---|
| Trigger time | 11:59 PM daily (end of business day) |
| Frequency | Once per day |
| Implementation | Node.js `node-cron`, or DB-level scheduled event |
| Action | Marks unfinished appointments as `ABANDONED` |

```sql
UPDATE appointments 
SET status = 'ABANDONED', updated_at = NOW()
WHERE status = 'SCHEDULED' AND appointment_date = CURDATE();
```

This runs after both batches (morning + evening) have closed, so any appointment staff never marked as `DONE` is auto-closed — keeping the dashboard and phone-lookup results accurate for the next day.

---

## 4. Concurrency & Race-Condition Safety (Slot Booking)

**Problem:** Two patients could try to book the last available slot at the exact same moment.

**Approach:** Row-level pessimistic locking, inside one database transaction, on every booking request.

```sql
BEGIN TRANSACTION;

SELECT COUNT(*) FROM appointments
WHERE doctor_id = ? AND appointment_date = ? AND batch = ? AND status = 'SCHEDULED'
FOR UPDATE;

-- If count < 15 → INSERT new appointment row, COMMIT
-- If count >= 15 → ROLLBACK, return 400 SLOT_FULL
```

`FOR UPDATE` locks the matching rows until the transaction ends, so a second concurrent request has to wait its turn and re-count — it can never sneak past the 15-slot cap.

---

## 5. Duplicate Submission Protection (Unstable Internet / Multiple Clicks)

**Problem:** A patient on a weak connection may tap "Submit" multiple times, or their browser may auto-retry a failed request — this must never create more than one appointment.

**Solution: Idempotency Key**

1. When the booking form loads, the frontend generates a random unique key (UUID) and stores it in memory (e.g., `req-8f3a...`).
2. This same key is sent with every submit attempt for that form session — including retries — as part of the payload: `{..., idempotency_key: "req-8f3a..."}`.
3. On the server, before doing anything else:
   ```sql
   SELECT * FROM appointments WHERE idempotency_key = ?;
   ```
   - **If a row already exists** → don't insert again. Return the **same** success response as the original booking (`200 OK` with the existing `appointment_id` and `booking_reference`).
   - **If no row exists** → proceed through the checks in this order, then insert with this idempotency key:
     1. Same-doctor check (Section 1, Rule 2) → reject `409 DOCTOR_ALREADY_BOOKED` if patient already has an active appointment with this doctor.
     2. Same-batch check (Section 1, Rule 1) → reject `409 BATCH_ALREADY_BOOKED` if patient already has an active appointment in this batch (with any doctor).
     3. Slot-capacity check (Section 4) → reject `400 SLOT_FULL` if the batch has hit 15 bookings.

**Why this is the right layer to fix it:** it catches duplicate clicks *before* they even reach the capacity/active-appointment logic, so retries are silently absorbed and the patient always sees one consistent confirmation — never an error, never a second booking.

**Backup safety net:** even if a duplicate somehow bypassed the idempotency check, the per-batch unique constraint and same-doctor check (Section 1) would still block a second `SCHEDULED` row for the same phone + batch, or the same phone + doctor.

---

## 6. Booking Reference Format

| Detail | Value |
|---|---|
| Pattern | `HOS-YYYYMMDD-XXXX` |
| Example | `HOS-20260706-A1K9` |
| Generation | Date (8 digits) + 4-character random alphanumeric code |
| Storage | `booking_reference` column, unique |
| Use | Shown on the on-screen confirmation; patient can quote it if calling the hospital |

---

## 7. Staff Authentication & Security

| Concern | Decision |
|---|---|
| Password storage | bcrypt hashing, 10+ salt rounds |
| Session/auth | JWT bearer token, sent as `Authorization: Bearer <token>` |
| Login rate limiting | Max 5 failed attempts per minute per IP (brute-force protection) |
| Transport security | HTTPS/TLS 1.2+ required on all endpoints |

---

## 8. Batch Booking Cutoff Rules

| Rule | Value |
|---|---|
| Morning batch (9 AM–1 PM) | Bookable until 1:00 PM same day |
| Evening batch (4 PM–8 PM) | Bookable until 4:00 PM same day |
| Advance booking window | Up to 7 days ahead |

---

## 9. REST API Contract

### Public (No Login — Patients)

**GET `/api/departments`**
Response `200`:
```json
[{ "department_id": 1, "name": "Cardiology" }]
```

**GET `/api/doctors?department_id=&available=true`**
Response `200`:
```json
[{ "doctor_id": 5, "name": "Dr. Singh", "department": "Cardiology", "is_available_today": true }]
```

**GET `/api/doctors/:id/slots?date=2026-07-15`**
Response `200`:
```json
{
  "doctor_id": 5,
  "doctor_name": "Dr. Singh",
  "appointment_date": "2026-07-15",
  "morning": { "booked": 14, "isFull": false },
  "evening": { "booked": 15, "isFull": true }
}
```

**POST `/api/appointments`**
Payload:
```json
{
  "doctor_id": 5,
  "patient_name": "Raj Kumar",
  "patient_age": 34,
  "patient_phone": "9876543210",
  "health_issue": "Chest pain",
  "appointment_date": "2026-07-15",
  "batch": "MORNING",
  "idempotency_key": "req-8f3a2c1e"
}
```
Success `201`:
```json
{
  "appointment_id": 42,
  "booking_reference": "HOS-20260715-A1K9",
  "doctor_name": "Dr. Singh",
  "patient_name": "Raj Kumar",
  "appointment_date": "2026-07-15",
  "batch": "MORNING",
  "status": "SCHEDULED"
}
```
Duplicate retry (same idempotency_key) → `200 OK` with the same body as above.

Error `409` (same doctor already has an active appointment for this patient):
```json
{ "error": "DOCTOR_ALREADY_BOOKED", "message": "This phone number already has an active appointment with this doctor" }
```
Error `409` (patient already has an active appointment in this batch, with a different doctor):
```json
{ "error": "BATCH_ALREADY_BOOKED", "message": "This phone number already has an active MORNING appointment. Book EVENING instead, or cancel the existing one." }
```
Error `400` (batch full):
```json
{ "error": "SLOT_FULL", "message": "All morning slots are full for this doctor on this date" }
```

**GET `/api/appointments/lookup?phone=9876543210`**
Response `200`:
```json
[{ "appointment_id": 42, "doctor_name": "Dr. Singh", "appointment_date": "2026-07-15", "batch": "MORNING", "status": "SCHEDULED" }]
```

**PATCH `/api/appointments/:id/cancel`**
Payload: `{ "patient_phone": "9876543210" }`
Success `200`: `{ "appointment_id": 42, "status": "CANCELLED" }`
Error `403`: `{ "error": "PHONE_MISMATCH" }`

### Staff Only (Login Required)

**POST `/api/auth/login`**
Payload: `{ "username": "reception1", "password": "..." }`
Success `200`: `{ "token": "<jwt>", "role": "RECEPTIONIST" }`
Error `401`: `{ "error": "INVALID_CREDENTIALS" }`

**GET `/api/staff/appointments?date=&doctor_id=&department_id=`**
Header: `Authorization: Bearer <token>`
Response `200`:
```json
[{ "appointment_id": 42, "patient_name": "Raj Kumar", "patient_phone": "9876543210", "doctor_name": "Dr. Singh", "batch": "MORNING", "status": "SCHEDULED" }]
```

**PATCH `/api/staff/appointments/:id/done`**
Header: `Authorization: Bearer <token>`
Success `200`: `{ "appointment_id": 42, "status": "DONE" }`
