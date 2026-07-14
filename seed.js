const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });
const mongoose = require('mongoose');
const Doctor = require('./src/models/Doctor');

async function seed() {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI is missing from your environment variables. Check your .env file.");
        }

        console.log("Connecting to MongoDB Atlas...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully!");

        // Clear existing data
        await Doctor.deleteMany({});
        console.log("Cleared old doctor records.");

       // Insert new data
        const doctors = await Doctor.insertMany([
            { name: "Dr. Singh", department: "Cardiology", is_available_today: true },
            { name: "Dr. Mehta", department: "Pediatrics", is_available_today: true },
            { name: "Dr. Verma", department: "Orthopedics", is_available_today: true },
            { name: "Dr. Rao", department: "General Medicine", is_available_today: true }
        ]);

        console.log("\nSeeded doctors successfully:");
        doctors.forEach(d => console.log(`${d.name} -> ID: ${d._id}`));

    } catch (error) {
        console.error("\nSeeding failed:");
        console.error(error.message);
    } finally {
        await mongoose.disconnect();
        console.log("\nDisconnected from MongoDB.");
    }
}

seed();