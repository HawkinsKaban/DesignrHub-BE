// models/voucerModel.js (atau models/voucherModel.js)
const mongoose = require('mongoose');

const VoucherSchema = new mongoose.Schema({
    // packageId bisa jadi array jika voucher berlaku untuk beberapa paket spesifik,
    // atau kosong jika berlaku untuk semua.
    packageId: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Package' }], 
    name: { type: String, required: true, trim: true },
    discount: { type: String, required: true }, // Simpan sebagai string (misal "10" untuk 10% atau "5" untuk $5)
    discountType: { type: String, required: true, enum: ['percentage', 'fixed'] }, // 'fixed' berarti fixed amount USD
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['open', 'close', 'archived'], default: 'open' }, // Tambahkan 'archived'
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
    isArchived: { type: Boolean, default: false }, // Redundan jika status sudah 'archived', tapi bisa dipertahankan

    usageLimit: { type: Number, default: null }, // null = unlimited
    timesUsed: { type: Number, default: 0 },
    minimumPurchaseAmount: { type: Number, default: 0 }, // Dalam USD

    // Polar integration fields
    polar_discount_id: { // ID Diskon dari Polar
        type: String, 
        required: false, 
        trim: true,
        index: { unique: true, sparse: true } 
    },
    polar_metadata: { // Detail/respons dari Polar terkait diskon ini
        type: Object, 
        default: {} 
    },
    // Untuk sinkronisasi durasi diskon Polar yang lebih kompleks
    polarDurationType: { 
        type: String, 
        enum: ['once', 'forever', 'repeating'], 
        default: 'once' 
    },
    polarDurationInMonths: { // Hanya relevan jika polarDurationType adalah 'repeating'
        type: Number, 
        min: 1 
    }
}, { timestamps: true });

VoucherSchema.index({ packageId: 1 });
VoucherSchema.index({ status: 1, endDate: 1 }); // Untuk query voucher aktif

const Voucher = mongoose.model('Voucher', VoucherSchema); // Konsistenkan nama model

module.exports = Voucher;