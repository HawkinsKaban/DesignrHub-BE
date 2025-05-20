const mongoose = require("mongoose");

const packageSchema = new mongoose.Schema(
    {
        packageName: {
            type: String,
            required: true,
        },
        price: {
            type: Number,
            required: true,
        },
        discountPrice: {
            type: Number,
        },
        durationName: {
            type: String,
            required: true, // Nama durasi, misalnya '1 bulan', '3 bulan', '6 bulan'
        },
        durationInDays: {
            type: Number,
            required: true, // Durasi dalam hari, misalnya 30 untuk 1 bulan, 90 untuk 3 bulan, 180 untuk 6 bulan
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            required: false,
        },
        onDiscount: {
            type: Boolean,
            default: false
        },
        endDiscountDate: {
            type: Date,
            required: false
        },
        isActive: { //  hanya berpengaruh terhadap package yang di tampilkan di dashboard dan table package pada admin
            type: Boolean,
            default: true,
        },
        priority: {
            type: Number,
            required: true,
            default: 0, // makin besar makin tinggi prioritasnya
        },
        // Polar.sh integration fields
        polar_product_id: {
            type: String,
            required: false,
            unique: true,
            sparse: true // Allows multiple null values but unique non-null values
        },
        polar_metadata: {
            type: Object,
            default: {}
        }
    },
    {
        timestamps: true,
    }
);

packageSchema.index({ packageName: 1 });
packageSchema.index({ categoryId: 1 });
packageSchema.index({ polar_product_id: 1 });

const Package = mongoose.model("Package", packageSchema);

module.exports = Package;