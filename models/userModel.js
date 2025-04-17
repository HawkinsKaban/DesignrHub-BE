const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const validator = require("validator");

const userSchema = new mongoose.Schema(
    {
        username: { type: String, required: true, unique: true, trim: true },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            validate: {
                validator: validator.isEmail,
                message: "Invalid email format"
            }
        },
        password: { type: String, required: true, minlength: 6 },
        role: { type: String, enum: ["user"], default: "user" },
        status: {
            type: String,
            enum: ["active", "inactive", "suspended", "banned"],
            default: "active"
        },
        nomor: { type: String, default: null },
        reason: { type: String, default: null },

        // subscription information
        isPremium: { type: Boolean, default: false },
        emailVerified: { type: Boolean, default: false },
        premiumAccess: { type: Boolean, default: false },
        premiumExpiresAt: { type: Date, default: null },
        currentSessionToken: { type: String, default: null },
        subscriptionPackage: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Package",
            default: null
        },

        // afiliator information
        isAfiliator: { type: Boolean, default: false },
        afiliatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UserAfiliator",
            default: null
        },
        codeAfiliator: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "UserAfiliator",
                default: null
            }
        ],
        expireAfiliator: { type: Date, default: null }
    },
    { timestamps: true }
);

userSchema.index({ nomor: 1 });
userSchema.index({ status: 1 });
userSchema.index({ subscriptionPackage: 1 });
userSchema.index({ afiliatedBy: 1 });
userSchema.index({ expireAfiliator: 1 });

// 🔥 Index untuk Pencarian Text di Username & Email
userSchema.index({ username: "text", email: "text" });

// 🔥 Partial Index buat Premium User (Opsional)
userSchema.index({ premiumAccess: 1 }, { partialFilterExpression: { premiumAccess: true } });

// Encrypt password before saving
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Method to match passwords
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Clear session token after use
userSchema.methods.clearSessionToken = async function () {
    this.currentSessionToken = null;
    await this.save();
};

const User = mongoose.model("User", userSchema);
module.exports = User;
