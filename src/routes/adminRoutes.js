const express = require("express");
const router = express.Router();

const appointmentController = require("../controllers/appointmentController");

// GET /api/v1/admin/appointments -> receptionist dashboard for today's bookings
router.get("/appointments", appointmentController.getDashboardAppointments);

module.exports = router;
