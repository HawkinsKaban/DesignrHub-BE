const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        allApps: {
            type: Boolean,
            default: false
        },
    },
    { timestamps: true }
);

categorySchema.index({ name: 1 });

const Category = mongoose.model("Category", categorySchema);

module.exports = Category;
