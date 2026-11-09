import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email().max(254).transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Password policy: ≥10 chars, upper, lower, digit. */
export const passwordSchema = z.string().min(10, 'At least 10 characters').max(128)
  .regex(/[A-Z]/, 'Needs an upper-case letter')
  .regex(/[a-z]/, 'Needs a lower-case letter')
  .regex(/\d/, 'Needs a digit');

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
