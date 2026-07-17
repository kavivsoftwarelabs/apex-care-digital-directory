const express = require("express");
const router = express.Router();
const appointmentController = require("../controllers/appointmentController");

router.post("/", appointmentController.bookAppointment);
router.post("/cancel", appointmentController.cancelAppointment);

router.get("/", appointmentController.getAppointments);
router.get("/lookup", appointmentController.lookupAppointment);
router.patch("/:id/cancel", appointmentController.cancelAppointmentById);
router.patch("/:id/done", appointmentController.markAppointmentDone);

module.exports = router;
