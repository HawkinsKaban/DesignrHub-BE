// controllers/packageControllers/createPackage.js
const mongoose = require("mongoose");
const PackageModel = require("../../models/packageModel");
const CategoryModel = require("../../models/categoryModel");
const polarService = require("../../services/polarService");
const { errorLogs } = require("../../utils/errorLogs");

exports.createPackage = async (req, res) => {
    const { packageName, price, discountPrice, durationName, durationInDays, categoryId, onDiscount, endDiscountDate, isActive, priority } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        console.log(`[CreatePackageCtrl] Attempting to create package: ${packageName}`);
        if (!packageName || price == null || !durationName || durationInDays == null) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Package name, price, duration name, and duration in days are required." });
        }
        
        const existingPackage = await PackageModel.findOne({ packageName }).session(session);
        if (existingPackage) {
            await session.abortTransaction();
            session.endSession();
            console.warn(`[CreatePackageCtrl] Package with name ${packageName} already exists.`);
            return res.status(400).json({ message: `Package with name ${packageName} already exists.` });
        }

        const parsedPrice = parseFloat(price);
        if (isNaN(parsedPrice) || parsedPrice < 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Price must be a valid non-negative number." });
        }
        let parsedDiscountPrice = null;
        if (discountPrice != null) {
            parsedDiscountPrice = parseFloat(discountPrice);
            if (isNaN(parsedDiscountPrice) || parsedDiscountPrice < 0) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ message: "Discount price must be a valid non-negative number if provided." });
            }
            if (parsedDiscountPrice > parsedPrice) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ message: "Discount price cannot be greater than the original price." });
            }
        }

        let packageData = {
            packageName,
            price: parsedPrice,
            discountPrice: parsedDiscountPrice,
            durationName,
            durationInDays: parseInt(durationInDays),
            onDiscount: onDiscount || false,
            endDiscountDate: endDiscountDate ? new Date(endDiscountDate) : null,
            isActive: isActive !== undefined ? isActive : true,
            priority: priority != null ? parseInt(priority) : 0,
            polar_product_id: null, // Inisialisasi
            polar_metadata: {}
        };

        if (categoryId) {
            if (!mongoose.Types.ObjectId.isValid(categoryId)) {
                await session.abortTransaction(); session.endSession();
                return res.status(400).json({ message: "Invalid Category ID format." });
            }
            const existingCategory = await CategoryModel.findById(categoryId).session(session);
            if (existingCategory) {
                packageData.categoryId = existingCategory._id;
            } else {
                console.warn(`[CreatePackageCtrl] Category ID ${categoryId} not found. Package will be created without a category.`);
            }
        }

        const newPackage = new PackageModel(packageData);
        await newPackage.save({ session });
        console.log(`[CreatePackageCtrl] Package ${newPackage.packageName} saved to DB (ID: ${newPackage._id}) temporarily.`);

        let polarProduct = null;
        let polarSyncError = null;

        if (newPackage.isActive) {
            try {
                console.log(`[CreatePackageCtrl] Syncing active package ${newPackage.packageName} with Polar.`);
                polarProduct = await polarService.createProduct(newPackage); // Ini harusnya melempar error jika gagal
                newPackage.polar_product_id = polarProduct.id;
                newPackage.polar_metadata = polarProduct; 
                await newPackage.save({ session }); // Simpan lagi dengan ID Polar
                console.log(`[CreatePackageCtrl] ✅ Package ${newPackage.packageName} synced with Polar: ${polarProduct.id}`);
            } catch (error) {
                polarSyncError = error.message; 
                console.error(`[CreatePackageCtrl] ⚠️ Failed to sync package ${newPackage.packageName} with Polar: ${polarSyncError}. Aborting transaction.`);
                errorLogs(req, null, `Polar sync failed for new package ${newPackage.packageName}: ${polarSyncError}`, "controllers/packageControllers/createPackage.js (Polar Sync)");
                
                await session.abortTransaction(); // BATALKAN TRANSAKSI UTAMA
                session.endSession();
                return res.status(500).json({
                    message: "Package creation failed due to an issue with payment gateway synchronization.",
                    error: `Polar service: ${polarSyncError}`
                });
            }
        } else {
            console.log(`[CreatePackageCtrl] Package ${newPackage.packageName} is inactive, skipping Polar sync.`);
        }

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: "Package created successfully!" + (polarProduct ? " Synced with Polar." : " Not synced with Polar (inactive)."),
            package: newPackage,
            polar_synced: !!polarProduct,
            polar_product_id: polarProduct ? polarProduct.id : null
        });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        console.error('[CreatePackageCtrl] ❌ Server error during package creation:', error);
        errorLogs(req, res, error.message, "controllers/packageControllers/createPackage.js");
        res.status(500).json({ message: "Server error", error: error.message });
    }
}