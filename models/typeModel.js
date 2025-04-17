const mongoose = require("mongoose");

const typeSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        logo: {
            type: String,
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        status: {
            type: String,
            required: true,
            default: "all",//['all', 'dev', 'ov']
        },
        basePrice: {
            type: Number,
            required: true,
        },
        targetType: {
            type: String,
            required: true
        },
        url: {
            type: String,
            required: true,
        },
        category: {
            type: String,
            required: true,
            default: "all",
        },
        vidio: {
            type: String,
            required: false,
            default: "",
        },
        note: {
            type: String,
            required: false,
        },
        categoryId: [{ // Array of Category ID
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            required: false,
        }],
    },
    {
        timestamps: true,
    }
);

typeSchema.index({ name: "text" });
typeSchema.index({ status: "text" });
typeSchema.index({ targetType: "text" });
typeSchema.index({ category: "text" });
typeSchema.index({ categoryId: 1 });

const Type = mongoose.model("Type", typeSchema);

module.exports = Type;
