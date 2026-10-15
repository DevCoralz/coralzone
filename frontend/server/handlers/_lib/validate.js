// Input-shape validation with zod. This — plus the parameterized queries
// in _lib/db.js — is what actually stops malicious input from doing
// anything: zod rejects a request before it ever reaches a query or a
// shell/command context (this codebase never builds a shell command or
// raw SQL string from user input in the first place, so there's no
// "command injection" surface to patch; the two real surfaces, SQL and
// XSS, are closed by parameterized queries and React's automatic output
// escaping respectively). Treat every field here as hostile until it
// passes.
import { z } from "zod";

const email = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email()
  .transform((v) => v.toLowerCase());

const name = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(120)
  .regex(/^[\p{L}\p{M} '.-]+$/u, "Name contains invalid characters");

// Deliberately generous charset (bcrypt handles any bytes) but bounded —
// an unbounded password is a cheap denial-of-service vector against bcrypt.
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[a-z]/, "Add a lowercase letter")
  .regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/[0-9]/, "Add a number");

const otpCode = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

export const registerSchema = z.object({ name, email, password });
export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});
export const verifyEmailSchema = z.object({ email, code: otpCode });
export const resendCodeSchema = z.object({ email });

export function formatZodError(error) {
  const first = error.issues[0];
  return first?.message ?? "Invalid input";
}
