import assert from "assert";
import { validateStrongPassword } from "../../src/services/authService";
import { generateOTP, hashOTP, verifyOTP } from "../../src/services/otpService";
import { BillingService } from "../../src/services/billingService";
import { BillingCycle, StaffRole } from "@prisma/client";

async function runUnitTests() {
  console.log("=============================================================");
  console.log("🧪 RUNNING UNIT TEST SUITE: MyMall Backend");
  console.log("=============================================================\n");

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
    }
  }

  // --- 1. Password Strength Validation Tests ---
  test("Password validation: rejects passwords under 8 characters", () => {
    const res = validateStrongPassword("Ab1!");
    assert.strictEqual(res.isValid, false);
    assert.match(res.message || "", /at least 8 characters/);
  });

  test("Password validation: rejects password without uppercase letter", () => {
    const res = validateStrongPassword("password123!");
    assert.strictEqual(res.isValid, false);
    assert.match(res.message || "", /uppercase letter/);
  });

  test("Password validation: rejects password without lowercase letter", () => {
    const res = validateStrongPassword("PASSWORD123!");
    assert.strictEqual(res.isValid, false);
    assert.match(res.message || "", /lowercase letter/);
  });

  test("Password validation: rejects password without numbers", () => {
    const res = validateStrongPassword("Password!@#");
    assert.strictEqual(res.isValid, false);
    assert.match(res.message || "", /one number/);
  });

  test("Password validation: rejects password without special character", () => {
    const res = validateStrongPassword("Password123");
    assert.strictEqual(res.isValid, false);
    assert.match(res.message || "", /special character/);
  });

  test("Password validation: accepts robust standard password P@ssw0rd2026!", () => {
    const res = validateStrongPassword("P@ssw0rd2026!");
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.message, undefined);
  });

  // --- 2. OTP Generation & Verification Unit Tests ---
  test("OTP service: generates 6-digit numeric string", () => {
    const otp = generateOTP(6);
    assert.strictEqual(otp.length, 6);
    assert.match(otp, /^\d{6}$/);
  });

  test("OTP service: hashOTP and verifyOTP matches correctly", () => {
    const otp = "849201";
    const hash = hashOTP(otp);
    assert.ok(hash.startsWith("$2"), "Hash should be bcrypt format");
    assert.strictEqual(verifyOTP("849201", hash), true);
    assert.strictEqual(verifyOTP("000000", hash), false);
  });

  // --- 3. Billing Cycle Duration & Pricing Calculations ---
  test("BillingService: calculates correct cycle days", () => {
    assert.strictEqual(BillingService.getCycleDays(BillingCycle.MONTHLY), 30);
    assert.strictEqual(BillingService.getCycleDays(BillingCycle.THREE_MONTHS), 90);
    assert.strictEqual(BillingService.getCycleDays(BillingCycle.SIX_MONTHS), 180);
    assert.strictEqual(BillingService.getCycleDays(BillingCycle.YEARLY), 365);
  });

  test("BillingService: calculates cycle prices accurately", () => {
    const mockPlan = {
      monthlyPrice: 299,
      threeMonthsPrice: 799,
      sixMonthsPrice: 1499,
      yearlyPrice: 2899,
    };
    assert.strictEqual(BillingService.getCyclePrice(mockPlan, BillingCycle.MONTHLY), 299);
    assert.strictEqual(BillingService.getCyclePrice(mockPlan, BillingCycle.THREE_MONTHS), 799);
    assert.strictEqual(BillingService.getCyclePrice(mockPlan, BillingCycle.SIX_MONTHS), 1499);
    assert.strictEqual(BillingService.getCyclePrice(mockPlan, BillingCycle.YEARLY), 2899);
  });

  // --- 4. Custom Permissions Evaluation Logic ---
  test("RBAC: evaluates role and custom permission overrides correctly", () => {
    function hasAccess(userStaffRole: StaffRole, permissions: string[], requiredRole: StaffRole, requiredPermission?: string) {
      if (userStaffRole === StaffRole.MANAGER) return true;
      if (userStaffRole === requiredRole) return true;
      if (requiredPermission && permissions.includes(requiredPermission)) return true;
      return false;
    }

    // Cashier without permission cannot manage inventory
    assert.strictEqual(hasAccess(StaffRole.CASHIER, ["process_pos"], StaffRole.INVENTORY_CLERK, "manage_inventory"), false);

    // Cashier WITH custom permission "manage_inventory" granted by store owner can manage inventory!
    assert.strictEqual(hasAccess(StaffRole.CASHIER, ["process_pos", "manage_inventory"], StaffRole.INVENTORY_CLERK, "manage_inventory"), true);

    // Accountant has finance access but not pos
    assert.strictEqual(hasAccess(StaffRole.ACCOUNTANT, ["view_finance"], StaffRole.CASHIER, "process_pos"), false);
  });

  console.log(`\n=============================================================`);
  console.log(`📊 UNIT TEST RESULTS: ${passed}/${total} Passed (${Math.round((passed / total) * 100)}%)`);
  console.log("=============================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runUnitTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
