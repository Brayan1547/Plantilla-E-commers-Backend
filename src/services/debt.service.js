import DebtModel from "../models/debt.model.js";
import { statusFor, serializeDebt, buildSummary, DEBT_STATUS } from "../helpers/debt.helper.js";

// Error de dominio con `code` propio; `sendWriteError` lo traduce a HTTP.
const domainError = (code, message) => {
    const error = new Error(message);
    error.code = code;
    return error;
};

const dbListDebts = async () => {
    const debts = await DebtModel.find().sort({ createdAt: -1 }).lean();
    return debts.map((d) => serializeDebt(d));
};

const dbGetDebtById = async (id) => {
    const debt = await DebtModel.findById(id).lean();
    return debt ? serializeDebt(debt) : null;
};

const dbGetDebtSummary = async () => {
    const pending = await DebtModel.find({ status: { $ne: DEBT_STATUS.PAGADA } })
        .select('direction amount paidAmount status dueDate')
        .lean();
    return buildSummary(pending);
};

const dbCreateDebt = async (data) => {
    const debt = await DebtModel.create({
        ...data,
        paidAmount: 0,
        payments: [],
        status: DEBT_STATUS.PENDIENTE
    });
    return serializeDebt(debt);
};

const dbUpdateDebt = async (id, changes) => {
    const debt = await DebtModel.findById(id);
    if (!debt) return null;

    if (changes.amount !== undefined && changes.amount < debt.paidAmount) {
        throw domainError('DEBT_AMOUNT_BELOW_PAID',
            'El monto no puede ser menor que lo ya abonado');
    }

    debt.set(changes);
    debt.status = statusFor(debt.amount, debt.paidAmount);
    await debt.save();
    return serializeDebt(debt);
};

// Registra un abono. Compara `paidAmount` en el filtro: si otra petición cambió
// la deuda mientras tanto, no actualiza nada y responde 409 en vez de pisar datos.
const dbAddPayment = async (id, { amount, paidAt, note }) => {
    const debt = await DebtModel.findById(id);
    if (!debt) return null;

    const balance = debt.amount - debt.paidAmount;
    if (balance <= 0) {
        throw domainError('DEBT_ALREADY_PAID', 'Esta deuda ya está pagada');
    }
    if (amount > balance) {
        throw domainError('PAYMENT_EXCEEDS_BALANCE',
            `El abono no puede ser mayor al saldo (${balance})`);
    }

    const newPaid = debt.paidAmount + amount;
    const payment = { amount };
    if (paidAt) payment.paidAt = paidAt;
    if (note) payment.note = note;

    const updated = await DebtModel.findOneAndUpdate(
        { _id: id, paidAmount: debt.paidAmount },
        {
            $push: { payments: payment },
            $set: { paidAmount: newPaid, status: statusFor(debt.amount, newPaid) }
        },
        { new: true, runValidators: true }
    );
    if (!updated) {
        throw domainError('DEBT_CONFLICT', 'La deuda cambió mientras la editabas. Recarga e inténtalo de nuevo');
    }
    return serializeDebt(updated);
};

// Borra un abono (por si se registró mal) y recalcula saldo y estado.
const dbRemovePayment = async (id, paymentId) => {
    const debt = await DebtModel.findById(id);
    if (!debt) return null;

    const payment = debt.payments.id(paymentId);
    if (!payment) {
        throw domainError('PAYMENT_NOT_FOUND', 'El abono no existe');
    }

    const newPaid = debt.paidAmount - payment.amount;
    const updated = await DebtModel.findOneAndUpdate(
        { _id: id, paidAmount: debt.paidAmount },
        {
            $pull: { payments: { _id: paymentId } },
            $set: { paidAmount: newPaid, status: statusFor(debt.amount, newPaid) }
        },
        { new: true }
    );
    if (!updated) {
        throw domainError('DEBT_CONFLICT', 'La deuda cambió mientras la editabas. Recarga e inténtalo de nuevo');
    }
    return serializeDebt(updated);
};

const dbDeleteDebt = async (id) => {
    const debt = await DebtModel.findByIdAndDelete(id).lean();
    return debt ? serializeDebt(debt) : null;
};

export {
    dbListDebts,
    dbGetDebtById,
    dbGetDebtSummary,
    dbCreateDebt,
    dbUpdateDebt,
    dbAddPayment,
    dbRemovePayment,
    dbDeleteDebt
};