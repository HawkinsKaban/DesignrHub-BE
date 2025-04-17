const mongoose = require("mongoose");

const typeDownloadSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        status: {
            type: Boolean,
            required: true,
            default: true,
        },
        categoryType: {
            type: String,
            required: true,
            default: "all",
        },

    },
    {
        timestamps: true,
    }
);

typeDownloadSchema.index({ name: 1 });

const Type = mongoose.model("Type", typeDownloadSchema);

module.exports = Type;
