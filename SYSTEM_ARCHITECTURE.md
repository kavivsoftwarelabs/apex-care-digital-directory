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
| status | ENUM('BOOKED','CANCELLED') | Default BOOKED |

### staff

| Column | Type | Notes |
|---|---|---|
| staff_id | INT (PK) | Auto-increment |
| username | VARCHAR(50) | Unique login |
| password_hash | VARCHAR(255) | For receptionist login |

### Relationships

| Relationship | Cardinality |
|---|---|
| departments → doctors | 1 : N |
| doctors → appointments | 1 : N |

**Business rule:** A doctor can have max **15 BOOKED appointments** per (doctor_id, appointment_date, batch) combination. Once 15 are reached, that batch is locked from new bookings.

---

## 2. REST API Contract

### Public (No Login — Patients)

| Method | Endpoint | Payload | Response |
|---|---|---|---|
| GET | `/api/departments` | — | 200: List of departments |
| GET | `/api/doctors` | — | 200: List of doctors with department & availability |
| GET | `/api/doctors/:id/slots?date=` | — | 200: `{morning: {booked, isFull}, evening: {booked, isFull}}` |
| POST | `/api/appointments` | `{doctor_id, patient_name, patient_age, patient_phone, health_issue, appointment_date, batch}` | 201: Booking confirmed / 400: `SLOT_FULL` |
| GET | `/api/appointments/lookup?phone=` | — | 200: List of patient's active appointments |
| PATCH | `/api/appointments/:id/cancel` | `{patient_phone}` | 200: Cancelled / 403: Phone mismatch |

### Staff Only (Login Required)

| Method | Endpoint | Payload | Response |
|---|---|---|---|
| POST | `/api/auth/login` | `{username, password}` | 200: Token / 401: Invalid credentials |
| GET | `/api/staff/appointments?date=&doctor_id=&department_id=` | — | 200: Filtered daily appointment list |
