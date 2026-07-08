const express = require("express");
const router = express.Router();
const appointmentController = require("../controllers/appointmentController");

router.post("/", appointmentController.bookAppointment);
router.post("/cancel", appointmentController.cancelAppointment);

module.exports = router;