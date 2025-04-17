const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const adminSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true
        },
        password: {
            type: String,
            required: true,
            minlength: 6
        },
        currentSessionToken: {
            type: String
        },
        role: {
            type: String,
            enum: ["admin", "superadmin"],
            default: "admin"
        }
    },
    { timestamps: true }
);

adminSchema.pre("save", async function (next) {
    if (!this.isModified("password")) {
        return next();
    }
    console.log("Plain Password:", this.password);
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    console.log("Hashed Password:", this.password);
    next();
});

adminSchema.methods.isPasswordMatch = async function (enteredPassword) {
    const isMatch = await bcrypt.compare(enteredPassword, this.password);
    console.log("Entered Password:", enteredPassword);
    console.log("Stored Hashed Password:", this.password);
    console.log("Password Comparison Result:", isMatch);
    return isMatch;
};

const Admin = mongoose.model("Admin", adminSchema);

module.exports = Admin;
