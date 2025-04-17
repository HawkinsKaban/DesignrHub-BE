const mongoose = require('mongoose');
require('dotenv').config();
const { errorDb } = require("../utils/errorLogs");

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB Connected...");
    } catch (error) {
        errorDb(error);
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
