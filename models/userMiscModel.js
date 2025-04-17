const mongoose = require("mongoose");

const userMiscSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        note: {
            type: String,
            required: true,
            trim: true
        },
        type: {
            type: String,
            enum: ["warning", "info", "banned", "other", "inactive"],
            default: "info"
        },
        isSolved: {
            type: Boolean,
            default: false
        },
        resolveTime: {
            type: Date,
            default: null
        },
        warned: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

userMiscSchema.index({ userId: 1 });

const usermisc = mongoose.model("UserMisc", userMiscSchema);

module.exports = usermisc;
