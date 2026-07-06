const Appointment = require("../models/Appointment");

exports.getAppointments = async (req, res) => {
    try {
        const filters = {
            date: req.query.date,
            doctor_id: req.query.doctor_id,
            department_id: req.query.department_id
        };

        const appointments = await Appointment.getAppointments(filters);

        res.status(200).json(appointments);

    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: "Internal Server Error"
        });
    }
};