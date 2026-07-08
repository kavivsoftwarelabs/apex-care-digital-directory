const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");
const SlotCounter = require("../models/SlotCounter");

const VALID_BATCHES = ["MORNING", "EVENING"];
const MAX_SLOTS = 15;

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

exports.bookAppointment = async (req, res) => {
    try {
        const {
            doctor_id, patient_name, patient_age, patient_phone,
            health_issue, appointment_date, batch, idempotency_key
        } = req.body;

        if (!doctor_id || !patient_name || !patient_age || !patient_phone ||
            !health_issue || !appointment_date || !batch || !idempotency_key) {
            return res.status(400).json({ error: "MISSING_FIELDS", message: "All fields are required." });
        }
        if (!mongoose.Types.ObjectId.isValid(doctor_id)) {
            return res.status(400).json({ error: "INVALID_DOCTOR_ID", message: "doctor_id is not a valid ID." });
        }
        if (!VALID_BATCHES.includes(batch)) {
            return res.status(400).json({ error: "INVALID_BATCH", message: "Batch must be MORNING or EVENING." });
        }

        const doctor = await Doctor.findById(doctor_id);
        if (!doctor) {
            return res.status(404).json({ error: "DOCTOR_NOT_FOUND", message: "No doctor found with that ID." });
        }

        // 1. Idempotency check
        const existing = await Appointment.findOne({ idempotency_key });
        if (existing) {
            return res.status(200).json({
                appointment_id: existing._id,
                booking_reference: existing.booking_reference,
                doctor_name: doctor.doctor_name,
                patient_name: existing.patient_name,
                appointment_date: existing.appointment_date,
                batch: existing.batch,
                status: existing.status
            });
        }

        // 2. Same-doctor check
        const doctorClash = await Appointment.findOne({ patient_phone, doctor_id, status: "SCHEDULED" });
        if (doctorClash) {
            return res.status(409).json({
                error: "DOCTOR_ALREADY_BOOKED",
                message: "This phone number already has an active appointment with this doctor"
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
                { doctor_id, appointment_date, batch, count: { $lt: MAX_SLOTS } },
                { $inc: { count: 1 } },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );
            slotReserved = true;
        } catch (err) {
            if (err.code === 11000) {
                return res.status(400).json({
                    error: "SLOT_FULL",
                    message: `All ${batch.toLowerCase()} slots are full for this doctor on this date`
                });
            }
            throw err;
        }

        // 5. Create the appointment
        try {
            const bookingReference = generateBookingReference(appointment_date);
            const appointment = await Appointment.create({
                doctor_id, patient_name, patient_age, patient_phone,
                health_issue, appointment_date, batch,
                booking_reference: bookingReference, idempotency_key
            });

            return res.status(201).json({
                appointment_id: appointment._id,
                booking_reference: appointment.booking_reference,
                doctor_name: doctor.doctor_name,
                patient_name: appointment.patient_name,
                appointment_date: appointment.appointment_date,
                batch: appointment.batch,
                status: appointment.status
            });
        } catch (err) {
            if (slotReserved) {
                await SlotCounter.updateOne(
                    { doctor_id, appointment_date, batch, count: { $gt: 0 } },
                    { $inc: { count: -1 } }
                );
            }
            if (err.name === "ValidationError") {
                return res.status(400).json({ error: "VALIDATION_ERROR", message: err.message });
            }
            throw err;
        }
    } catch (err) {
        console.error("Error booking appointment:", err);
        return res.status(500).json({ error: "SERVER_ERROR", message: "Something went wrong. Please try again." });
    }
};

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