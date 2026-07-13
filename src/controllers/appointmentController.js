const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");

const MAX_PER_BATCH = 15;
const MAX_DAYS_AHEAD = 7;

function generateBookingReference() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BK-${datePart}-${randomPart}`;
}

// ---------------------------------------------------------------------------
// GET /api/appointments/dashboard
// Staff-only: master list of today's appointments, filterable by doctor or department.
// Query params (all optional):
//   date         -> YYYY-MM-DD, defaults to today
//   doctor_id    -> filter to one doctor
//   department   -> filter to all doctors in a department
// ---------------------------------------------------------------------------
exports.getDashboardAppointments = async (req, res) => {
  try {
    const { date, doctor_id, department } = req.query;

    const targetDate = date ? new Date(date) : new Date();
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    }
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const filter = {
      appointment_date: { $gte: targetDate, $lt: nextDay },
    };

    if (doctor_id) {
      if (!mongoose.Types.ObjectId.isValid(doctor_id)) {
        return res.status(400).json({ error: "Invalid doctor_id." });
      }
      filter.doctor_id = doctor_id;
    } else if (department) {
      // Resolve department -> doctor ids BEFORE the query, so appointments
      // don't get dropped by a post-query populate/match.
      const doctorsInDept = await Doctor.find({ department }).select("_id");
      filter.doctor_id = { $in: doctorsInDept.map((d) => d._id) };
    }

    const appointments = await Appointment.find(filter)
      .populate({ path: "doctor_id", select: "name department" })
      .sort({ batch: 1, appointment_date: 1 });

    res.status(200).json(appointments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------------------------------------
// GET /api/appointments  (general listing — same filters, no "today" default)
// Query params: date, doctor_id, department
// ---------------------------------------------------------------------------
exports.getAppointments = async (req, res) => {
  try {
    const { date, doctor_id, department } = req.query;
    const filter = {};

    if (date) {
      const start = new Date(date);
      if (isNaN(start.getTime())) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
      }
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      filter.appointment_date = { $gte: start, $lt: end };
    }

    if (doctor_id) {
      if (!mongoose.Types.ObjectId.isValid(doctor_id)) {
        return res.status(400).json({ error: "Invalid doctor_id." });
      }
      filter.doctor_id = doctor_id;
    } else if (department) {
      const doctorsInDept = await Doctor.find({ department }).select("_id");
      filter.doctor_id = { $in: doctorsInDept.map((d) => d._id) };
    }

    const appointments = await Appointment.find(filter)
      .populate({ path: "doctor_id", select: "name department" })
      .sort({ appointment_date: 1, batch: 1 });

    res.status(200).json(appointments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------------------------------------
// POST /api/appointments  (Public — book an appointment)
// ---------------------------------------------------------------------------
exports.createAppointment = async (req, res) => {
  try {
    const {
      doctor_id,
      patient_name,
      patient_age,
      patient_phone,
      health_issue,
      appointment_date,
      batch,
      idempotency_key,
    } = req.body;

    if (!doctor_id || !patient_name || !patient_age || !patient_phone || !health_issue || !appointment_date || !batch) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    if (!mongoose.Types.ObjectId.isValid(doctor_id)) {
      return res.status(400).json({ error: "Invalid doctor_id." });
    }

    const doctor = await Doctor.findById(doctor_id);
    if (!doctor) {
      return res.status(404).json({ error: "Doctor not found." });
    }

    const date = new Date(appointment_date);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: "Invalid appointment_date." });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + MAX_DAYS_AHEAD);

    if (date < today) {
      return res.status(400).json({ error: "Appointment date cannot be in the past." });
    }
    if (date > maxDate) {
      return res.status(400).json({ error: `Appointments can only be booked up to ${MAX_DAYS_AHEAD} days in advance.` });
    }

    // Idempotency check — prevents duplicate double-submits (e.g. double-click, retry)
    if (idempotency_key) {
      const existingByKey = await Appointment.findOne({ idempotency_key });
      if (existingByKey) {
        return res.status(200).json(existingByKey);
      }
    }

    // Enforce: one active (SCHEDULED) appointment per patient at a time
    const existingActive = await Appointment.findOne({
      patient_phone,
      status: "SCHEDULED",
    });
    if (existingActive) {
      return res.status(409).json({
        error: "You already have an active appointment. Please cancel it before booking another.",
      });
    }

    // Enforce: max 15 per doctor per batch per day.
    // NOTE: for full race-condition safety under heavy concurrent load,
    // wrap this count-then-insert in a MongoDB transaction or an atomic
    // counter document. Flagging as a follow-up hardening item.
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const countInBatch = await Appointment.countDocuments({
      doctor_id,
      batch,
      status: "SCHEDULED",
      appointment_date: { $gte: dayStart, $lt: dayEnd },
    });

    if (countInBatch >= MAX_PER_BATCH) {
      return res.status(409).json({ error: "This batch is fully booked. Please choose another slot." });
    }

    const booking_reference = generateBookingReference();

    const appointment = await Appointment.create({
      doctor_id,
      patient_name,
      patient_age,
      patient_phone,
      health_issue,
      appointment_date: date,
      batch,
      status: "SCHEDULED",
      booking_reference,
      idempotency_key,
    });

    res.status(201).json(appointment);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "Duplicate booking detected." });
    }
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------------------------------------
// GET /api/appointments/lookup  (Public — patient looks up their own booking)
// Query params: phone, booking_reference   (BOTH required for security)
// ---------------------------------------------------------------------------
exports.lookupAppointment = async (req, res) => {
  try {
    const { phone, booking_reference } = req.query;

    if (!phone || !booking_reference) {
      return res.status(400).json({ error: "Phone number and booking reference are both required." });
    }

    const appointment = await Appointment.findOne({
      patient_phone: phone,
      booking_reference,
      status: "SCHEDULED",
    }).populate({ path: "doctor_id", select: "name department" });

    if (!appointment) {
      return res.status(404).json({ error: "No active appointment found for the given details." });
    }

    res.status(200).json(appointment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/appointments/:id/cancel  (Public — patient cancels their own booking)
// Body: { phone, booking_reference }   (BOTH required to prove ownership)
// ---------------------------------------------------------------------------
exports.cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { phone, booking_reference } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid appointment id." });
    }
    if (!phone || !booking_reference) {
      return res.status(400).json({ error: "Phone number and booking reference are both required." });
    }

    const appointment = await Appointment.findOne({
      _id: id,
      patient_phone: phone,
      booking_reference,
    });

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found or details do not match." });
    }

    if (appointment.status !== "SCHEDULED") {
      return res.status(400).json({ error: `Cannot cancel an appointment that is already ${appointment.status}.` });
    }

    appointment.status = "CANCELLED";
    await appointment.save();

    res.status(200).json({ message: "Appointment cancelled.", appointment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/appointments/:id/done  (Staff only — mark appointment as consulted)
// ---------------------------------------------------------------------------
exports.markAppointmentDone = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid appointment id." });
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found." });
    }
    if (appointment.status !== "SCHEDULED") {
      return res.status(400).json({ error: `Cannot mark as done — current status is ${appointment.status}.` });
    }

    appointment.status = "DONE";
    await appointment.save();

    res.status(200).json({ message: "Appointment marked as done.", appointment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
