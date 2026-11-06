import { apiRequest } from './e2e_helper';
import { prisma } from '../../src/config/db';
import { AuthService } from '../../src/services/authService';
import { StoreService } from '../../src/services/storeService';
import { StaffRole } from '@prisma/client';

export async function runStaffInviteMultiStoreE2ETests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [E2E TEST] Staff Invitation & Multi-Store Context Switching Module ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  const timestamp = Date.now();
  const ownerEmail = `e2e_owner_${timestamp}@mymall.et`;
  const staffEmail = `e2e_staff_${timestamp}@mymall.et`;
  const password = 'P@ssw0rd2026!';
  let ownerToken = '';
  let staffToken = '';
  let storeA: any = null;
  let storeB: any = null;
  let inviteCode = '';

  try {
    // 1. Setup Owner and Two Stores
    await AuthService.register({ email: ownerEmail, password, name: 'Multi-Store Owner' });
    await prisma.user.update({
      where: { email: ownerEmail },
      data: { isEmailVerified: true },
    });
    const ownerLogin = await AuthService.login(ownerEmail, password);
    ownerToken = ownerLogin.tokens.accessToken;

    storeA = await StoreService.createStore(ownerLogin.user.id, {
      name: `Chain Store Alpha ${timestamp}`,
      slug: `store-alpha-${timestamp}`,
      contactPhone: '+251911112233',
    });
    storeB = await StoreService.createStore(ownerLogin.user.id, {
      name: `Chain Store Beta ${timestamp}`,
      slug: `store-beta-${timestamp}`,
      contactPhone: '+251911445566',
    });

    // Setup Staff User
    await AuthService.register({ email: staffEmail, password, name: 'Cross-Store Staff Member' });
    await prisma.user.update({
      where: { email: staffEmail },
      data: { isEmailVerified: true },
    });
    const staffLogin = await AuthService.login(staffEmail, password);
    staffToken = staffLogin.tokens.accessToken;

    // Refresh owner token to include STORE_OWNER role
    const refreshedOwner = await AuthService.login(ownerEmail, password);
    ownerToken = refreshedOwner.tokens.accessToken;

    // 2. Dispatch Staff Invitation from Store A
    const inviteRes = await apiRequest(
      'POST',
      '/staff/invite',
      {
        email: staffEmail,
        assignedRole: StaffRole.CASHIER,
        permissions: ['process_pos', 'manage_inventory'],
      },
      {
        Authorization: `Bearer ${ownerToken}`,
        'x-store-id': storeA.id.toString(),
      }
    );
    assert(inviteRes.status === 201 && !!inviteRes.data.invite?.inviteCode, 'POST /staff/invite generates unique inviteCode (HTTP 201)');
    inviteCode = inviteRes.data.invite.inviteCode;

    // 3a. Email mismatch gate: accepting with different user email fails with 403 EMAIL_MISMATCH
    const mismatchRes = await apiRequest(
      'POST',
      '/staff/accept-invite',
      { inviteCode },
      { Authorization: `Bearer ${ownerToken}` }
    );
    assert(
      mismatchRes.status === 403 && mismatchRes.data.code === 'EMAIL_MISMATCH',
      'Accepting invite with different email rejected with 403 EMAIL_MISMATCH'
    );

    // 3b. Accept Staff Invitation with matching email succeeds
    const acceptRes = await apiRequest(
      'POST',
      '/staff/accept-invite',
      { inviteCode },
      { Authorization: `Bearer ${staffToken}` }
    );
    assert(acceptRes.status === 200 && acceptRes.data.success === true, 'POST /staff/accept-invite creates StoreStaffMember (HTTP 200)');
    assert(!!acceptRes.data.tokens?.accessToken, 'Accepting invite returns fresh JWT tokens with store context');

    // 4. Single-use invitation gate: Re-using invite code fails
    const reAcceptRes = await apiRequest(
      'POST',
      '/staff/accept-invite',
      { inviteCode },
      { Authorization: `Bearer ${staffToken}` }
    );
    assert(reAcceptRes.status === 400, 'Re-using consumed invite code rejected (HTTP 400)');

    // Also manually add staff to Store B as ACCOUNTANT to test multi-store switching
    await prisma.storeStaffMember.create({
      data: {
        storeId: storeB.id,
        userId: staffLogin.user.id,
        staffRole: StaffRole.ACCOUNTANT,
        permissions: JSON.stringify(['view_reports']),
      },
    });

    // 5. Staff switches active store context to Store B
    const switchRes = await apiRequest(
      'POST',
      '/staff/switch-store',
      { storeId: storeB.id },
      { Authorization: `Bearer ${staffToken}` }
    );
    assert(switchRes.status === 200, 'POST /staff/switch-store switches active tenant context (HTTP 200)');
    assert(switchRes.data.activeStoreId === storeB.id, 'Response confirms activeStoreId updated to Store B');
    assert(switchRes.data.staffRole === StaffRole.ACCOUNTANT, 'Response confirms role updated to ACCOUNTANT for Store B');
    assert(!!switchRes.data.tokens?.accessToken, 'Issues fresh JWT token scoped with new store context');

    // Clean up
    await prisma.storeStaffMember.deleteMany({ where: { userId: staffLogin.user.id } });
    await prisma.staffInvite.deleteMany({ where: { email: staffEmail } });
    await prisma.store.delete({ where: { id: storeA.id } }).catch(() => {});
    await prisma.store.delete({ where: { id: storeB.id } }).catch(() => {});
    await prisma.user.delete({ where: { email: ownerEmail } }).catch(() => {});
    await prisma.user.delete({ where: { email: staffEmail } }).catch(() => {});
  } catch (err: any) {
    console.error('  ❌ [ERROR] Staff Invite & Multi-Store E2E exception:', err.message);
    failed++;
  }

  return { passed, failed };
}

if (require.main === module) {
  const { startTestServer, stopTestServer } = require('./e2e_helper');
  startTestServer().then(() => {
    return runStaffInviteMultiStoreE2ETests().then(async ({ failed }) => {
      await stopTestServer();
      process.exit(failed > 0 ? 1 : 0);
    });
  });
}
