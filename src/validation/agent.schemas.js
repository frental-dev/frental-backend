const { z } = require('zod');

const phoneRegex = /^(\+?254|0)(7|1)\d{8}$/;

const signupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().regex(phoneRegex, 'Enter a valid Kenyan phone number').optional(),
  whatsapp: z.string().regex(phoneRegex, 'Enter a valid Kenyan phone number').optional(),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
});

const loginSchema = z
  .object({
    phone: z.string().optional(),
    email: z.string().email().optional(),
    password: z.string().min(1),
  })
  .refine((data) => data.phone || data.email, {
    message: 'Provide either phone or email',
    path: ['phone'],
  });

const forgotPasswordSchema = z
  .object({
    phone: z.string().optional(),
    email: z.string().email().optional(),
  })
  .refine((data) => data.phone || data.email, {
    message: 'Provide either phone or email',
    path: ['phone'],
  });

const resetPasswordSchema = z
  .object({
    phone: z.string().optional(),
    email: z.string().email().optional(),
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
    newPassword: z.string().min(8).max(72),
  })
  .refine((data) => data.phone || data.email, {
    message: 'Provide either phone or email',
    path: ['phone'],
  });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});

const changeEmailSchema = z.object({
  newEmail: z.string().trim().email(),
  currentPassword: z.string().min(1).optional(),
});

const googleAuthSchema = z.object({
  idToken: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const verifyEmailCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

const confirmEmailChangeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

module.exports = {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  changeEmailSchema,
  googleAuthSchema,
  refreshSchema,
  verifyEmailCodeSchema,
  confirmEmailChangeSchema,
};
