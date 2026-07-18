const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");
const SlotCounter = require("../models/SlotCounter");

const VALID_BATCHES = ["MORNING", "EVENING"];
const MAX_SLOTS = 15;
const MAX_DAYS_AHEAD = 7;

function generateBookingReference(appointmentDate) {
  const d = new Date(appointmentDate);
  const datePart = d.toISOString().slice(0, 10).replace(/-/g, "");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let random = "";
  for (let i = 0; i < 4; i++) {
    random += chars[Math.floor(Math.random() * chars.length)];
  }
  return `HOS-${datePart}-${random}`;
}

// ---------------------------------------------------------------------------
// POST /api/v1/appointments  (Public — book an appointment)
// Rule: max 15 bookings per doctor per date/batch (enforced atomically via
// SlotCounter so concurrent requests can't oversell a batch).
// ---------------------------------------------------------------------------
exports.bookAppointment = async (req, res) => {
  try {
    const {
      doctor_id, patient_name, patient_age, patient_phone,
      health_issue, appointment_date, batch, idempotency_key
    } = req.body;

    if (!doctor_id || !patient_name || !patient_age || !patient_phone ||
      !health_issue || !appointment_date || !batch) {
      return res.status(400).json({ error: "MISSING_FIELDS", message: "All fields are required." });
    }
    if (!mongoose.Types.ObjectId.isValid(doctor_id)) {
      return res.status(400).json({ error: "INVALID_DOCTOR_ID", message: "doctor_id is not a valid ID." });
    }
    if (!VALID_BATCHES.includes(batch)) {
      return res.status(400).json({ error: "INVALID_BATCH", message: "Batch must be MORNING or EVENING." });
    }

    const date = new Date(appointment_date);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: "INVALID_DATE", message: "Invalid appointment_date." });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + MAX_DAYS_AHEAD);
    if (date < today) {
      return res.status(400).json({ error: "DATE_IN_PAST", message: "Appointment date cannot be in the past." });
    }
    if (date > maxDate) {
      return res.status(400).json({
        error: "DATE_TOO_FAR",
        message: `Appointments can only be booked up to ${MAX_DAYS_AHEAD} days in advance.`
      });
    }

    const doctor = await Doctor.findById(doctor_id);
    if (!doctor) {
      return res.status(404).json({ error: "DOCTOR_NOT_FOUND", message: "No doctor found with that ID." });
    }

    // 1. Idempotency check (double-click / retry safe)
    if (idempotency_key) {
      const existing = await Appointment.findOne({ idempotency_key });
      if (existing) {
        return res.status(200).json({
          appointment_id: existing._id,
          booking_reference: existing.booking_reference,
          doctor_name: doctor.name,
          patient_name: existing.patient_name,
          appointment_date: existing.appointment_date,
          batch: existing.batch,
          status: existing.status
        });
      }
    }

    // 2. Same-doctor check
    const doctorClash = await Appointment.findOne({ patient_phone, doctor_id, status: "SCHEDULED" });
    if (doctorClash) {
      return res.status(409).json({
        error: "DOCTOR_ALREADY_BOOKED",
        message: "This phone number already has an active appointment with this doctor."
      });
    }

    // 3. Same-batch check
    const batchClash = await Appointment.findOne({ patient_phone, batch, status: "SCHEDULED" });
    if (batchClash) {
      return res.status(409).json({
        error: "BATCH_ALREADY_BOOKED",
        message: `This phone number already has an active ${batch} appointment.`
      });
    }

    // 4. Atomically reserve a slot (per doctor + date + batch)
    let slotReserved = false;
    try {
      await SlotCounter.findOneAndUpdate(
        { doctor_id, appointment_date: date, batch, count: { $lt: MAX_SLOTS } },
        { $inc: { count: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      slotReserved = true;
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({
          error: "SLOT_FULL",
          message: `All ${batch.toLowerCase()} slots are full for this doctor on this date.`
        });
      }
      throw err;
    }

    // 5. Create the appointment
    try {
      const booking_reference = generateBookingReference(date);
      const appointment = await Appointment.create({
        doctor_id, patient_name, patient_age, patient_phone,
        health_issue, appointment_date: date, batch,
        booking_reference, idempotency_key
      });

      return res.status(201).json({
        appointment_id: appointment._id,
        booking_reference: appointment.booking_reference,
        doctor_name: doctor.name,
        patient_name: appointment.patient_name,
        appointment_date: appointment.appointment_date,
        batch: appointment.batch,
        status: appointment.status
      });
    } catch (err) {
      if (slotReserved) {
        await SlotCounter.updateOne(
          { doctor_id, appointment_date: date, batch, count: { $gt: 0 } },
          { $inc: { count: -1 } }
        );
      }
      if (err.name === "ValidationError") {
        return res.status(400).json({ error: "VALIDATION_ERROR", message: err.message });
      }
      if (err.code === 11000) {
        return res.status(409).json({ error: "DUPLICATE_BOOKING", message: "Duplicate booking detected." });
      }
      throw err;
    }
  } catch (err) {
    console.error("Error booking appointment:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Something went wrong. Please try again." });
  }
};

// ---------------------------------------------------------------------------
// POST /api/v1/appointments/cancel  (Public — cancel via phone + booking ref)
// ---------------------------------------------------------------------------
exports.cancelAppointment = async (req, res) => {
  try {
    const { patient_phone, booking_reference } = req.body;

    if (!patient_phone || !booking_reference) {
      return res.status(400).json({
        error: "MISSING_FIELDS",
        message: "patient_phone and booking_reference are required."
      });
    }

    const appointment = await Appointment.findOne({ patient_phone, booking_reference, status: "SCHEDULED" });

    if (!appointment) {
      return res.status(403).json({
        error: "PHONE_MISMATCH",
        message: "No active appointment found for this phone number and booking reference."
      });
    }

    appointment.status = "CANCELLED";
    await appointment.save();

    await SlotCounter.updateOne(
      {
        doctor_id: appointment.doctor_id,
        appointment_date: appointment.appointment_date,
        batch: appointment.batch,
        count: { $gt: 0 }
      },
      { $inc: { count: -1 } }
    );

    return res.status(200).json({ appointment_id: appointment._id, status: "CANCELLED" });
  } catch (err) {
    console.error("Error cancelling appointment:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Something went wrong. Please try again." });
  }
};

// ---------------------------------------------------------------------------
// GET /api/v1/admin/appointments  (Staff-only — today's appointments dashboard)
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
// GET /api/v1/appointments  (general listing — same filters, no "today" default)
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
// GET /api/v1/appointments/lookup  (Public — patient looks up their own booking)
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
// PATCH /api/v1/appointments/:id/cancel  (Public — cancel by id + ownership proof)
// Body: { phone, booking_reference }   (BOTH required to prove ownership)
// ---------------------------------------------------------------------------
exports.cancelAppointmentById = async (req, res) => {
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

    await SlotCounter.updateOne(
      {
        doctor_id: appointment.doctor_id,
        appointment_date: appointment.appointment_date,
        batch: appointment.batch,
        count: { $gt: 0 }
      },
      { $inc: { count: -1 } }
    );

    res.status(200).json({ message: "Appointment cancelled.", appointment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/v1/appointments/:id/done  (Staff only — mark appointment as consulted)
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
