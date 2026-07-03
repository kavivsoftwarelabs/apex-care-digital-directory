# Software Requirements Specification (SRS)
## Hospital Appointment & Doctor Directory System

---

## 1. Overview

Replace the hospital's paper-based front desk with a simple website where:
- Patients can browse doctors and book appointments — no login needed.
- Staff can log in to see and manage the day's appointments.

---

## 2. Functional Requirements

### 2.1 Doctor Directory (Public)
- List all doctors with name, department, and today's availability.
- Departments: Pediatrics, Orthopedics, Cardiology, General Medicine.
- Filter doctors by department.
- All doctors are assumed available every day — "availability" just means whether slots are still open.

### 2.2 Booking an Appointment (Public)
- Patient picks: Doctor → Date → Batch (Morning 9AM–1PM or Evening 4PM–8PM).
- Patient enters: Name, Age, Phone Number, brief health issue. No account/password.
- Each doctor can take max **15 patients per batch** (15 morning + 15 evening). Batch auto-locks as "Full" at 15.
- One patient (by phone number) can have only **one active appointment at a time**.
- Bookings allowed up to **7 days in advance**.
- On success, show an on-screen confirmation with a booking reference. No SMS/email.

### 2.3 Cancelling an Appointment (Public, Patient-Only)
- Patient enters their phone number to see their active appointment.
- Patient can cancel it themselves — this frees up the slot instantly.
- **Staff cannot cancel appointments** — only the patient can, via phone number.

### 2.4 Appointment Status
Each appointment moves through one of these states:
- **Scheduled** → set when booked.
- **Done** → staff marks it after the patient is consulted.
- **Abandoned** → auto-set at end of day if still Scheduled (patient never showed).
- **Cancelled** → patient cancelled it themselves.

Only "Scheduled" appointments count toward the 15-slot limit and the one-active-appointment rule.

### 2.5 Staff Login & Dashboard
- Simple username/password login for receptionists.
- Dashboard shows all of today's appointments, filterable by doctor or department.
- Staff can print the daily list.
- Staff can mark an appointment "Done" after consultation.
- Staff can see patient phone number and issue description for each booking.

---

## 3. Non-Functional Requirements

- **Load:** Must handle 500 people using it at once (e.g., Monday rush) without crashing.
- **Speed:** Pages should load in ~2 seconds normally, under 5 seconds at peak.
- **No overbooking:** Slot booking must be handled safely so two people can't grab the same last slot at once.
- **Privacy:** Patient details (phone, health issue) are visible only to logged-in staff — never public.
- **Low-cost hosting:** Built to run on a basic, affordable server — no premium cloud needed.
- **Simple tech stack:** Lightweight backend (e.g., Node.js) + lightweight database (e.g., SQLite/MySQL).
- **Mobile-friendly:** Easy to use on a phone browser, minimal steps, large buttons — many patients are from rural areas.
- **Basic security:** Hashed staff passwords, protection against common web attacks, rate-limiting on public forms.
- **End-of-day job:** An automated task runs daily to mark unfinished appointments as "Abandoned."

---

## 4. Out of Scope (This Sprint)

- Online payments (cash only, at the counter)
- SMS/email confirmations
- Patient accounts or medical history
- Doctor-side login/portal
- Multiple hospital branches
- Prescriptions / EHR
- Reports & analytics beyond the daily printable list
- Native mobile apps
- Waitlists for full batches
- Multi-language support
- Staff role tiers (Admin vs. Receptionist)

---

## 5. Confirmed Assumptions

- All doctors available every day (no leave tracking).
- 15-patient limit is per doctor, per batch.
- One active appointment per patient at a time.
- Bookings open up to 7 days ahead.
- Only patients can cancel — not staff.
- Staff mark visits "Done"; no-shows auto-become "Abandoned" at day's end.
