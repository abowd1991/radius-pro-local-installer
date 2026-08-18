import bcrypt from "bcryptjs";
import { eq, or, and, gt } from "drizzle-orm";
import { getDb } from "../db";
import { users, permissionPlans, systemSettings } from "../../drizzle/schema";
import { createTenantSubscription } from "../_core/tenantSubscriptions";
import { 
  generateVerificationCode, 
  sendVerificationEmail, 
  sendPasswordResetEmail,
  sendWelcomeEmail 
} from "./emailService";
import { sendSms } from "./tweetsmsService";
import { validateActivationDelivery, type ActivationDelivery } from "../domains/users/AccountActivationPolicy";

// ============================================================================
// HELPER: Read verification settings from system_settings
// ============================================================================
async function getVerificationConfig(): Promise<{
  emailEnabled: boolean;
  smsEnabled: boolean;
  method: "email" | "sms" | "both";
}> {
  try {
    const db = await getDb();
    if (!db) return { emailEnabled: true, smsEnabled: false, method: "email" };
    const rows = await db.select().from(systemSettings);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value ?? "";
    return {
      emailEnabled: map["email_verification_enabled"] !== "false",
      smsEnabled: map["sms_verification_enabled"] === "true",
      method: (map["verification_method"] as "email" | "sms" | "both") || "email",
    };
  } catch {
    return { emailEnabled: true, smsEnabled: false, method: "email" };
  }
}

// Send verification code via configured channels
async function sendVerificationCode(
  email: string,
  phone: string | null | undefined,
  name: string,
  code: string
): Promise<void> {
  const config = await getVerificationConfig();
  const sendEmail = config.emailEnabled && (config.method === "email" || config.method === "both");
  const sendSmsMsg = config.smsEnabled && (config.method === "sms" || config.method === "both") && phone;

  if (sendEmail) {
    sendVerificationEmail(email, name, code)
      .then(sent => {
        if (sent) console.log(`[Auth] ✅ Verification email sent to ${email}`);
        else console.error(`[Auth] ❌ Failed to send verification email to ${email}`);
      })
      .catch(err => console.error(`[Auth] ❌ Error sending verification email:`, err));
  }

  if (sendSmsMsg && phone) {
    const smsMessage = `كود التحقق للتسجيل في RadiusPro: ${code} (ينتهي خلال 15 دقيقة)`;
    sendSms(phone, smsMessage, undefined, { type: "automatic", triggeredBy: "registration" })
      .then(result => {
        if (result.success) console.log(`[Auth] ✅ Verification SMS sent to ${phone}`);
        else console.error(`[Auth] ❌ Failed to send verification SMS to ${phone}: ${result.errorMessage}`);
      })
      .catch(err => console.error(`[Auth] ❌ Error sending verification SMS:`, err));
  }

  // Fallback: if both are disabled, send email anyway so user can verify
  if (!sendEmail && !sendSmsMsg) {
    sendVerificationEmail(email, name, code)
      .catch(err => console.error(`[Auth] ❌ Fallback email error:`, err));
  }
}

const SALT_ROUNDS = 10;
const CODE_EXPIRY_MINUTES = 15;

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  name?: string;
  phone?: string;
  preferredCurrency?: "USD" | "ILS" | "JOD" | "SAR" | "AED" | "EGP" | "YER";
}

export interface LoginInput {
  usernameOrEmail: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  user?: typeof users.$inferSelect;
  error?: string;
  message?: string;
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Register new user with traditional auth
export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database connection failed" };
  }

  // Validate input - ALL fields are REQUIRED
  if (!input.name || input.name.trim().length < 2) {
    return { success: false, error: "الاسم مطلوب (حرفين على الأقل)" };
  }
  if (!input.username || input.username.trim().length < 3) {
    return { success: false, error: "اسم المستخدم مطلوب (3 أحرف على الأقل)" };
  }
  if (!input.email || !input.email.includes("@") || !input.email.includes(".")) {
    return { success: false, error: "البريد الإلكتروني غير صحيح" };
  }
  if (!input.password || input.password.length < 6) {
    return { success: false, error: "كلمة المرور مطلوبة (6 أحرف على الأقل)" };
  }

  // Check if username or email already exists
  const existing = await db
    .select()
    .from(users)
    .where(
      or(
        eq(users.username, input.username),
        eq(users.email, input.email)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    if (existing[0].username === input.username) {
      return { success: false, error: "Username already exists" };
    }
    if (existing[0].email === input.email) {
      return { success: false, error: "Email already exists" };
    }
  }

  // Hash password
  const passwordHash = await hashPassword(input.password);

  // Generate email verification code
  const verificationCode = generateVerificationCode();
  const verificationExpires = new Date();
  verificationExpires.setMinutes(verificationExpires.getMinutes() + CODE_EXPIRY_MINUTES);

  // Get default permission plan for client role
  const [defaultPlan] = await db
    .select()
    .from(permissionPlans)
    .where(
      and(
        eq(permissionPlans.role, "client"),
        eq(permissionPlans.isDefault, true)
      )
    )
    .limit(1);

  // Create user with trial status
  const [newUser] = await db
    .insert(users)
    .values({
      username: input.username,
      email: input.email,
      passwordHash,
      name: input.name || input.username,
      phone: input.phone,
      loginMethod: "traditional",
      role: "client", // New users are regular clients
      status: "active",
      permissionPlanId: defaultPlan?.id || null, // Auto-assign default plan
      preferredCurrency: input.preferredCurrency || "USD",
      emailVerified: false,
      emailVerificationCode: verificationCode,
      emailVerificationExpires: verificationExpires,
    })
    .$returningId();

  // Get the created user
  const [createdUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, newUser.id))
    .limit(1);

  if (!createdUser) {
    return { success: false, error: "Failed to create user" };
  }

  // Create 7-day trial subscription automatically
  const trialExpiresAt = new Date();
  trialExpiresAt.setDate(trialExpiresAt.getDate() + 7);
  
  const { tenantSubscriptions } = await import("../../drizzle/schema");
  await db.insert(tenantSubscriptions).values({
    tenantId: createdUser.id,
    status: "active",
    pricePerMonth: "0.00",
    startDate: new Date(),
    expiresAt: trialExpiresAt,
    notes: "7-day free trial",
  });

  // Add $2 welcome bonus to new user's wallet
  try {
    const { wallets, walletLedger } = await import("../../drizzle/schema");
    // Create wallet with $2 welcome bonus
    await db.insert(wallets).values({ userId: createdUser.id, balance: "2.00" });
    // Record ledger entry
    await db.insert(walletLedger).values({
      userId: createdUser.id,
      type: "credit",
      amount: "2.00",
      balanceBefore: "0.00",
      balanceAfter: "2.00",
      reason: "Welcome bonus - $2 free credit to explore the system",
      reasonAr: "رصيد ترحيبي - $2 مجاني لتجربة النظام",
      actorId: createdUser.id,
      actorRole: "system",
    } as any);
    console.log(`[Auth] ✅ Welcome bonus $2 added to wallet for user ${createdUser.id}`);
  } catch (err) {
    console.error(`[Auth] ❌ Failed to add welcome bonus:`, err);
    // Non-fatal: user is created, wallet bonus failed
  }

  // NAS Isolation: create radgroupcheck for new user so their cards work with Huntgroup isolation
  try {
    const { radgroupcheck } = await import("../../drizzle/schema");
    const { sql: drizzleSql } = await import("drizzle-orm");
    const groupname = `owner_${createdUser.id}`;
    await db.execute(
      drizzleSql`INSERT IGNORE INTO radgroupcheck (groupname, attribute, op, value)
                 VALUES (${groupname}, 'Huntgroup-Name', '==', ${groupname})`
    );
    console.log(`[Auth] ✅ radgroupcheck created for new user ${createdUser.id} → group ${groupname}`);
  } catch (err) {
    console.error(`[Auth] ❌ Failed to create radgroupcheck for user ${createdUser.id}:`, err);
    // Non-fatal: user is created, radgroupcheck will be added when first NAS is created
  }

  // Send verification code via configured channels (email / SMS / both)
  console.log(`[Auth] Sending verification code to ${input.email} (phone: ${input.phone || 'none'}) with code ${verificationCode}`);
  await sendVerificationCode(input.email, input.phone, input.name || input.username, verificationCode);

  return { success: true, user: createdUser };
}

// Login with username/email and password
export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database connection failed" };
  }

  // Find user by username or email
  const [user] = await db
    .select()
    .from(users)
    .where(
      or(
        eq(users.username, input.usernameOrEmail),
        eq(users.email, input.usernameOrEmail)
      )
    )
    .limit(1);

  if (!user) {
    return { success: false, error: "Invalid username or password" };
  }

  // Check if user has password (traditional auth)
  if (!user.passwordHash) {
    return { success: false, error: "This account uses OAuth login. Please use the OAuth button." };
  }

  // Verify password
  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    return { success: false, error: "Invalid username or password" };
  }

  // Check if user is active
  if (user.status !== "active") {
    return { success: false, error: "Your account has been suspended. Please contact support." };
  }

  // Check if email is verified (required for login)
  if (!user.emailVerified) {
    return { 
      success: false, 
      error: "EMAIL_NOT_VERIFIED",
      message: "Please verify your email address before logging in. Check your inbox for the verification code."
    };
  }

  // Balance-based subscription (no more accountStatus check)
  // User can login regardless of balance

  // Update last signed in
  await db
    .update(users)
    .set({ lastSignedIn: new Date() })
    .where(eq(users.id, user.id));

  return { success: true, user };
}

// Get user by ID
export async function getUserById(id: number): Promise<typeof users.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return user || null;
}

// ============================================================================
// EMAIL VERIFICATION
// ============================================================================

// Verify email with code
export async function verifyEmail(email: string, code: string): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database connection failed" };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.email, email),
        eq(users.emailVerificationCode, code),
        gt(users.emailVerificationExpires, new Date())
      )
    )
    .limit(1);

  if (!user) {
    return { success: false, error: "Invalid or expired verification code" };
  }

  // Update user as verified
  await db
    .update(users)
    .set({
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpires: null,
    })
    .where(eq(users.id, user.id));

  // Send welcome email
  sendWelcomeEmail(email, user.name || user.username || "User")
    .catch(err => console.error(`[Auth] Failed to send welcome email:`, err));

  return { success: true };
}

// Resend verification code
export async function resendVerificationCode(email: string): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database connection failed" };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return { success: false, error: "Email not found" };
  }

  if (user.emailVerified) {
    return { success: false, error: "Email already verified" };
  }

  // Generate new code
  const newCode = generateVerificationCode();
  const newExpires = new Date();
  newExpires.setMinutes(newExpires.getMinutes() + CODE_EXPIRY_MINUTES);

  await db
    .update(users)
    .set({
      emailVerificationCode: newCode,
      emailVerificationExpires: newExpires,
    })
    .where(eq(users.id, user.id));

  // Send verification code via configured channels
  const config = await getVerificationConfig();
  const sendEmailChannel = config.emailEnabled && (config.method === "email" || config.method === "both");
  const sendSmsChannel = config.smsEnabled && (config.method === "sms" || config.method === "both") && user.phone;

  if (sendEmailChannel) {
    const sent = await sendVerificationEmail(email, user.name || user.username || "User", newCode);
    if (!sent && !sendSmsChannel) {
      return { success: false, error: "Failed to send verification email" };
    }
  }

  if (sendSmsChannel && user.phone) {
    const smsMessage = `كود التحقق للتسجيل في RadiusPro: ${newCode} (ينتهي خلال 15 دقيقة)`;
    await sendSms(user.phone, smsMessage, undefined, { type: "automatic", triggeredBy: "resend_verification" });
  }

  // Fallback if nothing configured
  if (!sendEmailChannel && !sendSmsChannel) {
    const sent = await sendVerificationEmail(email, user.name || user.username || "User", newCode);
    if (!sent) return { success: false, error: "Failed to send verification email" };
  }

  return { success: true };
}

/** Issue a fresh activation code for an administrator-created account through a selected channel. */
export async function sendAccountActivation(
  userId: number,
  delivery: ActivationDelivery,
): Promise<{ success: boolean; delivered: ActivationDelivery[]; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, delivered: [], error: "Database connection failed" };

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { success: false, delivered: [], error: "User not found" };
  if (user.emailVerified) return { success: false, delivered: [], error: "Account is already activated" };

  const validationError = validateActivationDelivery(delivery, user);
  if (validationError) return { success: false, delivered: [], error: validationError };

  const code = generateVerificationCode();
  const expires = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);
  await db.update(users).set({ emailVerificationCode: code, emailVerificationExpires: expires }).where(eq(users.id, user.id));

  const delivered: ActivationDelivery[] = [];
  const displayName = user.name || user.username || "User";
  if (delivery === "email" || delivery === "both") {
    const emailSent = await sendVerificationEmail(user.email, displayName, code);
    if (!emailSent && delivery === "email") return { success: false, delivered, error: "Failed to send verification email" };
    if (emailSent) delivered.push("email");
  }
  if ((delivery === "sms" || delivery === "both") && user.phone) {
    const sms = await sendSms(user.phone, `كود تفعيل حسابك في Radius Pro: ${code} (ينتهي خلال 15 دقيقة)`, undefined, { type: "automatic", triggeredBy: "account_activation" });
    if (!sms.success && delivery === "sms") return { success: false, delivered, error: sms.errorMessage || "Failed to send SMS" };
    if (sms.success) delivered.push("sms");
  }

  return delivered.length > 0
    ? { success: true, delivered }
    : { success: false, delivered, error: "Failed to deliver activation code" };
}

// ============================================================================
// PASSWORD RESET
// ============================================================================

// Request password reset
export async function requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database connection failed" };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    // الإيميل غير موجود في النظام — أرجع خطأ واضح
    return { success: false, error: "هذا البريد الإلكتروني غير مسجل في النظام" };
  }

  // Only allow password reset for traditional auth users
  if (!user.passwordHash) {
    return { success: false, error: "هذا الحساب مرتبط بتسجيل دخول خارجي ولا يدعم استعادة كلمة المرور" };
  }

  // Generate reset code
  const resetCode = generateVerificationCode();
  const resetExpires = new Date();
  resetExpires.setMinutes(resetExpires.getMinutes() + CODE_EXPIRY_MINUTES);

  await db
    .update(users)
    .set({
      passwordResetCode: resetCode,
      passwordResetExpires: resetExpires,
    })
    .where(eq(users.id, user.id));

  // Send reset email — تمرير الاسم الكامل واسم المستخدم
  sendPasswordResetEmail(email, user.name || user.username || "User", resetCode, user.username || "")
    .then(sent => {
      if (sent) {
        console.log(`[Auth] Password reset email sent to ${email}`);
      }
    })
    .catch(err => console.error(`[Auth] Failed to send reset email:`, err));

  return { success: true };
}

// Verify reset code (check if valid)
export async function verifyResetCode(email: string, code: string): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database connection failed" };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.email, email),
        eq(users.passwordResetCode, code),
        gt(users.passwordResetExpires, new Date())
      )
    )
    .limit(1);

  if (!user) {
    return { success: false, error: "Invalid or expired reset code" };
  }

  return { success: true };
}

// Reset password with code
export async function resetPassword(email: string, code: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database connection failed" };
  }

  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: "Password must be at least 6 characters" };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.email, email),
        eq(users.passwordResetCode, code),
        gt(users.passwordResetExpires, new Date())
      )
    )
    .limit(1);

  if (!user) {
    return { success: false, error: "Invalid or expired reset code" };
  }

  // Hash new password
  const passwordHash = await hashPassword(newPassword);

  // Update password and clear reset code
  await db
    .update(users)
    .set({
      passwordHash,
      passwordResetCode: null,
      passwordResetExpires: null,
    })
    .where(eq(users.id, user.id));

  console.log(`[Auth] Password reset successful for ${email}`);
  return { success: true };
}
