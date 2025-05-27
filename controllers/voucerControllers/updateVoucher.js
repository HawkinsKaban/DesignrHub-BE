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
            startDate, 
            endDate, 
            name, 
            packageId, 
            discount, 
            discountType, 
            status, 
            code, 
            usageLimit, 
            minimumPurchaseAmount,
            polarDurationType, // <-- Tambahkan ini dari req.body
            polarDurationInMonths // <-- Tambahkan ini dari req.body
        } = req.body;
        console.log(`[UpdateVoucher] Attempting to update voucher ID: ${voucherId}`);

        if (packageId && !Array.isArray(packageId)) {
            packageId = [packageId];
        }

        const existingVoucher = await VoucherModel.findById(voucherId).session(session);
        if (!existingVoucher) {
            await session.abortTransaction();
            session.endSession();
            console.warn(`[UpdateVoucher] Voucher with ID ${voucherId} not found.`);
            return res.status(404).json({ message: "Voucher not found." });
        }

        const sDate = startDate ? new Date(startDate) : existingVoucher.startDate;
        const eDate = endDate ? new Date(endDate) : existingVoucher.endDate;

        if (eDate < sDate) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "End date must be greater than or equal to start date." });
        }

        if (code && code !== existingVoucher.code) {
            const existingCode = await VoucherModel.findOne({ code, _id: { $ne: voucherId } }).session(session);
            if (existingCode) {
                await session.abortTransaction();
                session.endSession();
                console.warn(`[UpdateVoucher] New voucher code ${code} already exists for another voucher.`);
                return res.status(400).json({ message: "New voucher code already used by another voucher." });
            }
            existingVoucher.code = code;
        }

        if (packageId && packageId.length > 0) {
            const validPackageIds = [];
            for (const pid of packageId) {
                 if (!mongoose.Types.ObjectId.isValid(pid)) {
                     await session.abortTransaction(); session.endSession();
                     console.warn(`[UpdateVoucher] Invalid Package ID format: ${pid}`);
                     return res.status(400).json({ message: `Invalid Package ID format: ${pid}` });
                }
                const existingPackage = await PackageModel.findById(pid).session(session);
                if (!existingPackage) {
                    await session.abortTransaction();
                    session.endSession();
                    console.warn(`[UpdateVoucher] Package with ID ${pid} not found for voucher update.`);
                    return res.status(400).json({ message: `Package with ID ${pid} not found.` });
                }
                validPackageIds.push(existingPackage._id);
            }
            existingVoucher.packageId = validPackageIds;
        } else if (packageId && packageId.length === 0) { 
            existingVoucher.packageId = [];
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
        
        // Update Polar duration fields
        if (polarDurationType !== undefined) existingVoucher.polarDurationType = polarDurationType;
        if (polarDurationType === 'repeating') {
            if (polarDurationInMonths !== undefined && parseInt(polarDurationInMonths) > 0) {
                existingVoucher.polarDurationInMonths = parseInt(polarDurationInMonths);
            } else if (existingVoucher.polarDurationType === 'repeating' && (existingVoucher.polarDurationInMonths == null || existingVoucher.polarDurationInMonths <= 0)) {
                // If it was already repeating but new months are invalid, or if changing to repeating without valid months
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ message: "For 'repeating' duration, 'polarDurationInMonths' is required and must be a positive number." });
            }
        } else {
            existingVoucher.polarDurationInMonths = undefined; // Hapus jika bukan repeating
        }


        await existingVoucher.save({ session });
        console.log(`[UpdateVoucher] Voucher ${existingVoucher.name} (ID: ${voucherId}) updated in DB.`);

        let polarDiscount = null;
        let polarAction = "none";

        if (existingVoucher.status === 'open') {
            if (existingVoucher.polar_discount_id) {
                try {
                    console.log(`[UpdateVoucher] Updating existing Polar discount ID: ${existingVoucher.polar_discount_id} for voucher ${existingVoucher.name}.`);
                    polarDiscount = await polarService.updateDiscount(existingVoucher.polar_discount_id, existingVoucher);
                    existingVoucher.polar_metadata = polarDiscount;
                    await existingVoucher.save({ session });
                    polarAction = "updated";
                    console.log(`[UpdateVoucher] ✅ Polar discount ${existingVoucher.polar_discount_id} updated.`);
                } catch (polarError) {
                    console.error(`[UpdateVoucher] ⚠️ Failed to update Polar discount ${existingVoucher.polar_discount_id}: ${polarError.message}`);
                    errorLogs(req, res, `Polar discount update failed for voucher ${existingVoucher.name}: ${polarError.message}`, "controllers/voucerControllers/updateVoucher.js (Polar Update)");
                }
            } else { 
                try {
                    console.log(`[UpdateVoucher] Creating new Polar discount for active voucher ${existingVoucher.name} as it was not synced before.`);
                    polarDiscount = await polarService.createDiscount(existingVoucher);
                    existingVoucher.polar_discount_id = polarDiscount.id;
                    existingVoucher.polar_metadata = polarDiscount;
                    await existingVoucher.save({ session });
                    polarAction = "created";
                     console.log(`[UpdateVoucher] ✅ New Polar discount created: ${polarDiscount.id} for voucher ${existingVoucher.name}.`);
                } catch (polarError) {
                    console.error(`[UpdateVoucher] ⚠️ Failed to create new Polar discount for ${existingVoucher.name}: ${polarError.message}`);
                    errorLogs(req, res, `Polar discount creation failed for voucher ${existingVoucher.name}: ${polarError.message}`, "controllers/voucerControllers/updateVoucher.js (Polar Create)");
                }
            }
        } else if (existingVoucher.status === 'close' && previousStatus === 'open' && existingVoucher.polar_discount_id) {
            try {
                console.log(`[UpdateVoucher] Archiving Polar discount ID: ${existingVoucher.polar_discount_id} as voucher ${existingVoucher.name} is now closed.`);
                await polarService.archiveDiscount(existingVoucher.polar_discount_id);
                polarAction = "archived";
                console.log(`[UpdateVoucher] ✅ Polar discount ${existingVoucher.polar_discount_id} archived.`);
            } catch (polarError) {
                console.error(`[UpdateVoucher] ⚠️ Failed to archive Polar discount ${existingVoucher.polar_discount_id}: ${polarError.message}`);
                 errorLogs(req, res, `Polar discount archive failed for voucher ${existingVoucher.name}: ${polarError.message}`, "controllers/voucerControllers/updateVoucher.js (Polar Archive)");
            }
        }


        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            message: "Voucher updated successfully!",
            data: existingVoucher,
            polar_action: polarAction,
            polar_discount_details: polarDiscount
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('[UpdateVoucher] ❌ Server error during voucher update:', error);
        errorLogs(req, res, error.message, "controllers/voucherControllers/updateVoucher.js");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};