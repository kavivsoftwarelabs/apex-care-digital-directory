# 🚀 Week 2: Core Backend Implementation Sprint

Welcome to the building phase. The system architecture has been approved. Your objective this week is to build the functional REST API endpoints for the Apex Care Hospital platform.

### 🛠️ Required Endpoints to Build:
1. `GET /api/v1/doctors` -> Fetch all doctors grouped by department.
2. `POST /api/v1/appointments` -> Book an appointment.
   - *Rule:* Must check the database first. If a doctor has 15 bookings for that specific date/batch, throw a `400 Bad Request` error.
3. `POST /api/v1/appointments/cancel` -> Cancel an appointment via verified phone number and cancellation token.
4. `GET /api/v1/admin/appointments` -> Secure endpoint for receptionists to view all bookings for the current day.

### 🤖 AI-First Execution Rules:
- Feed this folder architecture and your `SYSTEM_ARCHITECTURE.md` file into your LLMs (Claude/ChatGPT).
- Prompt the AI to generate the controller logic and database schema models based strictly on our structural layout.
- Work in separate feature branches (e.g., `feature/appointment-routes`, `feature/doctor-routes`). Do not push directly to main.