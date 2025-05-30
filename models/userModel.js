// models/userModel.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const validator = require("validator");

const activePackageSchema = new mongoose.Schema({ // Definisikan skema untuk activePackage
    packageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Package",
        required: true
    },
    activeDate: { type: Date, required: true }, // Tanggal kedaluwarsa paket ini
    priority: { type: Number, required: true },
    statusActive: { type: Boolean, default: true }, // Apakah paket ini sedang aktif digunakan
    pendingDate: { type: Number, default: 0 }, // Durasi pending dalam hari (jika ditumpuk)
    // Tambahkan field lain yang relevan untuk entri paket aktif jika ada
}, { _id: false });


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
        isPremium: { type: Boolean, default: false }, // Apakah pengguna saat ini memiliki akses premium
        emailVerified: { type: Boolean, default: false },
        premiumAccess: { type: Boolean, default: false }, // Mungkin duplikat dengan isPremium, konsolidasikan jika perlu
        premiumExpiresAt: { type: Date, default: null }, // Tanggal kedaluwarsa akses premium secara keseluruhan
        currentSessionToken: { type: String, default: null },
        
        // subscriptionPackage menunjuk ke paket utama yang memberikan status premium saat ini
        subscriptionPackage: { 
            type: mongoose.Schema.Types.ObjectId,
            ref: "Package",
            default: null
        },
        // activePackage adalah array yang menyimpan semua langganan aktif/pending pengguna
        activePackage: [activePackageSchema], 

        // Polar.sh customer ID
        polarCustomerId: { 
            type: String, 
            trim: true, 
            index: true, 
            sparse: true // Memungkinkan null/undefined tapi unik jika ada isinya
        },

        // afiliator information (tetap seperti sebelumnya)
        isAfiliator: { type: Boolean, default: false },
        afiliatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UserAfiliator", // Pastikan model UserAfiliator ada jika digunakan
            default: null
        },
        codeAfiliator: [ // Ini tampak seperti array, mungkin seharusnya String atau Object jika kode afiliasi unik per user
            {
                type: mongoose.Schema.Types.ObjectId, // Jika ini merujuk ke entitas lain
                ref: "UserAfiliator", // atau model lain yang relevan
                default: null
            }
        ],
        expireAfiliator: { type: Date, default: null }
    },
    { timestamps: true }
);

// Indexes
userSchema.index({ nomor: 1 });
userSchema.index({ status: 1 });
userSchema.index({ subscriptionPackage: 1 });
userSchema.index({ afiliatedBy: 1 });
userSchema.index({ expireAfiliator: 1 });
userSchema.index({ polarCustomerId: 1 }); // Index untuk polarCustomerId

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