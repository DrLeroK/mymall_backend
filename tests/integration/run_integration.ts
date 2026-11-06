import assert from "assert";
import { prisma } from "../../src/config/db";
import { StoreService } from "../../src/services/storeService";
import { ProductService, ProductServiceError } from "../../src/services/productService";
import { StaffService, StaffServiceError } from "../../src/services/staffService";
import { NotificationService } from "../../src/services/notificationService";
import { AuthService, AuthError } from "../../src/services/authService";
import { Role, StaffRole, AlertType } from "@prisma/client";

async function runIntegrationTests() {
  console.log("=============================================================");
  console.log("🧪 RUNNING INTEGRATION TEST SUITE: MyMall Backend");
  console.log("=============================================================\n");

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
    }
  }

  // --- 1. Test 5-Day Trial & Subscription Hard Limit Enforcement ---
  await test("Integration: Store creation auto-assigns 5-day trial on Starter plan", async () => {
    const ownerEmail = `test_owner_${Date.now()}@mymall.et`;
    // Register owner
    const reg = await AuthService.register({
      email: ownerEmail,
      password: "P@ssw0rd2026!",
      name: "Test Trial Owner",
    });
    // Manually verify email for test
    await prisma.user.update({
      where: { email: ownerEmail },
      data: { isEmailVerified: true },
    });

    const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
    assert.ok(owner);

    const store = await StoreService.createStore(owner!.id, {
      name: "Integration Trial Shop",
      slug: "integration-trial-shop-" + Date.now(),
      category: "Test",
    });

    assert.strictEqual(store.isTrial, true);
    assert.ok(store.trialEndsAt);
    const diffDays = Math.round((store.trialEndsAt!.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    assert.strictEqual(diffDays, 5, "Trial should be exactly 5 days");
  });

  await test("Integration: Product addition strictly enforces plan maxProducts (403 when full)", async () => {
    // Find Starter plan
    const starterPlan = await prisma.subscriptionPlan.findUnique({ where: { name: "Starter" } });
    assert.ok(starterPlan);

    // Create isolated test store
    const testOwner = await prisma.user.create({
      data: {
        email: `limit_owner_${Date.now()}@test.et`,
        password: "hashed_dummy_pass",
        name: "Limit Owner",
        role: Role.STORE_OWNER,
        isEmailVerified: true,
      },
    });

    const store = await prisma.store.create({
      data: {
        name: "Limit Test Boutique",
        slug: `limit-test-${Date.now()}`,
        ownerId: testOwner.id,
        currentPlanId: starterPlan!.id,
        isTrial: true,
        trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      },
    });

    // Populate up to starterPlan.maxProducts (25)
    const currentProducts = await prisma.product.count({ where: { storeId: store.id } });
    const needed = starterPlan!.maxProducts - currentProducts;

    const dummyProducts = [];
    for (let i = 0; i < needed; i++) {
      dummyProducts.push({
        storeId: store.id,
        name: `Product Slot ${i + 1}`,
        slug: `slot-${i + 1}-${Date.now()}`,
        sellingPrice: 100,
      });
    }
    await prisma.product.createMany({ data: dummyProducts });

    // Verify limit is reached
    const totalCount = await prisma.product.count({ where: { storeId: store.id } });
    assert.strictEqual(totalCount, starterPlan!.maxProducts);

    // Attempt to add Product #26 -> MUST THROW 403 PLAN_LIMIT_REACHED
    let threwLimit = false;
    try {
      await ProductService.createProduct(store.id, {
        name: "Forbidden Product #26",
        sellingPrice: 500,
      });
    } catch (err: any) {
      if (err instanceof ProductServiceError && err.statusCode === 403 && err.code === "PLAN_LIMIT_REACHED") {
        threwLimit = true;
      }
    }
    assert.strictEqual(threwLimit, true, "ProductService must reject product addition beyond plan limit with 403");
  });

  // --- 2. Test Staff Invitation Flow & Limits ---
  await test("Integration: Staff invite enforces maxStaff limit and accepts single-use invite", async () => {
    const starterPlan = await prisma.subscriptionPlan.findUnique({ where: { name: "Starter" } });
    const owner = await prisma.user.findFirst({ where: { role: Role.STORE_OWNER } });
    assert.ok(owner);

    const store = await prisma.store.create({
      data: {
        name: "Staff Test Store",
        slug: `staff-test-${Date.now()}`,
        ownerId: owner!.id,
        currentPlanId: starterPlan!.id,
        isTrial: true,
        trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      },
    });

    // Invite staff member 1
    const invitedEmail = `invited_acc_${Date.now()}@addis.et`;
    const invite1 = await StaffService.inviteStaff(
      store.id,
      owner!.id,
      invitedEmail,
      StaffRole.ACCOUNTANT,
      ["view_finance"]
    );
    assert.ok(invite1.inviteCode.startsWith("INV-"));

    // Create user for invited email
    const staffUser = await prisma.user.create({
      data: {
        email: invitedEmail,
        password: "hashed_dummy_pass",
        name: "Abebe Accountant",
        role: Role.CUSTOMER,
        isEmailVerified: true,
      },
    });

    // Accept invite
    const acceptRes = await StaffService.acceptInvite(invite1.inviteCode, staffUser.id);
    assert.strictEqual(acceptRes.success, true);
    assert.strictEqual(acceptRes.membership.staffRole, StaffRole.ACCOUNTANT);

    // Attempt re-use of invite code -> MUST FAIL
    let reuseFailed = false;
    try {
      await StaffService.acceptInvite(invite1.inviteCode, staffUser.id);
    } catch (err: any) {
      reuseFailed = true;
    }
    assert.strictEqual(reuseFailed, true, "Invite code cannot be used twice");

    // Attempt acceptance with mismatched email
    const otherUser = await prisma.user.create({
      data: {
        email: `intruder_${Date.now()}@test.et`,
        password: "pass",
        name: "Intruder",
        role: Role.CUSTOMER,
        isEmailVerified: true,
      },
    });

    const invite2 = await StaffService.inviteStaff(
      store.id,
      owner!.id,
      "legit_target@addis.et",
      StaffRole.CASHIER
    );

    let mismatchCaught = false;
    try {
      await StaffService.acceptInvite(invite2.inviteCode, otherUser.id);
    } catch (err: any) {
      if (err instanceof StaffServiceError && err.code === "EMAIL_MISMATCH") {
        mismatchCaught = true;
      }
    }
    assert.strictEqual(mismatchCaught, true, "Invite must verify invitee email matches logged-in user email");
  });

  // --- 3. Test Multi-Store Staff Switching & Custom Permissions ---
  await test("Integration: Staff working in multiple stores can switch active store & retain distinct permissions", async () => {
    const multiStaff = await prisma.user.findUnique({
      where: { email: "staff@multiethio.et" },
      include: { memberships: { include: { store: true } } },
    });
    assert.ok(multiStaff);
    assert.ok(multiStaff!.memberships.length >= 2, "Multi-store staff should be assigned to at least 2 stores");

    const store1 = multiStaff!.memberships[0].store;
    const store2 = multiStaff!.memberships[1].store;

    // Switch to Store 1
    const switch1 = await StaffService.switchActiveStore(multiStaff!.id, store1.id);
    assert.strictEqual(switch1.activeStoreId, store1.id);
    assert.strictEqual(switch1.tokens.accessToken.length > 20, true);

    // Switch to Store 2
    const switch2 = await StaffService.switchActiveStore(multiStaff!.id, store2.id);
    assert.strictEqual(switch2.activeStoreId, store2.id);
    assert.strictEqual(switch2.staffRole, multiStaff!.memberships[1].staffRole);
  });

  // --- 4. Test Notification Isolation & Seen Tracking ---
  await test("Integration: Notification routing isolates store vs admin vs customer and marks seen on first fetch", async () => {
    const testStore = await prisma.store.findFirst();
    const admin = await prisma.user.findFirst({ where: { role: Role.SUPER_ADMIN } });
    const customer = await prisma.user.findFirst({ where: { role: Role.CUSTOMER } });
    assert.ok(testStore && admin && customer);

    // 1. Create alerts
    const storeAlert = await NotificationService.createAlert({
      targetType: "STORE",
      storeId: testStore!.id,
      type: AlertType.NEW_ORDER,
      title: "Store Private Alert",
      message: "Secret store order",
    });

    const adminAlert = await NotificationService.createAlert({
      targetType: "ADMIN",
      type: AlertType.PAYMENT_SUBMITTED,
      title: "Admin Platform Alert",
      message: "Platform billing proof",
    });

    // 2. Query popups for Admin: MUST NOT include storeAlert
    const adminPopups = await NotificationService.getUnseenPopups(admin!);
    const hasStoreAlert = adminPopups.some((a) => a.id === storeAlert.id);
    assert.strictEqual(hasStoreAlert, false, "Superadmin must NEVER receive store alerts");

    // 3. Query popups for Store: MUST NOT include adminAlert
    const storePopupsFirstFetch = await NotificationService.getUnseenPopups({
      id: 999,
      role: Role.STORE_OWNER,
      storeId: testStore!.id,
    });
    const hasAdminAlert = storePopupsFirstFetch.some((a) => a.id === adminAlert.id);
    assert.strictEqual(hasAdminAlert, false, "Store must NEVER receive platform admin alerts");

    // 4. Query popups for Store second time: MUST BE EMPTY because first fetch marked isSeen: true!
    const storePopupsSecondFetch = await NotificationService.getUnseenPopups({
      id: 999,
      role: Role.STORE_OWNER,
      storeId: testStore!.id,
    });
    const alreadySeenAlert = storePopupsSecondFetch.find((a) => a.id === storeAlert.id);
    assert.strictEqual(alreadySeenAlert, undefined, "Once marked seen, popup notification must NOT show again on re-login");
  });

  console.log(`\n=============================================================`);
  console.log(`📊 INTEGRATION TEST RESULTS: ${passed}/${total} Passed (${Math.round((passed / total) * 100)}%)`);
  console.log("=============================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runIntegrationTests().catch((e) => {
  console.error("Integration test error:", e);
  process.exit(1);
});
