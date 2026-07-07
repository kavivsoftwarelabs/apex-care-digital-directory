const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    doctor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },

    patient_name: {
      type: String,
      required: true,
      trim: true,
    },

    patient_age: {
      type: Number,
      required: true,
      min: 0,
    },

    patient_phone: {
      type: String,
      required: true,
      trim: true,
    },

    health_issue: {
      type: String,
      required: true,
      trim: true,
    },

    appointment_date: {
      type: Date,
      required: true,
    },

    batch: {
      type: String,
      enum: ["MORNING", "EVENING"],
      required: true,
    },

    status: {
      type: String,
      enum: ["SCHEDULED", "DONE", "CANCELLED"],
      default: "SCHEDULED",
    },

    booking_reference: {
      type: String,
      unique: true,
      sparse: true,
    },

    idempotency_key: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  {
    timestamps: true,
    collection: "appointments",
  }
);

module.exports = mongoose.model("Appointment", appointmentSchema);