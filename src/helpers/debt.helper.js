// Lógica PURA del módulo de deudas (sin base de datos), para poder probarla fácil.
// Dinero: pesos colombianos como número ENTERO (sin decimales).

export const DEBT_DIRECTIONS = Object.freeze({
  ME_DEBEN: 'ME_DEBEN', // me deben / le presté a alguien (por cobrar)
  YO_DEBO: 'YO_DEBO',   // yo debo / me prestaron (por pagar)
});

export const DEBT_STATUS = Object.freeze({
  PENDIENTE: 'PENDIENTE', // sin abonos
  PARCIAL: 'PARCIAL',     // con abonos, aún con saldo
  PAGADA: 'PAGADA',       // saldo en cero
});

export const DEBT_MAX_AMOUNT = 1_000_000_000;

// Estado según el monto total y lo abonado.
export const statusFor = (amount, paidAmount) => {
  if (paidAmount >= amount) return DEBT_STATUS.PAGADA;
  if (paidAmount > 0) return DEBT_STATUS.PARCIAL;
  return DEBT_STATUS.PENDIENTE;
};

export const sumPayments = (payments = []) =>
  payments.reduce((acc, p) => acc + (Number(p?.amount) || 0), 0);

// Fecha de hoy (YYYY-MM-DD) en Bogotá, igual que usa el dashboard.
export const todayBogota = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now);

// 'YYYY-MM-DD' -> Date a medianoche UTC. Devuelve null si el formato no es válido.
export const parseDateOnly = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Rechaza fechas imposibles (p. ej. 2026-02-31 que JS "corrige" a marzo).
  return d.toISOString().slice(0, 10) === value ? d : null;
};

export const toDateOnly = (date) =>
  date ? new Date(date).toISOString().slice(0, 10) : null;

// Una deuda está vencida si tiene fecha límite anterior a hoy y aún no está pagada.
export const isOverdue = (debt, now = new Date()) => {
  if (!debt?.dueDate || debt.status === DEBT_STATUS.PAGADA) return false;
  return toDateOnly(debt.dueDate) < todayBogota(now);
};

// Forma que ve el frontend: agrega saldo y vencimiento calculados.
export const serializeDebt = (doc, now = new Date()) => {
  const d = typeof doc?.toObject === 'function' ? doc.toObject() : { ...doc };
  const paidAmount = d.paidAmount ?? sumPayments(d.payments);
  return {
    ...d,
    paidAmount,
    balance: Math.max(d.amount - paidAmount, 0),
    dueDate: toDateOnly(d.dueDate),
    overdue: isOverdue(d, now),
  };
};

// Resumen para las tarjetas: solo cuenta deudas con saldo pendiente.
export const buildSummary = (debts = [], now = new Date()) => {
  const empty = () => ({ total: 0, count: 0, overdueTotal: 0, overdueCount: 0 });
  const summary = { meDeben: empty(), yoDebo: empty() };

  for (const debt of debts) {
    if (debt.status === DEBT_STATUS.PAGADA) continue;
    const bucket = debt.direction === DEBT_DIRECTIONS.ME_DEBEN ? summary.meDeben : summary.yoDebo;
    const balance = Math.max(debt.amount - (debt.paidAmount ?? 0), 0);
    bucket.total += balance;
    bucket.count += 1;
    if (isOverdue(debt, now)) {
      bucket.overdueTotal += balance;
      bucket.overdueCount += 1;
    }
  }
  return summary;
};