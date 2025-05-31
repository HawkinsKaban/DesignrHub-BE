// controllers/voucerControllers/createVoucer.js
const mongoose = require("mongoose");
const VoucherModel = require("../../models/voucerModel");
const PackageModel = require("../../models/packageModel");
const polarService = require("../../services/polarService");
const { errorLogs } = require("../../utils/errorLogs");

exports.createVoucher = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let { 
            startDate, endDate, name, packageId, 
            discount, discountType, status, code, 
            usageLimit, minimumPurchaseAmount,
            polarDurationType, polarDurationInMonths
        } = req.body;
        console.log(`[CreateVoucherCtrl] Attempting to create voucher: ${name} (Code: ${code})`);

        if (!name || !code || !discount || !discountType || !endDate) {
            await session.abortTransaction(); session.endSession();
            return res.status(400).json({ message: "Name, code, discount, discountType, and endDate are required." });
        }
        
        if (packageId && !Array.isArray(packageId)) {
            packageId = [packageId];
        } else if (!packageId) {
            packageId = []; 
        }

        if (new Date(endDate) < new Date(startDate || Date.now())) {
            await session.abortTransaction(); session.endSession();
            return res.status(400).json({ message: "End date must be greater than or equal to start date." });
        }

        const existingVoucherByCode = await VoucherModel.findOne({ code: code.toUpperCase() }).session(session);
        if (existingVoucherByCode) {
            await session.abortTransaction(); session.endSession();
            console.warn(`[CreateVoucherCtrl] Voucher code ${code} already exists.`);
            return res.status(400).json({ message: "Voucher code already used." });
        }

        const validPackageObjectIds = [];
        if (packageId.length > 0) {
            for (const pid of packageId) {
                if (!mongoose.Types.ObjectId.isValid(pid)) {
                     await session.abortTransaction(); session.endSession();
                     console.warn(`[CreateVoucherCtrl] Invalid Package ID format: ${pid}`);
                     return res.status(400).json({ message: `Invalid Package ID format: ${pid}` });
                }
                const existingPackage = await PackageModel.findById(pid).session(session);
                if (!existingPackage || !existingPackage.polar_product_id) { // Pastikan paket sudah disinkronkan juga
                    await session.abortTransaction(); session.endSession();
                    const msg = !existingPackage 
                        ? `Package with ID ${pid} not found.` 
                        : `Package with ID ${pid} (${existingPackage.packageName}) is not yet synced with Polar.sh and cannot be used in a Polar-synced voucher.`;
                    console.warn(`[CreateVoucherCtrl] ${msg}`);
                    return res.status(400).json({ message: msg });
                }
                validPackageObjectIds.push(existingPackage._id);
            }
        }

        const parsedDiscount = parseFloat(discount);
        if(isNaN(parsedDiscount) || parsedDiscount <= 0) {
            await session.abortTransaction(); session.endSession();
            return res.status(400).json({ message: "Discount value must be a positive number." });
        }
        if(discountType === 'percentage' && (parsedDiscount > 100)) {
             await session.abortTransaction(); session.endSession();
            return res.status(400).json({ message: "Percentage discount cannot exceed 100." });
        }
        if(discountType === 'fixed' && parsedDiscount <=0) {
             await session.abortTransaction(); session.endSession();
            return res.status(400).json({ message: "Fixed discount amount must be positive." });
        }

        const newVoucherData = {
            startDate: startDate ? new Date(startDate) : new Date(),
            endDate: new Date(endDate),
            name,
            packageId: validPackageObjectIds, // Ini ID paket lokal
            discount: parsedDiscount.toString(), 
            discountType,
            status: status || 'open',
            code: code.toUpperCase(),
            usageLimit: usageLimit != null ? parseInt(usageLimit) : null,
            minimumPurchaseAmount: minimumPurchaseAmount != null ? parseFloat(minimumPurchaseAmount) : 0,
            timesUsed: 0,
            isArchived: false, // Default saat pembuatan
            polarDurationType: polarDurationType || 'once',
            polarDurationInMonths: (polarDurationType === 'repeating' && polarDurationInMonths) ? parseInt(polarDurationInMonths) : undefined,
            polar_discount_id: null,
            polar_metadata: {}
        };
         if (newVoucherData.polarDurationType === 'repeating' && (!newVoucherData.polarDurationInMonths || newVoucherData.polarDurationInMonths <= 0)) {
            await session.abortTransaction(); session.endSession();
            return res.status(400).json({ message: "For 'repeating' duration, 'polarDurationInMonths' is required and must be a positive integer." });
        }

        const newVoucher = new VoucherModel(newVoucherData);
        await newVoucher.save({ session });
        console.log(`[CreateVoucherCtrl] Voucher ${newVoucher.name} saved to DB (ID: ${newVoucher._id}) temporarily.`);

        let polarDiscount = null;
        let polarSyncError = null;
        
        if (newVoucher.status === 'open' && !newVoucher.isArchived) {
            try {
                console.log(`[CreateVoucherCtrl] Syncing voucher ${newVoucher.name} with Polar.`);
                // Tambahkan polar_product_ids ke data yang dikirim ke polarService jika diperlukan
                // Fungsi mapVoucherToPolarDiscountPayload akan menangani ini.
                polarDiscount = await polarService.createDiscount(newVoucher);
                newVoucher.polar_discount_id = polarDiscount.id;
                newVoucher.polar_metadata = polarDiscount;
                await newVoucher.save({ session });
                console.log(`[CreateVoucherCtrl] ✅ Voucher ${newVoucher.name} synced with Polar: ${polarDiscount.id}`);
            } catch (error) {
                polarSyncError = error.message;
                console.error(`[CreateVoucherCtrl] ⚠️ Failed to sync voucher ${newVoucher.name} with Polar: ${polarSyncError}. Aborting transaction.`);
                errorLogs(req, null, `Polar sync failed for new voucher ${newVoucher.name}: ${polarSyncError}`, "controllers/voucerControllers/createVoucer.js (Polar Sync)");
                
                await session.abortTransaction(); // BATALKAN TRANSAKSI UTAMA
                session.endSession();
                return res.status(500).json({
                    message: "Voucher creation failed due to an issue with payment gateway synchronization.",
                    error: `Polar service: ${polarSyncError}`
                });
            }
        } else {
             console.log(`[CreateVoucherCtrl] Voucher ${newVoucher.name} is not 'open' or is archived, skipping Polar sync.`);
        }

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: "Voucher created successfully!" + (polarDiscount ? " Synced with Polar." : (polarSyncError ? ` Polar sync failed: ${polarSyncError}` : " Not synced (status not 'open' or archived).")),
            voucher: newVoucher,
            polar_synced: !!polarDiscount && !polarSyncError,
            polar_discount_id: polarDiscount ? polarDiscount.id : null
        });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        console.error('[CreateVoucherCtrl] ❌ Server error during voucher creation:', error);
        errorLogs(req, res, error.message, "controllers/voucerControllers/createVoucer.js");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};