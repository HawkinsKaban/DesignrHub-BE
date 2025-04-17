const nodemailer = require("nodemailer");


const sendEmail = async (to, subject, text, link = null) => {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            secure: true,
            auth: {
                user: process.env.EMAIL_USERNAME,
                pass: process.env.EMAIL_PASSWORD,
            },
        });

        transporter.verify(function (error, success) {
            if (error) {
                console.error("SMTP Error:", error);
            } else {
                console.log("SMTP Connected:", success);
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USERNAME,
            to,
            subject,
            text,
            ...(link && { html: link }),
        };

        await transporter.sendMail(mailOptions);
        console.log("Email sent successfully!");
    } catch (error) {
        console.error("Error sending email:", error);
        throw new Error("Email could not be sent");
    }
};

module.exports = { sendEmail };
