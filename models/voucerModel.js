const mongoose = require('mongoose');

const VoucherSchema = new mongoose.Schema({
    packageId: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true }],
    name: { type: String, required: true },
    discount: { type: String, required: true }, // Store as string, parse to float for calculations. For fixed, this is USD amount.
    discountType: { type: String, required: true, enum: ['percentage', 'fixed'] },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['open', 'close'], default: 'open' },
    code: { type: String, required: true, unique: true, index: true },
    isArchived: { type: Boolean, default: false },

    // New fields for enhanced voucher logic
    usageLimit: { type: Number, default: null }, // Max number of times this voucher can be used in total. null for unlimited.
    timesUsed: { type: Number, default: 0 },     // How many times this voucher has been used.
    minimumPurchaseAmount: { type: Number, default: 0 }, // Minimum purchase amount in USD for the voucher to be applicable.

    // Polar integration fields
    polar_discount_id: { type: String, required: false, index: { unique: true, sparse: true } },
    polar_metadata: { type: Object, default: {} }
}, { timestamps: true });

VoucherSchema.index({ packageId: 1 });
// code and polar_discount_id are already indexed

const Voucher = mongoose.model('Voucher', VoucherSchema);

module.exports = Voucher;