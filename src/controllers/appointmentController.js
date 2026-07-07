const Appointment = require("../models/Appointment");

exports.getAppointments = async (req, res) => {
    try {
        const { date, doctor_id, department } = req.query;

        const filter = {};

        if (date) {
            const start = new Date(date);
            const end = new Date(date);
            end.setDate(end.getDate() + 1);

            filter.appointment_date = {
                $gte: start,
                $lt: end,
            };
        }

        if (doctor_id) {
            filter.doctor_id = doctor_id;
        }

        const appointments = await Appointment.find(filter)
            .populate({
                path: "doctor_id",
                select: "doctor_name department",
                ...(department && {
                    match: { department: department }
                })
            })
            .sort({ appointment_date: 1 });

        const filteredAppointments = appointments.filter(
            appointment => appointment.doctor_id !== null
        );

        res.status(200).json(filteredAppointments);

    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: err.message,
        });
    }
};