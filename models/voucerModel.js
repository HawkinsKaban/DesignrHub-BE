const mongoose = require('mongoose');

const VoucherSchema = new mongoose.Schema({
    // userId: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    packageId: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true }],
    name: { type: String, required: true },
    discount: { type: String, required: true },
    discountType: { type: String, required: true },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['open', 'close'], default: 'open' },
    code: { type: String, required: true },
    isArchived: { type: Boolean, default: false }
}, { timestamps: true });

VoucherSchema.index({ packageId: 1 });

const Voucher = mongoose.model('Voucher', VoucherSchema);

module.exports = Voucher;
