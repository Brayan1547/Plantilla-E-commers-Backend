import { Schema, model } from "mongoose";

const CategorySchema = new Schema({
    name: {
        type: String,
        required: [true, 'El nombre de la categoría es obligatorio'],
        unique: true,
        trim: true,
        minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
        maxlength: [50, 'El nombre no puede exceder los 50 caracteres']
    },
    slug: {
        type: String,
        required: [true, 'El slug es obligatorio'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^[a-z0-9-]+$/, 'El slug solo puede contener letras minúsculas, números y guiones medios']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [250, 'La descripción no puede exceder los 250 caracteres']
    },
    isActive: {
        type: Boolean,
        default: true
    },
        // Imagen de portada (home). Se gestiona SOLO por POST/DELETE /category/:id/image,
    // por eso NO está en CATEGORY_UPDATABLE_FIELDS (el cliente no puede escribir URLs a mano).
    image: {
        url: { type: String, trim: true },
        publicId: { type: String, trim: true }
    },
    // Propiedad agregada para rastrear qué usuario creó la categoría
    // createdBy: {
    //     type: Schema.Types.ObjectId,
    //     ref: 'user', // Hace referencia a tu modelo 'user.model.js'
    //     required: [true, 'El creador de la categoría es obligatorio']
    // }
}, {
    versionKey: false,
    timestamps: true
});

const CategoryModel = model(
    'category',         
    CategorySchema     
);

export default CategoryModel;