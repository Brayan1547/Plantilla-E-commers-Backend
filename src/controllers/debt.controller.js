import {
    dbListDebts,
    dbGetDebtById,
    dbGetDebtSummary,
    dbCreateDebt,
    dbUpdateDebt,
    dbAddPayment,
    dbRemovePayment,
    dbDeleteDebt
} from "../services/debt.service.js";
import { isPlainString, isValidObjectId, isFiniteInteger, pickAllowed } from "../helpers/validation.helpers.js";
import { sendWriteError } from "../helpers/writeError.helper.js";
import { DEBT_DIRECTIONS, DEBT_MAX_AMOUNT, parseDateOnly } from "../helpers/debt.helper.js";

const DEBT_CREATABLE_FIELDS = ['direction', 'personName', 'personPhone', 'concept', 'amount', 'dueDate', 'notes'];
// El tipo (direction) no se cambia después de crear: se borra y se crea de nuevo.
const DEBT_UPDATABLE_FIELDS = ['personName', 'personPhone', 'concept', 'amount', 'dueDate', 'notes'];
const TEXT_FIELDS = ['direction', 'personName', 'personPhone', 'concept', 'notes'];

const bad = (res, msg) => res.status(400).json({ msg });
const notFound = (res) => res.status(404).json({ msg: "La deuda no existe" });

// Valida tipos del body y convierte la fecha. Devuelve { error } o { data }.
const validateDebtInput = (input) => {
    for (const field of TEXT_FIELDS) {
        if (input[field] !== undefined && !isPlainString(input[field])) {
            return { error: `El campo '${field}' no es válido` };
        }
    }
    if (input.direction !== undefined && !Object.values(DEBT_DIRECTIONS).includes(input.direction)) {
        return { error: "Tipo de deuda no válido" };
    }
    if (input.amount !== undefined) {
        if (!isFiniteInteger(input.amount) || input.amount < 1 || input.amount > DEBT_MAX_AMOUNT) {
            return { error: "El monto debe ser un número entero mayor que 0" };
        }
    }

    const data = { ...input };
    if (input.dueDate !== undefined) {
        if (input.dueDate === null || input.dueDate === "") {
            data.dueDate = null; // quitar la fecha límite
        } else {
            const parsed = parseDateOnly(input.dueDate);
            if (!parsed) return { error: "La fecha límite debe tener formato AAAA-MM-DD" };
            data.dueDate = parsed;
        }
    }
    return { data };
};

const getDebts = async (req, res) => {
    try {
        const data = await dbListDebts();
        res.json({ msg: "Se obtiene listado de deudas", data });
    } catch (error) {
        console.error(`Error al listar deudas -> ${error && error.name}`);
        res.status(500).json({ msg: "Ocurrió un error al obtener las deudas" });
    }
};

const getDebtSummary = async (req, res) => {
    try {
        const data = await dbGetDebtSummary();
        res.json({ msg: "Resumen de deudas", data });
    } catch (error) {
        console.error(`Error en resumen de deudas -> ${error && error.name}`);
        res.status(500).json({ msg: "Ocurrió un error al obtener el resumen" });
    }
};

const getDebtById = async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) return bad(res, "El id no es válido");
        const data = await dbGetDebtById(req.params.id);
        if (!data) return notFound(res);
        res.json({ msg: "Se obtiene la deuda", data });
    } catch (error) {
        console.error(`Error al obtener deuda -> ${error && error.name}`);
        res.status(500).json({ msg: "Ocurrió un error al obtener la deuda" });
    }
};

const createDebt = async (req, res) => {
    try {
        const { error, data: input } = validateDebtInput(pickAllowed(req.body, DEBT_CREATABLE_FIELDS));
        if (error) return bad(res, error);
        if (!input.direction) return bad(res, "El tipo de deuda es obligatorio");
        if (input.amount === undefined) return bad(res, "El monto es obligatorio");

        const data = await dbCreateDebt({ ...input, createdBy: req.user._id });
        res.status(201).json({ msg: "Se registra la deuda", data });
    } catch (error) {
        return sendWriteError(res, error, "deuda");
    }
};

const updateDebtById = async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) return bad(res, "El id no es válido");
        const { error, data: changes } = validateDebtInput(pickAllowed(req.body, DEBT_UPDATABLE_FIELDS));
        if (error) return bad(res, error);
        if (Object.keys(changes).length === 0) return bad(res, "No hay campos para actualizar");

        const data = await dbUpdateDebt(req.params.id, changes);
        if (!data) return notFound(res);
        res.json({ msg: "Se actualiza la deuda", data });
    } catch (error) {
        return sendWriteError(res, error, "deuda");
    }
};

const addDebtPayment = async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) return bad(res, "El id no es válido");
        const input = pickAllowed(req.body, ['amount', 'paidAt', 'note']);

        if (!isFiniteInteger(input.amount) || input.amount < 1) {
            return bad(res, "El abono debe ser un número entero mayor que 0");
        }
        if (input.note !== undefined && !isPlainString(input.note)) {
            return bad(res, "La nota del abono no es válida");
        }
        let paidAt;
        if (input.paidAt !== undefined && input.paidAt !== "") {
            paidAt = parseDateOnly(input.paidAt);
            if (!paidAt) return bad(res, "La fecha del abono debe tener formato AAAA-MM-DD");
        }

        const data = await dbAddPayment(req.params.id, {
            amount: input.amount,
            paidAt,
            note: input.note ? input.note.trim() : undefined
        });
        if (!data) return notFound(res);
        res.status(201).json({ msg: "Se registra el abono", data });
    } catch (error) {
        return sendWriteError(res, error, "abono");
    }
};

const removeDebtPayment = async (req, res) => {
    try {
        const { id, paymentId } = req.params;
        if (!isValidObjectId(id) || !isValidObjectId(paymentId)) return bad(res, "El id no es válido");
        const data = await dbRemovePayment(id, paymentId);
        if (!data) return notFound(res);
        res.json({ msg: "Se elimina el abono", data });
    } catch (error) {
        return sendWriteError(res, error, "abono");
    }
};

const deleteDebtById = async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) return bad(res, "El id no es válido");
        const data = await dbDeleteDebt(req.params.id);
        if (!data) return notFound(res);
        res.json({ msg: "Se elimina la deuda", data });
    } catch (error) {
        return sendWriteError(res, error, "deuda");
    }
};

export {
    getDebts,
    getDebtSummary,
    getDebtById,
    createDebt,
    updateDebtById,
    addDebtPayment,
    removeDebtPayment,
    deleteDebtById
};