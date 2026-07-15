const mongoose = require("mongoose");

const doctorSchema = new mongoose.Schema(
    {
        name: { 
            type: String, 
            required: true, 
            trim: true 
        },
        department: {
            type: String,
            enum: ["Pediatrics", 
                   "Orthopedics", 
                   "Cardiology", 
                   "General Medicine"],
            required: true,
        },
        is_available_today: { 
            type: Boolean, 
            default: true 
        },
    },
    { timestamps: true, collection: "doctors" }
);

module.exports = mongoose.model("Doctor", doctorSchema);
