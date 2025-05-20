const mongoose = require("mongoose");
const PackageModel = require("../../models/packageModel")
const categorModel = require("../../models/categoryModel")
const polarService = require("../../services/polarService");
const { errorLogs } = require("../../utils/errorLogs");

exports.createPackage = async (req, res) => {
    const { packageName, price, discountPrice, durationName, durationInDays, categoryId, onDiscount, endDiscountDate, isActive, priority } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        if (!packageName || !price || !durationName || !durationInDays) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Semua field harus di isi" });
        }
        
        const existingPackage = await PackageModel.findOne({ packageName }).session(session);
        if (existingPackage) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: `package dengan packageName ${packageName} sudah ada` });
        }

        let packageData = {
            packageName,
            price,
            discountPrice,
            durationName,
            durationInDays,
            onDiscount,
            endDiscountDate,
            isActive,
            priority
        };

        // Add categoryId if it exists
        if (categoryId) {
            const existingCategory = await categorModel.findById(categoryId).session(session);
            if (existingCategory) {
                packageData.categoryId = existingCategory._id;
            }
        }

        const newPackage = new PackageModel(packageData);
        await newPackage.save({ session });

        // Try to create product in Polar if package is active
        let polarProduct = null;
        if (isActive !== false) { // Default to true if not specified
            try {
                polarProduct = await polarService.createProduct(newPackage);
                newPackage.polar_product_id = polarProduct.id;
                newPackage.polar_metadata = polarProduct;
                await newPackage.save({ session });
                console.log(`✅ Package synced with Polar: ${packageName}`);
            } catch (polarError) {
                console.error(`⚠️ Failed to sync package with Polar: ${polarError.message}`);
                // Don't fail the package creation if Polar sync fails
                // The package can be synced later using the sync endpoint
            }
        }

        await session.commitTransaction();
        res.status(201).json({
            message: "Package berhasil dibuat!",
            package: newPackage,
            polar_synced: !!polarProduct,
            polar_product: polarProduct
        });

    } catch (error) {
        await session.abortTransaction();
        console.log(error)
        errorLogs(req, res, error.message, "controllers/packageControllers/createPackage.js");
        res.status(500).json({ message: "Server error", error: error.message });
    } finally {
        session.endSession();
    }
}