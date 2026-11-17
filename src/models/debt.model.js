import { Schema, model } from "mongoose";

import { DEBT_DIRECTIONS, DEBT_STATUS, DEBT_MAX_AMOUNT } from "../helpers/debt.helper.js";

// Un abono (pago parcial o total) hecho sobre una deuda.
const PaymentSchema = new Schema({
    amount: {
        type: Number,
        required: [true, 'El valor del abono es obligatorio'],
        min: [1, 'El abono debe ser mayor que 0'],
        validate: { validator: Number.isInteger, message: 'El abono debe ser un número entero' }
    },
    paidAt: { type: Date, default: Date.now },
    note: {
        type: String,
        trim: true,
        maxlength: [200, 'La nota del abono no puede exceder los 200 caracteres']
    }
});

const DebtSchema = new Schema({
    direction: {
        type: String,
        enum: { values: Object.values(DEBT_DIRECTIONS), message: 'Tipo de deuda no válido' },
        required: [true, 'El tipo de deuda es obligatorio']
    },
    personName: {
        type: String,
        required: [true, 'El nombre de la persona es obligatorio'],
        trim: true,
        minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
        maxlength: [80, 'El nombre no puede exceder los 80 caracteres']
    },
    personPhone: {
        type: String,
        trim: true,
        maxlength: [30, 'El teléfono no puede exceder los 30 caracteres']
    },
    concept: {
        type: String,
        trim: true,
        maxlength: [250, 'El concepto no puede exceder los 250 caracteres']
    },
    // Monto total de la deuda, en pesos enteros.
    amount: {
        type: Number,
        required: [true, 'El monto es obligatorio'],
        min: [1, 'El monto debe ser mayor que 0'],
        max: [DEBT_MAX_AMOUNT, 'El monto es demasiado grande'],
        validate: { validator: Number.isInteger, message: 'El monto debe ser un número entero' }
    },
    // Suma de los abonos. Se guarda para filtrar y ordenar sin recalcular.
    paidAmount: { type: Number, default: 0, min: 0 },
    payments: { type: [PaymentSchema], default: [] },
    dueDate: { type: Date },
    status: {
        type: String,
        enum: Object.values(DEBT_STATUS),
        default: DEBT_STATUS.PENDIENTE
    },
    notes: {
        type: String,
        trim: true,
        maxlength: [500, 'Las notas no pueden exceder los 500 caracteres']
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'user' }
}, {
    versionKey: false,
    timestamps: true
});

DebtSchema.index({ direction: 1, status: 1 });

const DebtModel = model('debt', DebtSchema);

export default DebtModel;