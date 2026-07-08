const mongoose = require("mongoose");

const slotCounterSchema = new mongoose.Schema(
    {
        doctor_id: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true },
        appointment_date: { type: Date, required: true },
        batch: { type: String, enum: ["MORNING", "EVENING"], required: true },
        count: { type: Number, default: 0 },
    },
    { collection: "slot_counters" }
);

slotCounterSchema.index(
    { doctor_id: 1, appointment_date: 1, batch: 1 },
    { unique: true }
);

module.exports = mongoose.model("SlotCounter", slotCounterSchema);