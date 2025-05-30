// models/packageModel.js
const mongoose = require("mongoose");

const packageSchema = new mongoose.Schema(
    {
        packageName: {
            type: String,
            required: true,
            trim: true,
        },
        price: { // Harga dasar dalam USD
            type: Number,
            required: true,
            min: 0
        },
        discountPrice: { // Harga diskon dalam USD (jika ada)
            type: Number,
            min: 0
        },
        durationName: { // Misal: '1 Bulan', '1 Tahun'
            type: String,
            required: true, 
        },
        durationInDays: {
            type: Number,
            required: true, 
            min: 1
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            required: false, // Bisa jadi paket tidak terikat kategori tertentu
        },
        onDiscount: { // Apakah diskon aktif saat ini (bisa juga ditentukan oleh endDiscountDate)
            type: Boolean,
            default: false
        },
        endDiscountDate: {
            type: Date,
            required: false
        },
        isActive: { // Apakah paket ini bisa dibeli/ditampilkan
            type: Boolean,
            default: true,
        },
        priority: { // Untuk menentukan urutan paket atau penanganan tumpukan langganan
            type: Number,
            required: true,
            default: 0, 
        },
        // Polar.sh integration fields
        polar_product_id: { // ID Produk dari Polar
            type: String,
            required: false,
            trim: true,
            index: { unique: true, sparse: true } // Unik jika ada, tapi boleh null
        },
        polar_metadata: { // Untuk menyimpan detail/respons dari Polar terkait produk ini
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
packageSchema.index({ isActive: 1, priority: -1 }); // Index untuk query paket aktif berdasarkan prioritas

// Pastikan index untuk polar_product_id sudah benar (sudah ada di atas)

const Package = mongoose.model("Package", packageSchema);

module.exports = Package;