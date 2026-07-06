static async getAllDoctors() {
    const sql = `
    SELECT
        d.department_id,
        d.name AS department,
        doc.doctor_id,
        doc.name AS doctor_name,
        doc.is_available_today

    FROM departments d

    JOIN doctors doc
    ON d.department_id = doc.department_id
    
    ORDER BY 
        d.name, doc.name
    `;
}