const { z } = require('zod');
const { AppError } = require('../utils/errors');
const email = z.string().trim().toLowerCase().max(254).email();
const fullName = z.string().trim().min(2).max(200);
const password = z.string().min(8).refine((value) => Buffer.byteLength(value) <= 72, 'Password must fit within 72 UTF-8 bytes.');
const amountCents = z.number().int().min(1).max(10000000000);
const id = z.string().regex(/^[a-f\d]{24}$/i);
const idempotencyKey = z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/);
const pageNumber = (fallback, max) => z.string().regex(/^\d{1,7}$/).transform(Number).pipe(z.number().int().min(1).max(max)).optional().default(fallback);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().startsWith(v));
const schemas = {
  register: z.object({ fullName, email, password }).strict(),
  login: z.object({ email, password: z.string().min(1).refine((value) => Buffer.byteLength(value) <= 72, 'Password exceeds 72 UTF-8 bytes.'), rememberMe: z.boolean().optional().default(false) }).strict(),
  transfer: z.object({ recipientEmail: email, amountCents, description: z.string().trim().max(180).optional().default('') }).strict(),
  fund: z.object({ amountCents: amountCents.max(1000000) }).strict(),
  profile: z.object({ fullName }).strict(),
  password: z.object({ currentPassword: z.string().min(1).refine((value) => Buffer.byteLength(value) <= 72), newPassword: password }).strict(),
  list: z.object({
    page: pageNumber(1, 1000000), limit: pageNumber(20, 100),
    search: z.string().trim().max(100).optional(),
    type: z.enum(['incoming', 'outgoing']).optional(),
    status: z.enum(['PENDING', 'COMPLETED', 'FAILED']).optional(),
    from: date.optional(), to: date.optional(), sort: z.enum(['newest', 'oldest', 'amount-asc', 'amount-desc']).optional().default('newest'),
  }).strict().refine((v) => !v.from || !v.to || v.from <= v.to, 'Date range is reversed.'),
};
function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError(400, 'INVALID_REQUEST', 'Please check your request fields.', result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  return result.data;
}
const validate = (schema) => (req, res, next) => { try { req.input = parse(schema, req.body); next(); } catch (error) { next(error); } };
module.exports = { schemas, validate, parse, id, idempotencyKey };
