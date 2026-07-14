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
      validate: {
        validator: function (value) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return value >= today;
        },
        message: "Appointment date cannot be in the past.",
      },
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

appointmentSchema.index({ patient_phone: 1, status: 1 });
appointmentSchema.index({
  doctor_id: 1,
  appointment_date: 1,
  batch: 1,
  status: 1,
});

module.exports = mongoose.model("Appointment", appointmentSchema);
