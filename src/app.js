// Main Express app entry placeholder
const express = require("express");
const appointmentRoutes = require("./routes/appointmentRoutes");

const app = express();
app.use(express.json());

app.use("/api/v1/appointments", appointmentRoutes);

// Parvez: mount your routes here once ready, e.g.
// const doctorRoutes = require("./routes/doctorRoutes");
// app.use("/api/v1/doctors", doctorRoutes);

app.get("/", (req, res) => res.send("Apex Care API is running"));

module.exports = app;