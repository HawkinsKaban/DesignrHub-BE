const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const ItemModel = require("../../models/itemModel");
const { errorLogs } = require("../../utils/errorLogs");
const { upload } = require("../../middlewares/upload");

exports.updateItem = (req, res) => {
    upload.jsonFile(req, res, async (err) => {
        if (err) {
            return res
                .status(500)
                .json({ message: "File upload error", error: err.message });
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const {
                itemName,
                description,
                status,
                endDate,
                username,
                password,
                pin,
                typeId,
                categoryId,
                url
            } = req.body;

            let validStatus;
            if (status === undefined) {
                console.log("status undefined");
                validStatus = true;
            } else if (status == "true") {
                console.log("status true");
                validStatus = true;
            } else {
                console.log("status false");
                validStatus = false;
            }

            let dataEdit = {
                itemName,
                description,
                isActive: validStatus,
                expirationDate: endDate,
                username,
                password,
                pin,
                typeId,
                categoryId,
                url
            };

            if (req.file) {
                const filePath = path.join(__dirname, "..", req.file.path);
                const fileData = fs.readFileSync(filePath, "utf8");

                let json;
                try {
                    json = JSON.parse(fileData);
                } catch (parseError) {
                    fs.unlinkSync(filePath);
                    await session.abortTransaction();
                    session.endSession();
                    return res
                        .status(400)
                        .json({ message: "Invalid JSON file", error: parseError.message });
                }

                const { cookies } = json;
                if (!cookies) {
                    fs.unlinkSync(filePath);
                    await session.abortTransaction();
                    session.endSession();
                    return res
                        .status(400)
                        .json({ message: "Invalid JSON content: Missing cookies" });
                }
                dataEdit.cookies = cookies;
            }

            const updatedItem = await ItemModel.findByIdAndUpdate(
                req.params.id,
                dataEdit,
                { new: true, session }
            );

            if (!updatedItem) {
                await session.abortTransaction();
                session.endSession();
                return res.status(404).json({ message: "Item not found" });
            }

            await updatedItem.save({ session });

            await session.commitTransaction();
            session.endSession();

            res.status(200).json({ message: "Item updated successfully", data: updatedItem });

        } catch (error) {
            console.log(error);
            await session.abortTransaction();
            session.endSession();

            errorLogs(req, res, error, "controllers/itemControllers/updateItem.js");
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });
};
