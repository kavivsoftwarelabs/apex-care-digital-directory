exports.getDoctors = async(req, res) => {
    try{
        const doctors = await Doctor.getAllDoctors();

        const grouped = groupByDepartment(doctors);

        req.status(200).json(grouped);
    } catch(err) {
        res.status(500).json({
            error:"Internal Server Error"
        });
    }
};