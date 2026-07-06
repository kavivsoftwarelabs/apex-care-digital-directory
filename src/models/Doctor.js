const db = require("../config/db");

class Doctor {

    static async getAllDoctors() {

        const query = `
            SELECT
                d.doctor_id,
                d.doctor_name,
                d.is_available_today,
                dep.department_id,
                dep.department_name AS department
            FROM doctors d
            INNER JOIN departments dep
                ON d.department_id = dep.department_id
            ORDER BY dep.department_name, d.doctor_name;
        `;

        const [rows] = await db.execute(query);

        return rows;
    }

}

module.exports = Doctor;
