const mongoose = require("mongoose");
const VoucherModel = require("../../models/voucerModel");
const PackageModel = require("../../models/packageModel")
const moment = require("moment-timezone"); // Tidak digunakan jika sudah pakai new Date()
const polarService = require("../../services/polarService");
const { errorLogs } = require("../../utils/errorLogs");

exports.createVoucher = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Ambil packageId sebagai array jika dikirim sebagai string tunggal
        let { startDate, endDate, name, packageId, discount, discountType, status, code, usageLimit, minimumPurchaseAmount } = req.body;
        console.log(`[CreateVoucher] Attempting to create voucher: ${name} (Code: ${code})`);

        if (packageId && !Array.isArray(packageId)) {
            packageId = [packageId];
        }


        if (new Date(endDate) < new Date(startDate)) { // Menggunakan new Date() untuk perbandingan
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "End date must be greater than or equal to start date." });
        }

        const existingVoucherByCode = await VoucherModel.findOne({ code }).session(session);
        if (existingVoucherByCode) {
            await session.abortTransaction();
            session.endSession();
            console.warn(`[CreateVoucher] Voucher code ${code} already exists.`);
            return res.status(400).json({ message: "Voucher code already used." });
        }

        // Validate packageId(s)
        if (packageId && packageId.length > 0) {
            const validPackageIds = [];
            for (const pid of packageId) {
                if (!mongoose.Types.ObjectId.isValid(pid)) {
                     await session.abortTransaction(); session.endSession();
                     console.warn(`[CreateVoucher] Invalid Package ID format: ${pid}`);
                     return res.status(400).json({ message: `Invalid Package ID format: ${pid}` });
                }
                const existingPackage = await PackageModel.findById(pid).session(session);
                if (!existingPackage) {
                    await session.abortTransaction();
                    session.endSession();
                    console.warn(`[CreateVoucher] Package with ID ${pid} not found.`);
                    return res.status(400).json({ message: `Package with ID ${pid} not found.` });
                }
                validPackageIds.push(existingPackage._id);
            }
            packageId = validPackageIds; // Gunakan ObjectId yang valid
        } else {
            packageId = []; // Jika tidak ada packageId, set ke array kosong (berlaku untuk semua)
        }

        // Validasi discount value
        const parsedDiscount = parseFloat(discount);
        if(isNaN(parsedDiscount) || parsedDiscount < 0) {
            await session.abortTransaction(); session.endSession();
            return res.status(400).json({ message: "Discount value must be a non-negative number." });
        }
        if(discountType === 'percentage' && (parsedDiscount > 100)) {
             await session.abortTransaction(); session.endSession();
            return res.status(400).json({ message: "Percentage discount cannot exceed 100." });
        }


        const newVoucherData = {
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            name,
            packageId, // Ini sekarang array ObjectId
            discount: parsedDiscount.toString(), // Simpan sebagai string untuk konsistensi, parse saat digunakan
            discountType,
            status: status || 'open',
            code,
            usageLimit: usageLimit != null ? parseInt(usageLimit) : null,
            minimumPurchaseAmount: minimumPurchaseAmount != null ? parseFloat(minimumPurchaseAmount) : 0, // Simpan dalam USD
            timesUsed: 0,
            isArchived: false
        };

        const newVoucher = new VoucherModel(newVoucherData);
        await newVoucher.save({ session });
        console.log(`[CreateVoucher] Voucher ${newVoucher.name} saved to DB (ID: ${newVoucher._id})`);


        let polarDiscount = null;
        if (newVoucher.status !== 'close') { // Hanya sinkronisasi jika voucher tidak 'close'
            try {
                console.log(`[CreateVoucher] Syncing voucher ${newVoucher.name} with Polar.`);
                polarDiscount = await polarService.createDiscount(newVoucher);
                newVoucher.polar_discount_id = polarDiscount.id;
                newVoucher.polar_metadata = polarDiscount;
                await newVoucher.save({ session });
                console.log(`[CreateVoucher] ✅ Voucher ${newVoucher.name} synced with Polar: ${polarDiscount.id}`);
            } catch (polarError) {
                console.error(`[CreateVoucher] ⚠️ Failed to sync voucher ${newVoucher.name} with Polar: ${polarError.message}`);
                errorLogs(req, res, `Polar sync failed for new voucher ${newVoucher.name}: ${polarError.message}`, "controllers/voucerControllers/createVoucer.js (Polar Sync)");
            }
        } else {
             console.log(`[CreateVoucher] Voucher ${newVoucher.name} has status 'close', skipping Polar sync.`);
        }

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: "Voucher created successfully!",
            voucher: newVoucher, // Mengembalikan data voucher yang baru dibuat
            polar_synced: !!polarDiscount,
            polar_discount_details: polarDiscount
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('[CreateVoucher] ❌ Server error during voucher creation:', error);
        errorLogs(req, res, error.message, "controllers/voucherControllers/createVoucer.js");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};