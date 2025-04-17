const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const cors = require("cors");
const path = require("path");


const connectDB = require("./configs/db");

const app = express();

// Connect to database
connectDB();

// Middleware to log requests
app.use(morgan("dev"));

// Middleware to compress responses
app.use(compression());

// Security middlewares
app.use(helmet());
app.use(mongoSanitize());
app.use(xss());

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 100,
    max: 1000000,
});
app.use("/be/api/", apiLimiter);


app.use(
    cors({
        origin: true,
        credentials: true,
    })
);

app.use(express.json());
app.use(cookieParser());



// Routes
app.use("/be/api/user", require("./routers/userRouters"));
// http://localhost:3876/be/api/user

app.use("/be/api/auth", require("./routers/authRouter"));
// http://localhost:3876/be/api/auth/login

app.use("/be/api/payments", require("./routers/paymentRouter"));
// http://localhost:3876/be/api/payments

app.use("/be/api/packages", require("./routers/packageRouter"));
// http://localhost:3876/be/api/packages

app.use("/be/api/vouchers", require("./routers/voucerRouter"));
// http://localhost:3876/be/api/vouchers

app.use("/be/api/category", require("./routers/categoryRouter"));
// http://localhost:3876/be/api/category

app.use("/be/api/admin", require("./routers/adminRouters"));
// http://localhost:3876/be/api/admin

app.use("/be/api/item", require("./routers/itemRouters"));
// http://localhost:3876/be/api/item

app.use("/be/api/type", require("./routers/typeRouters"));
// http://localhost:3876/be/api/type

app.use("/be/api/log", require("./routers/logRouters"));
// http://localhost:3876/be/api/log




// Error handler





module.exports = app;
