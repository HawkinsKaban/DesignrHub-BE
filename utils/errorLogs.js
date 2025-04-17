const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "../tmp/error-logs.txt");

const errorLogs = async (req, res, msg, location) => {
    try {
        // Buat folder tmp kalau belum ada
        await fs.promises.mkdir(path.dirname(LOG_FILE), { recursive: true });

        const datetime = new Date().toISOString();
        const url = req.originalUrl || "N/A";
        const method = req.method || "SYSTEM";
        const status = res?.statusCode || "N/A";
        const msgError = msg.ReferenceError || msg.message || msg;
        const errorLocation = location || "N/A";

        const logMessage = `
===========================================================================================
ERROR 
===========================================================================================
\t Timestamp : ${datetime}
\t URL       : ${url}
\t Method    : ${method}
\t Status    : ${status}
\t error     : ${msgError}
\t location  : ${location}
===========================================================================================

`;

        await fs.promises.appendFile(LOG_FILE, logMessage);
    } catch (err) {
        console.error("⚠️ Gagal menulis ke log file! Error:", err);
    }
};

module.exports = { errorLogs };

// 🔥 Fungsi untuk mencatat error dari database (DB Error)
const errorDb = async (error) => {
    try {
        // Buat folder tmp kalau belum ada
        await fs.promises.mkdir(path.dirname(LOG_FILE), { recursive: true });

        const datetime = new Date().toISOString();
        const logMessage = `
===========================================================================================
                                🔥 ERROR DATABASE 🔥
===========================================================================================
📅 Date      : ${datetime}
❌ Error     :
-------------------------------------------------------------------------------------------
${error}
-------------------------------------------------------------------------------------------
===========================================================================================
                                🔥 ERROR DATABASE 🔥
===========================================================================================

`;

        await fs.promises.appendFile(LOG_FILE, logMessage);
        console.log(`✅ Log berhasil ditulis ke ${LOG_FILE}`);
    } catch (err) {
        console.error("⚠️ Gagal menulis ke log file! Error:", err);
    }
};

module.exports = { errorLogs, errorDb };
