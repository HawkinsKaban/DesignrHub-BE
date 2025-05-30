// controllers/voucerControllers/createVoucer.js
const mongoose = require("mongoose");
const VoucherModel = require("../../models/voucerModel"); // Pastikan nama model konsisten
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
            polarDurationType, polarDurationInMonths // Tambahkan ini
        } = req.body;
        console.log(`[CreateVoucherCtrl] Attempting to create voucher: ${name} (Code: ${code})`);

        if (!name || !code || !discount || !discountType || !endDate) {
            await session.abortTransaction(); session.endSession();
            return res.status(400).json({ message: "Name, code, discount, discountType, and endDate are required." });
        }
        
        if (packageId && !Array.isArray(packageId)) {
            packageId = [packageId]; // Ubah ke array jika hanya satu string ID
        } else if (!packageId) {
            packageId = []; // Jika tidak ada, set ke array kosong (berlaku untuk semua paket)
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
                if (!existingPackage) {
                    await session.abortTransaction(); session.endSession();
                    console.warn(`[CreateVoucherCtrl] Package with ID ${pid} not found.`);
                    return res.status(400).json({ message: `Package with ID ${pid} not found.` });
                }
                validPackageObjectIds.push(existingPackage._id);
            }
        }

        const parsedDiscount = parseFloat(discount);
        if(isNaN(parsedDiscount) || parsedDiscount <= 0) { // Diskon harus lebih dari 0
            await session.abortTransaction(); session.endSession();
            return res.status(400).json({ message: "Discount value must be a positive number." });
        }
        if(discountType === 'percentage' && (parsedDiscount > 100)) {
             await session.abortTransaction(); session.endSession();
            return res.status(400).json({ message: "Percentage discount cannot exceed 100." });
        }
        if(discountType === 'fixed' && parsedDiscount <=0) { // Untuk fixed, juga harus positif
             await session.abortTransaction(); session.endSession();
            return res.status(400).json({ message: "Fixed discount amount must be positive." });
        }


        const newVoucherData = {
            startDate: startDate ? new Date(startDate) : new Date(),
            endDate: new Date(endDate),
            name,
            packageId: validPackageObjectIds,
            discount: parsedDiscount.toString(), 
            discountType,
            status: status || 'open',
            code: code.toUpperCase(), // Simpan kode dalam huruf besar
            usageLimit: usageLimit != null ? parseInt(usageLimit) : null,
            minimumPurchaseAmount: minimumPurchaseAmount != null ? parseFloat(minimumPurchaseAmount) : 0,
            timesUsed: 0,
            isArchived: false,
            polarDurationType: polarDurationType || 'once', // Default ke 'once' jika tidak disediakan
            polarDurationInMonths: (polarDurationType === 'repeating' && polarDurationInMonths) ? parseInt(polarDurationInMonths) : undefined
        };
         if (newVoucherData.polarDurationType === 'repeating' && (!newVoucherData.polarDurationInMonths || newVoucherData.polarDurationInMonths <= 0)) {
            await session.abortTransaction(); session.endSession();
            return res.status(400).json({ message: "For 'repeating' duration, 'polarDurationInMonths' is required and must be a positive integer." });
        }


        const newVoucher = new VoucherModel(newVoucherData);
        await newVoucher.save({ session });
        console.log(`[CreateVoucherCtrl] Voucher ${newVoucher.name} saved to DB (ID: ${newVoucher._id})`);

        let polarDiscount = null;
        let polarSyncError = null;
        // Hanya sinkronisasi jika voucher aktif ('open') dan tidak diarsipkan
        if (newVoucher.status === 'open' && !newVoucher.isArchived) {
            try {
                console.log(`[CreateVoucherCtrl] Syncing voucher ${newVoucher.name} with Polar.`);
                polarDiscount = await polarService.createDiscount(newVoucher);
                newVoucher.polar_discount_id = polarDiscount.id;
                newVoucher.polar_metadata = polarDiscount; // Simpan semua metadata dari Polar
                await newVoucher.save({ session });
                console.log(`[CreateVoucherCtrl] ✅ Voucher ${newVoucher.name} synced with Polar: ${polarDiscount.id}`);
            } catch (error) {
                polarSyncError = error.message;
                console.error(`[CreateVoucherCtrl] ⚠️ Failed to sync voucher ${newVoucher.name} with Polar: ${polarSyncError}`);
                errorLogs(req, null, `Polar sync failed for new voucher ${newVoucher.name}: ${polarSyncError}`, "controllers/voucerControllers/createVoucer.js (Polar Sync)");
            }
        } else {
             console.log(`[CreateVoucherCtrl] Voucher ${newVoucher.name} is not 'open' or is archived, skipping Polar sync.`);
        }

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: "Voucher created successfully!" + (polarSyncError ? ` Polar sync failed: ${polarSyncError}` : (polarDiscount ? " Synced with Polar." : " Not synced with Polar (status not 'open' or archived).")),
            voucher: newVoucher,
            polar_synced: !!polarDiscount && !polarSyncError,
            polar_discount_id: polarDiscount ? polarDiscount.id : null,
            polar_sync_error: polarSyncError
        });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        console.error('[CreateVoucherCtrl] ❌ Server error during voucher creation:', error);
        errorLogs(req, res, error.message, "controllers/voucerControllers/createVoucer.js"); // Nama file asli
        res.status(500).json({ message: "Server error", error: error.message });
    }
};