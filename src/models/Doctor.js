const mongoose = require("mongoose");

const doctorSchema = new mongoose.Schema({
    doctor_name: {
        type: String,
        required: true,
    },
    department: {
        type: String,
        required: true,
        enum: [
            "Pediatrics",
            "Orthopedics",
            "Cardiology",
            "General Medicine",
        ],
    },
    is_available_today: {
        type: Boolean,
        default: true,
    },
    slotsAvailable: {
        type: Number,
        default: 15,
    },
});
