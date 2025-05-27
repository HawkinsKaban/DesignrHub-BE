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
        polar_checkout_id: { type: String, required: false, index: true }, // Polar checkout session ID
        polar_order_id: { type: String, required: false, index: true }, // Polar order ID when paid
        polar_subscription_id: { type: String, required: false }, // For recurring payments
        polar_product_id: { type: String, required: false }, // Polar product ID

        reference: { type: String }, // Will store Polar checkout ID or other reference
        total: { type: Number, required: true }, // Gross amount in USD
        amount: { type: Number, required: true }, // Net amount paid by customer in USD (after discounts, before fees if any)
        admin: { type: Number, default: 0 }, // Platform fees (if applicable, in USD)
        expired_time: { type: Date },
        checkout_url: { type: String },
        invoice: { type: String, default: "", unique: true, index: true },
        voucher_id: { type: mongoose.Schema.Types.ObjectId, required: false, default: null, ref: "Voucher" },

        // Additional metadata from Polar
        polar_metadata: { type: Object, default: {} },
        currency: { type: String, default: "USD" }, // Default to USD
        discount_amount: { type: Number, default: 0 }, // Total discount applied in USD
    },
    {
        timestamps: true,
    }
);

userPaymentSchema.index({ userId: 1 });
userPaymentSchema.index({ package_id: 1 });
userPaymentSchema.index({ payment_status: 1 });
userPaymentSchema.index({ payment_time: -1 });
// polar_checkout_id and polar_order_id are already indexed

const UserPayment = mongoose.model("UserPayment", userPaymentSchema);
module.exports = UserPayment;