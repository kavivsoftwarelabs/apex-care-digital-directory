const express = require("express");
const router = express.Router();
const appointmentController = require("../controllers/appointmentController");

router.post("/", appointmentController.bookAppointment);
router.post("/cancel", appointmentController.cancelAppointment);

module.exports = router;

const appointmentController = require("../controllers/appointmentController");

router.get("/dashboard", appointmentController.getDashboardAppointments);
router.get("/lookup", appointmentController.lookupAppointment);
router.get("/", appointmentController.getAppointments);
router.post("/", appointmentController.createAppointment);
router.patch("/:id/cancel", appointmentController.cancelAppointment);
router.patch("/:id/done", appointmentController.markAppointmentDone);

module.exports = router;
