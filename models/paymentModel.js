// models/paymentModel.js
const mongoose = require("mongoose");

const userPaymentSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
        userName: { type: String, require: false, trim: true }, // Nama pengguna saat pembayaran
        afiliator_id: { type: mongoose.Schema.Types.ObjectId, ref: "UserAfiliator", default: null, required: false },
        package_id: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Package" },
        payment_time: { type: Date, default: Date.now, index: true },
        updatedBy: { type: String, required: false, enum: ["admin", "webhook", "system"] },
        payment_status: {
            type: String,
            default: "pending",
            enum: ["pending", "paid", "failed", "decline", "expired", "cancelled", "refunded"], // Tambahkan 'failed', 'refunded'
            index: true
        },
        
        // Polar.sh specific fields
        polar_checkout_id: { type: String, required: false, trim: true, index: true }, 
        polar_order_id: { type: String, required: false, trim: true, index: true }, 
        polar_subscription_id: { type: String, required: false, trim: true, index: true }, 
        polar_customer_id: { type: String, required: false, trim: true }, // ID Customer Polar yang melakukan pembayaran
        polar_product_id: { type: String, required: false, trim: true }, // ID Produk Polar yang dibeli

        // reference: { type: String }, // Bisa jadi duplikat dengan polar_checkout_id atau polar_order_id
        total: { type: Number, required: true, min: 0 },       // Harga kotor paket (sebelum diskon) dalam USD
        amount: { type: Number, required: true, min: 0 },      // Jumlah bersih yang dibayar pelanggan (setelah diskon) dalam USD
        discount_amount: { type: Number, default: 0, min: 0 }, // Jumlah diskon yang diterapkan dalam USD
        currency: { type: String, default: "USD", required: true, enum: ["USD"] }, // Konsisten USD
        
        // admin_fee: { type: Number, default: 0 }, // Biaya admin platform (jika ada)
        expired_time: { type: Date }, // Waktu kedaluwarsa sesi checkout
        checkout_url: { type: String, trim: true }, // URL checkout dari Polar
        invoice: { type: String, default: "", unique: true, sparse: true, index: true, trim: true }, // Nomor invoice internal
        
        voucher_id: { type: mongoose.Schema.Types.ObjectId, required: false, default: null, ref: "Voucher" },
        voucher_code_applied: {type: String, required: false, trim: true}, // Kode voucher yang digunakan

        // Metadata tambahan dari Polar atau sistem internal
        polar_metadata: { type: Object, default: {} }, // Untuk menyimpan raw response dari Polar jika perlu
        internal_notes: { type: String, trim: true } // Catatan internal jika ada
    },
    {
        timestamps: true, // createdAt, updatedAt
    }
);

// Indexes (beberapa sudah inline)
userPaymentSchema.index({ userId: 1, package_id: 1 });
// payment_time sudah diindex
// polar_checkout_id, polar_order_id, polar_subscription_id, invoice sudah diindex

const UserPayment = mongoose.model("UserPayment", userPaymentSchema);
module.exports = UserPayment;