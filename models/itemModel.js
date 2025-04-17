const mongoose = require("mongoose");

const cookieSchema = new mongoose.Schema(
    {
        domain: String,
        expirationDate: Number,
        hostOnly: Boolean,
        httpOnly: Boolean,
        name: String,
        path: String,
        sameSite: String,
        secure: Boolean,
        session: Boolean,
        storeId: String,
        value: String,
    },
    { _id: false }
);

const itemSchema = new mongoose.Schema(
    {
        itemName: {
            type: String,
            required: true,
            unique: true,
        },
        description: {
            type: String,
            required: false,
        },
        username: {
            type: String,
            required: true,
        },
        password: {
            type: String,
            required: true,
        },
        url: {
            type: String,
            required: false,
        },
        cookies: {
            type: [cookieSchema],
            required: false,
        },
        status: {
            type: Boolean,
            default: true,
        },
        pin: {
            type: String,
            required: false,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        typeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Type",
            required: true,
        },
        expirationDate: {
            type: Date,
            required: false,
        },
        isReported: {
            type: String,
            required: false,
            enum: ["logout", "limit", "other"]
        },
    },
    {
        timestamps: true,
    }
);

itemSchema.index({ itemName: "text", description: "text" });
itemSchema.index({ typeId: 1 });
itemSchema.index({ isActive: 1 });
itemSchema.index({ isReported: 1 });

const Item = mongoose.model("Item", itemSchema);

module.exports = Item;
