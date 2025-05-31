// controllers/voucerControllers/updateVoucher.js
const mongoose = require("mongoose");
const VoucherModel = require("../../models/voucerModel");
const PackageModel = require("../../models/packageModel");
const polarService = require("../../services/polarService");
const { errorLogs } = require("../../utils/errorLogs");

exports.updateVoucher = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const voucherId = req.params.id;
        let { 
            startDate, endDate, name, packageId, 
            discount, discountType, status, code, 
            usageLimit, minimumPurchaseAmount,
            polarDurationType, polarDurationInMonths
        } = req.body;
        console.log(`[UpdateVoucherCtrl] Attempting to update voucher ID: ${voucherId}`);

        if (packageId && !Array.isArray(packageId)) {
            packageId = [packageId];
        }

        const existingVoucher = await VoucherModel.findById(voucherId).session(session);
        if (!existingVoucher) {
            await session.abortTransaction(); session.endSession();
            console.warn(`[UpdateVoucherCtrl] Voucher with ID ${voucherId} not found.`);
            return res.status(404).json({ message: "Voucher not found." });
        }

        const sDate = startDate ? new Date(startDate) : existingVoucher.startDate;
        const eDate = endDate ? new Date(endDate) : existingVoucher.endDate;

        if (eDate < sDate) {
            await session.abortTransaction(); session.endSession();
            return res.status(400).json({ message: "End date must be greater than or equal to start date." });
        }

        if (code && code.toUpperCase() !== existingVoucher.code) {
            const existingCode = await VoucherModel.findOne({ code: code.toUpperCase(), _id: { $ne: voucherId } }).session(session);
            if (existingCode) {
                await session.abortTransaction(); session.endSession();
                console.warn(`[UpdateVoucherCtrl] New voucher code ${code} already exists for another voucher.`);
                return res.status(400).json({ message: "New voucher code already used by another voucher." });
            }
            existingVoucher.code = code.toUpperCase();
        }

        if (packageId !== undefined) { // Cek apakah packageId dikirim
            if (packageId.length > 0) {
                const validPackageIds = [];
                for (const pid of packageId) {
                     if (!mongoose.Types.ObjectId.isValid(pid)) {
                         await session.abortTransaction(); session.endSession();
                         console.warn(`[UpdateVoucherCtrl] Invalid Package ID format: ${pid}`);
                         return res.status(400).json({ message: `Invalid Package ID format: ${pid}` });
                    }
                    const existingPackage = await PackageModel.findById(pid).session(session);
                    if (!existingPackage || !existingPackage.polar_product_id) {
                        await session.abortTransaction(); session.endSession();
                        const msg = !existingPackage 
                            ? `Package with ID ${pid} not found.` 
                            : `Package with ID ${pid} (${existingPackage.packageName}) is not yet synced with Polar.sh.`;
                        console.warn(`[UpdateVoucherCtrl] ${msg}`);
                        return res.status(400).json({ message: msg });
                    }
                    validPackageIds.push(existingPackage._id);
                }
                existingVoucher.packageId = validPackageIds;
            } else { // Jika packageId dikirim sebagai array kosong
                existingVoucher.packageId = [];
            }
        }

        if (name !== undefined) existingVoucher.name = name;
        if (startDate !== undefined) existingVoucher.startDate = sDate;
        if (endDate !== undefined) existingVoucher.endDate = eDate;
        
        if (discount !== undefined) {
            const parsedDiscount = parseFloat(discount);
            if(isNaN(parsedDiscount) || parsedDiscount < 0) {
                await session.abortTransaction(); session.endSession();
                return res.status(400).json({ message: "Discount value must be a non-negative number." });
            }
            if(discountType === 'percentage' && (parsedDiscount > 100)) {
                await session.abortTransaction(); session.endSession();
                return res.status(400).json({ message: "Percentage discount cannot exceed 100." });
            }
            existingVoucher.discount = parsedDiscount.toString();
        }
        if (discountType !== undefined) existingVoucher.discountType = discountType;

        const previousStatus = existingVoucher.status;
        if (status !== undefined) existingVoucher.status = status;
        if (usageLimit !== undefined) existingVoucher.usageLimit = usageLimit != null ? parseInt(usageLimit) : null;
        if (minimumPurchaseAmount !== undefined) existingVoucher.minimumPurchaseAmount = minimumPurchaseAmount != null ? parseFloat(minimumPurchaseAmount) : 0;
        
        if (polarDurationType !== undefined) existingVoucher.polarDurationType = polarDurationType;
        if (polarDurationType === 'repeating') {
            if (polarDurationInMonths !== undefined && parseInt(polarDurationInMonths) > 0) {
                existingVoucher.polarDurationInMonths = parseInt(polarDurationInMonths);
            } else if (existingVoucher.polarDurationType === 'repeating' && (existingVoucher.polarDurationInMonths == null || existingVoucher.polarDurationInMonths <= 0)) {
                await session.abortTransaction(); session.endSession();
                return res.status(400).json({ message: "For 'repeating' duration, 'polarDurationInMonths' is required and must be a positive number." });
            }
        } else {
            existingVoucher.polarDurationInMonths = undefined;
        }

        let polarDiscountResponse = null;
        let polarAction = "none";
        let polarSyncError = null;

        // Logika sinkronisasi dengan Polar
        try {
            if (existingVoucher.status === 'open') {
                if (existingVoucher.polar_discount_id) {
                    console.log(`[UpdateVoucherCtrl] Updating existing Polar discount ID: ${existingVoucher.polar_discount_id} for voucher ${existingVoucher.name}.`);
                    polarDiscountResponse = await polarService.updateDiscount(existingVoucher.polar_discount_id, existingVoucher);
                    polarAction = "updated";
                    console.log(`[UpdateVoucherCtrl] ✅ Polar discount ${existingVoucher.polar_discount_id} updated.`);
                } else { 
                    console.log(`[UpdateVoucherCtrl] Creating new Polar discount for active voucher ${existingVoucher.name} as it was not synced before.`);
                    polarDiscountResponse = await polarService.createDiscount(existingVoucher);
                    existingVoucher.polar_discount_id = polarDiscountResponse.id; // Simpan ID baru
                    polarAction = "created";
                    console.log(`[UpdateVoucherCtrl] ✅ New Polar discount created: ${polarDiscountResponse.id} for voucher ${existingVoucher.name}.`);
                }
                existingVoucher.polar_metadata = polarDiscountResponse; // Simpan metadata dari respons Polar
            } else if ((existingVoucher.status === 'close' || existingVoucher.status === 'archived') && existingVoucher.polar_discount_id) {
                // Jika status diubah menjadi 'close' atau 'archived' dan ada ID Polar, hapus/arsip di Polar
                console.log(`[UpdateVoucherCtrl] Deleting/Archiving Polar discount ID: ${existingVoucher.polar_discount_id} as voucher ${existingVoucher.name} is now ${existingVoucher.status}.`);
                await polarService.deleteDiscount(existingVoucher.polar_discount_id);
                polarAction = "deleted/archived"; // Tergantung implementasi deleteDiscount
                // Pertimbangkan untuk menghapus polar_discount_id dan polar_metadata dari DB lokal
                // existingVoucher.polar_discount_id = null;
                // existingVoucher.polar_metadata = {};
                console.log(`[UpdateVoucherCtrl] ✅ Polar discount ${existingVoucher.polar_discount_id} deleted/archived.`);
            }
        } catch (error) {
            polarSyncError = error.message;
            console.error(`[UpdateVoucherCtrl] ⚠️ Polar operation (${polarAction || 'unknown'}) failed for voucher ${existingVoucher.name}: ${polarSyncError}. Aborting transaction.`);
            errorLogs(req, null, `Polar operation failed during voucher update for ${existingVoucher.name}: ${polarSyncError}`, "controllers/voucerControllers/updateVoucher.js (Polar Ops)");
            
            await session.abortTransaction();
            session.endSession();
            return res.status(500).json({
                message: `Voucher update failed due to an issue with payment gateway synchronization (${polarAction || 'sync'} action).`,
                error: `Polar service: ${polarSyncError}`
            });
        }

        await existingVoucher.save({ session });
        console.log(`[UpdateVoucherCtrl] Voucher ${existingVoucher.name} (ID: ${voucherId}) changes committed to DB.`);

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            message: "Voucher updated successfully!",
            data: existingVoucher,
            polar_action: polarAction,
            polar_discount_details: polarDiscountResponse // Menggunakan nama variabel yang benar
        });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        console.error('[UpdateVoucherCtrl] ❌ Server error during voucher update:', error);
        errorLogs(req, res, error.message, "controllers/voucerControllers/updateVoucher.js");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};