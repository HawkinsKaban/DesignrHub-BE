const mongoose = require("mongoose");

const userPaymentSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
        userName: { type: String, require: false },
        afiliator_id: { type: mongoose.Schema.Types.ObjectId, ref: "UserAfiliator", default: null, required: false },
        package_id: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Package" },
        payment_time: { type: Date, default: Date.now },
        updatedBy: { type: String, required: false, enum: ["admin", "callback"] },
        payment_status: {
            type: String,
            default: "pending",
            enum: ["no transaction", "pending", "paid", "decline", "expired"],
        },
        method: {
            type: String,
            enum: [
                "OVO", "QRIS", "BNIVA", "BCAVA", "MANDIRIVA", "BRIVA",
                "PERMATAVA", "CIMBVA", "MYBVA", "OTHERBANKVA", "BSIVA",
                "ALFAMART", "INDOMARET", "DANA", "SHOPEEPAY"
            ],
            required: true,
        },
        reference: { type: String },
        total: { type: Number },
        amount: { type: Number },
        admin: { type: Number },
        expired_time: { type: Date },
        checkout_url: { type: String },
        payment_name: { type: String },
        invoice: { type: String, default: "" },
        voucher_id: { type: mongoose.Schema.Types.ObjectId, required: false, default: null, ref: "Voucher" },
        afiliator_id: { type: mongoose.Schema.Types.ObjectId, required: false, default: null, ref: "UserAfiliator" },
    },
    {
        timestamps: true,
    }
);

userPaymentSchema.index({ userId: 1 });
userPaymentSchema.index({ userName: 1 });
userPaymentSchema.index({ package_id: 1 });
userPaymentSchema.index({ payment_status: 1 });
userPaymentSchema.index({ method: 1 });
userPaymentSchema.index({ payment_time: -1 });
userPaymentSchema.index({ expired_time: 1 });
userPaymentSchema.index({ invoice: 1 }, { unique: true });
userPaymentSchema.index({ voucher_id: 1 });
userPaymentSchema.index({ updatedBy: 1 });

const UserPayment = mongoose.model("UserPayment", userPaymentSchema);
module.exports = UserPayment;
