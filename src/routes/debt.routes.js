import { Router } from "express";

import {
    getDebts,
    getDebtSummary,
    getDebtById,
    createDebt,
    updateDebtById,
    addDebtPayment,
    removeDebtPayment,
    deleteDebtById
} from "../controllers/debt.controller.js";
import autenticationUser from "../middleware/autentication.middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";

const router = Router();

// Las deudas son información financiera privada: SOLO administrador.
router.use(autenticationUser, requireAdmin);

// OJO: '/summary' va antes que '/:id' para que no lo tome como un id.
router.get('/summary', getDebtSummary);

router.get('/', getDebts);
router.post('/', createDebt);

router.get('/:id', getDebtById);
router.patch('/:id', updateDebtById);
router.delete('/:id', deleteDebtById);

router.post('/:id/payments', addDebtPayment);
router.delete('/:id/payments/:paymentId', removeDebtPayment);

export default router;