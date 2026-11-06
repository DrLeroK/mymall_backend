import { prisma } from '../../src/config/db';
import { StaffService } from '../../src/services/staffService';
import { StoreService } from '../../src/services/storeService';
import { AuthService } from '../../src/services/authService';
import { StaffRole, Role } from '@prisma/client';

export async function runStaffMembershipIntegrationTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [INTEGRATION TEST] Multi-Store Staff & Membership Module ---');
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
  const ownerEmail = `staff_owner_${timestamp}@mymall.et`;
  const inviteeEmail = `invited_acc_${timestamp}@addis.et`;

  let owner: any = null;
  let storeA: any = null;
  let storeB: any = null;

  try {
    // 1. Setup owner and two stores (Store A and Store B)
    await AuthService.register({ email: ownerEmail, password: 'P@ssw0rd2026!', name: 'Multi-Store Owner' });
    owner = await prisma.user.update({
      where: { email: ownerEmail },
      data: { isEmailVerified: true, role: 'STORE_OWNER' },
    });

    storeA = await StoreService.createStore(owner.id, { name: 'Addis Flagship Branch', slug: `addis-flagship-${timestamp}` });
    storeB = await StoreService.createStore(owner.id, { name: 'Hawassa Regional Branch', slug: `hawassa-branch-${timestamp}` });

    // 2. Invite staff member with ACCOUNTANT role and custom permissions
    const invite = await StaffService.inviteStaff(
      storeA.id,
      owner.id,
      inviteeEmail,
      StaffRole.ACCOUNTANT,
      ['view_finance', 'export_reports']
    );

    assert(!!invite.inviteCode, 'Staff invitation creates secure one-time inviteCode');
    assert(invite.assignedRole === StaffRole.ACCOUNTANT, 'Invitation accurately stores ACCOUNTANT role');

    // Create an unverified user for fraud check
    const fraudUser = await prisma.user.create({
      data: {
        email: `fraud_${timestamp}@other.et`,
        password: 'P@ssw0rd2026!',
        name: 'Fraud User',
        role: Role.CUSTOMER,
      },
    });

    // 3. Reject acceptance if email does not match
    let wrongEmailBlocked = false;
    try {
      await StaffService.acceptInvite(invite.inviteCode, fraudUser.id);
    } catch (e: any) {
      wrongEmailBlocked = true;
    }
    assert(wrongEmailBlocked === true, 'Invite acceptance strictly verified against target email address');

    // Create the legitimate invitee user
    const inviteeUser = await prisma.user.create({
      data: {
        email: inviteeEmail,
        password: 'P@ssw0rd2026!',
        name: 'Liya Kebede Accountant',
        role: Role.CUSTOMER,
        isEmailVerified: true,
      },
    });

    // 4. Accept invite with legitimate email
    const acceptRes = await StaffService.acceptInvite(invite.inviteCode, inviteeUser.id);
    assert(acceptRes.membership.staffRole === StaffRole.ACCOUNTANT, 'Created StoreStaffMember junction with ACCOUNTANT role');
    assert(acceptRes.membership.storeId === storeA.id, 'Membership bound to Store A');

    // 5. One-time use: Attempting to accept again must fail
    let reuseBlocked = false;
    try {
      await StaffService.acceptInvite(invite.inviteCode, inviteeUser.id);
    } catch {
      reuseBlocked = true;
    }
    assert(reuseBlocked === true, 'One-time invite code cannot be reused after acceptance');

    // 6. Multi-Store Employment: Attach same user as CASHIER in Store B
    await prisma.storeStaffMember.create({
      data: {
        storeId: storeB.id,
        userId: inviteeUser.id,
        staffRole: StaffRole.CASHIER,
        permissions: JSON.stringify(['process_pos']),
      },
    });

    const memberships = await prisma.storeStaffMember.findMany({
      where: { userId: inviteeUser.id },
    });
    assert(memberships.length === 2, 'User successfully belongs to multiple stores concurrently via StoreStaffMember');

    // 7. Active store switching
    const switchRes = await StaffService.switchActiveStore(inviteeUser.id, storeB.id);
    assert(switchRes.activeStoreId === storeB.id, 'Switched active store context to Store B');
    assert(switchRes.staffRole === StaffRole.CASHIER, 'Retains correct CASHIER role in Store B context');

    // Clean up
    await prisma.storeStaffMember.deleteMany({ where: { userId: inviteeUser.id } });
    await prisma.store.deleteMany({ where: { id: { in: [storeA.id, storeB.id] } } });
    await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, inviteeEmail, fraudUser.email] } } });
  } catch (err: any) {
    console.error('  ❌ [ERROR] Staff membership integration test exception:', err.message);
    failed++;
  }

  return { passed, failed };
}

if (require.main === module) {
  runStaffMembershipIntegrationTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
    process.exit(0);
  });
}
