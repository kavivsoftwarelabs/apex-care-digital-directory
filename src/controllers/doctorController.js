const Doctor = require("../models/Doctor");

function groupByDepartment(doctors) {
    const grouped = {};

    doctors.forEach(doctor => {
        const department = doctor.department;

        if (!grouped[department]) {
            grouped[department] = [];
        }

        grouped[department].push({
            doctor_id: doctor.doctor_id,
            doctor_name: doctor.doctor_name,
            is_available_today: doctor.is_available_today
        });
    });

    return grouped;
}

exports.getDoctors = async (req, res) => {
    try {
        const doctors = await Doctor.getAllDoctors();

        const grouped = groupByDepartment(doctors);

        res.status(200).json(grouped);

    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: err.message
        });
    }
};