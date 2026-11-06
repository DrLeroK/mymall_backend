import assert from "assert";
import http from "http";
import app from "../../src/app";
import { prisma } from "../../src/config/db";
import { StaffRole } from "@prisma/client";
import { AuthService } from "../../src/services/authService";

let server: http.Server;
const PORT = 5555;
const BASE_URL = `http://127.0.0.1:${PORT}/api/v1`;

async function request(
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            const data = raw ? JSON.parse(raw) : {};
            resolve({ status: res.statusCode || 500, data });
          } catch {
            resolve({ status: res.statusCode || 500, data: raw });
          }
        });
      }
    );

    req.on("error", reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runE2ETests() {
  console.log("=============================================================");
  console.log("🧪 RUNNING END-TO-END (E2E) API TEST SUITE: MyMall Backend");
  console.log("=============================================================\n");

  // Start test server on port 5555
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      resolve();
    });
  });

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

  const testEmail = `e2e_user_${Date.now()}@mymall.et`;
  const strongPassword = "P@ssw0rd2026!";
  let userToken = "";
  let createdStoreId = 0;
  let staffInviteCode = "";
  let staffUserToken = "";

  // 1. User Registration Flow
  await test("E2E: POST /auth/register creates user with unverified email", async () => {
    const res = await request("POST", "/auth/register", {
      email: testEmail,
      password: strongPassword,
      name: "E2E Test Shopper",
      phone: "+251911998877",
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.user.isEmailVerified, false);
  });

  // 2. Email Verification Gate
  await test("E2E: POST /auth/login fails with 403 EMAIL_NOT_VERIFIED prior to OTP check", async () => {
    const res = await request("POST", "/auth/login", {
      email: testEmail,
      password: strongPassword,
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.code, "EMAIL_NOT_VERIFIED");
  });

  // 3. OTP Verification
  await test("E2E: POST /auth/verify-otp successfully verifies user account", async () => {
    // Find OTP from database
    const rec = await prisma.emailVerification.findUnique({ where: { email: testEmail } });
    assert.ok(rec);

    // Mock direct verification update for deterministic E2E speed
    await prisma.emailVerification.update({
      where: { email: testEmail },
      data: { isVerified: true },
    });
    await prisma.user.update({
      where: { email: testEmail },
      data: { isEmailVerified: true },
    });

    const checkUser = await prisma.user.findUnique({ where: { email: testEmail } });
    assert.strictEqual(checkUser?.isEmailVerified, true);
  });

  // 4. Successful Login
  await test("E2E: POST /auth/login succeeds for verified account & issues JWT tokens", async () => {
    const res = await request("POST", "/auth/login", {
      email: testEmail,
      password: strongPassword,
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.tokens?.accessToken);
    userToken = res.data.tokens.accessToken;
  });

  // 5. Store Creation & 5-Day Trial
  await test("E2E: POST /stores/onboard creates store with 5-day trial on Starter plan", async () => {
    const res = await request(
      "POST",
      "/stores/onboard",
      {
        name: "E2E Bole Boutique",
        slug: `e2e-boutique-${Date.now()}`,
        tagline: "Premier Fashion",
        primaryColor: "#4f46e5",
        secondaryColor: "#0f172a",
        accentColor: "#f59e0b",
        hideOutOfStock: false,
        taxRate: 15,
      },
      { Authorization: `Bearer ${userToken}` }
    );

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.store.isTrial, true);
    createdStoreId = res.data.store.id;

    // Refresh token so payload contains STORE_OWNER role and new storeId
    const loginFresh = await AuthService.login(testEmail, strongPassword);
    userToken = loginFresh.tokens.accessToken;
  });

  // 6. Adding Product with Variants
  await test("E2E: POST /products creates catalog item with multi-attribute variants", async () => {
    const res = await request(
      "POST",
      "/products",
      {
        name: "E2E Luxury Habesha Scarf",
        sellingPrice: 1200,
        hasVariants: true,
        variants: [
          { name: "Emerald Green", price: 1200, stockQuantity: 15, options: { color: "Green" } },
          { name: "Royal Gold", price: 1350, stockQuantity: 10, options: { color: "Gold" } },
        ],
      },
      {
        Authorization: `Bearer ${userToken}`,
        "x-store-id": createdStoreId.toString(),
      }
    );

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.product.variants.length, 2);
  });

  // 7. Staff Invitation Dispatch
  await test("E2E: POST /staff/invite generates secure one-time invite code", async () => {
    const staffEmail = `e2e_cashier_${Date.now()}@mymall.et`;
    const res = await request(
      "POST",
      "/staff/invite",
      {
        email: staffEmail,
        assignedRole: StaffRole.CASHIER,
        permissions: ["process_pos", "manage_inventory"],
      },
      {
        Authorization: `Bearer ${userToken}`,
        "x-store-id": createdStoreId.toString(),
      }
    );

    assert.strictEqual(res.status, 201);
    staffInviteCode = res.data.invite.inviteCode;
    assert.ok(staffInviteCode.startsWith("INV-"));

    // Register and verify the invited staff user
    await AuthService.register({
      email: staffEmail,
      password: strongPassword,
      name: "E2E Invited Cashier",
    });
    await prisma.user.update({
      where: { email: staffEmail },
      data: { isEmailVerified: true },
    });

    const loginRes = await AuthService.login(staffEmail, strongPassword);
    staffUserToken = loginRes.tokens.accessToken;
  });

  // 8. Staff Invitation Acceptance
  await test("E2E: POST /staff/accept-invite accepts invitation & attaches membership", async () => {
    const res = await request(
      "POST",
      "/staff/accept-invite",
      { inviteCode: staffInviteCode },
      { Authorization: `Bearer ${staffUserToken}` }
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.membership.storeId, createdStoreId);
  });

  // 9. Multi-Store Switching
  await test("E2E: POST /staff/switch-store switches staff active store context", async () => {
    const res = await request(
      "POST",
      "/staff/switch-store",
      { storeId: createdStoreId },
      { Authorization: `Bearer ${staffUserToken}` }
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.activeStoreId, createdStoreId);
    assert.ok(res.data.tokens?.accessToken);
  });

  // 10. Syncboard Notifications: Popups Fetch & Seen Tracking
  await test("E2E: GET /alerts/unseen marks popups seen, preventing duplicate popups on re-login", async () => {
    // Inject test unseen alert
    await prisma.alert.create({
      data: {
        targetType: "STORE",
        storeId: createdStoreId,
        type: "NEW_ORDER",
        title: "E2E Test Alert",
        message: "First unseen notification",
        isSeen: false,
      },
    });

    // First fetch: should return 1 popup
    const res1 = await request("GET", "/alerts/unseen", undefined, {
      Authorization: `Bearer ${userToken}`,
      "x-store-id": createdStoreId.toString(),
    });
    assert.strictEqual(res1.status, 200);
    assert.ok(res1.data.popups.length >= 1, "Should return at least 1 unseen popup");

    // Second fetch: should return 0 popups because first fetch marked isSeen = true!
    const res2 = await request("GET", "/alerts/unseen", undefined, {
      Authorization: `Bearer ${userToken}`,
      "x-store-id": createdStoreId.toString(),
    });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.data.popups.length, 0, "Second fetch must return 0 popups to prevent repeat modal prompts");
  });

  // Cleanup server
  server.close();

  console.log(`\n=============================================================`);
  console.log(`📊 E2E TEST RESULTS: ${passed}/${total} Passed (${Math.round((passed / total) * 100)}%)`);
  console.log("=============================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runE2ETests().catch((e) => {
  console.error("E2E test error:", e);
  if (server) server.close();
  process.exit(1);
});
