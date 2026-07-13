const Doctor = require("../models/Doctor");

function groupByDepartment(doctors) {
    const grouped = {};

    doctors.forEach((doctor) => {
        if (!grouped[doctor.department]) {
            grouped[doctor.department] = [];
        }

        grouped[doctor.department].push({
            doctor_id: doctor._id,
            name: doctor.name,
            is_available_today: doctor.is_available_today,
        });
    });

    return grouped;
}

exports.getDoctors = async (req, res) => {
    try {
        console.log("Query:", req.query);

        const filter = {};

        if (req.query.department) {
            filter.department = req.query.department;
        }

        if (req.query.available !== undefined) {
            filter.is_available_today = req.query.available === "true";
        }

        console.log("Filter:", filter);

        const doctors = await Doctor.find(filter);

        console.log("Doctors found:", doctors.length);

        const grouped = groupByDepartment(doctors);

        res.status(200).json(grouped);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};
