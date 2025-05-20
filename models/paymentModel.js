const mongoose = require("mongoose");

const userPaymentSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
        userName: { type: String, require: false },
        afiliator_id: { type: mongoose.Schema.Types.ObjectId, ref: "UserAfiliator", default: null, required: false },
        package_id: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Package" },
        payment_time: { type: Date, default: Date.now },
        updatedBy: { type: String, required: false, enum: ["admin", "webhook"] },
        payment_status: {
            type: String,
            default: "pending",
            enum: ["no transaction", "pending", "paid", "decline", "expired", "cancelled"],
        },
        // Polar.sh specific fields
        polar_checkout_id: { type: String, required: false }, // Polar checkout session ID
        polar_order_id: { type: String, required: false }, // Polar order ID when paid
        polar_subscription_id: { type: String, required: false }, // For recurring payments
        polar_product_id: { type: String, required: false }, // Polar product ID
        
        // Keep for legacy/admin purposes
        reference: { type: String }, // Will store Polar checkout ID
        total: { type: Number, required: true },
        amount: { type: Number, required: true }, // Net amount after fees
        admin: { type: Number, default: 0 }, // Platform fees
        expired_time: { type: Date },
        checkout_url: { type: String },
        invoice: { type: String, default: "" },
        voucher_id: { type: mongoose.Schema.Types.ObjectId, required: false, default: null, ref: "Voucher" },
        
        // Additional metadata from Polar
        polar_metadata: { type: Object, default: {} },
        currency: { type: String, default: "IDR" },
        discount_amount: { type: Number, default: 0 },
    },
    {
        timestamps: true,
    }
);

userPaymentSchema.index({ userId: 1 });
userPaymentSchema.index({ userName: 1 });
userPaymentSchema.index({ package_id: 1 });
userPaymentSchema.index({ payment_status: 1 });
userPaymentSchema.index({ payment_time: -1 });
userPaymentSchema.index({ expired_time: 1 });
userPaymentSchema.index({ invoice: 1 }, { unique: true });
userPaymentSchema.index({ voucher_id: 1 });
userPaymentSchema.index({ polar_checkout_id: 1 });
userPaymentSchema.index({ polar_order_id: 1 });
userPaymentSchema.index({ updatedBy: 1 });

const UserPayment = mongoose.model("UserPayment", userPaymentSchema);
module.exports = UserPayment;