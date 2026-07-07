const express = require("express");
const mongoose = require("mongoose");

const doctorRoutes = require("./routes/doctorRoutes");

const app = express();
const PORT = 5000;

// Middleware
app.use(express.json());

// Routes
app.use("/api/doctors", doctorRoutes);

// Health Check
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "API is running successfully 🚀"
    });
});

// MongoDB Connection
mongoose.connect(
    "mongodb+srv://parvezs:saifip621@cluster0.jfovs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
)
.then(() => {
    console.log("Connected to MongoDB Atlas");

    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
})
.catch((err) => {
    console.error(" MongoDB Connection Failed");
    console.error(err);
});