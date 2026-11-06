import { apiRequest } from './e2e_helper';
import { prisma } from '../../src/config/db';
import { AuthService } from '../../src/services/authService';
import { StoreService } from '../../src/services/storeService';

export async function runCatalogVariantsLimitsE2ETests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [E2E TEST] Product Variants & Catalog Plan Limits Module ---');
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
  const ownerEmail = `e2e_catalog_${timestamp}@mymall.et`;
  const password = 'P@ssw0rd2026!';
  let token = '';
  let store: any = null;

  try {
    // Register owner & create store
    await AuthService.register({ email: ownerEmail, password, name: 'Catalog Owner' });
    await prisma.user.update({
      where: { email: ownerEmail },
      data: { isEmailVerified: true },
    });
    const loginRes = await AuthService.login(ownerEmail, password);
    token = loginRes.tokens.accessToken;

    store = await StoreService.createStore(loginRes.user.id, {
      name: 'E2E Habesha Clothiers',
      slug: `habesha-clothiers-${timestamp}`,
      contactPhone: '+251911776655',
    });

    // Refresh token with new store context
    const freshLogin = await AuthService.login(ownerEmail, password);
    token = freshLogin.tokens.accessToken;

    // 1. Create product with multi-attribute variants
    const productRes = await apiRequest(
      'POST',
      '/products',
      {
        name: 'Traditional Men Kemis',
        sellingPrice: 3200,
        costPrice: 2000,
        hasVariants: true,
        variants: [
          { name: 'White / Medium (M)', price: 3200, stockQuantity: 10, options: { color: 'White', size: 'M' } },
          { name: 'White / Large (L)', price: 3400, stockQuantity: 8, options: { color: 'White', size: 'L' } },
          { name: 'Gold Trim / XL', price: 3900, stockQuantity: 5, options: { color: 'Gold', size: 'XL' } },
        ],
      },
      {
        Authorization: `Bearer ${token}`,
        'x-store-id': store.id.toString(),
      }
    );
    assert(productRes.status === 201, 'POST /products creates catalog item with nested variants (HTTP 201)');
    assert(productRes.data.product.variants.length === 3, 'Created 3 nested ProductVariant records');
    const createdProductId = productRes.data.product.id;

    // 2. Fetch product by ID
    const fetchRes = await apiRequest('GET', `/products/${createdProductId}`, undefined, {
      Authorization: `Bearer ${token}`,
      'x-store-id': store.id.toString(),
    });
    assert(fetchRes.status === 200 && fetchRes.data.product.variants.length === 3, 'GET /products/:id delivers complete variant roster');

    // 3. Plan Limit Enforcement (Starter Tier: max 25 products)
    // Bulk create products up to 25
    const dummyProducts = [];
    for (let i = 2; i <= 25; i++) {
      dummyProducts.push({
        storeId: store.id,
        name: `Filler Product #${i}`,
        slug: `filler-product-${i}-${timestamp}`,
        sellingPrice: 100,
        costPrice: 50,
      });
    }
    await prisma.product.createMany({ data: dummyProducts });

    const totalCount = await prisma.product.count({ where: { storeId: store.id } });
    assert(totalCount === 25, 'Store catalog safely elevated to Starter maximum cap (25 products)');

    // Attempting 26th product via API must trigger 403 Forbidden
    const blockedRes = await apiRequest(
      'POST',
      '/products',
      {
        name: 'Forbidden 26th Product',
        sellingPrice: 500,
      },
      {
        Authorization: `Bearer ${token}`,
        'x-store-id': store.id.toString(),
      }
    );
    assert(blockedRes.status === 403, 'Exceeding 25 products on Starter tier triggers HTTP 403 Plan Limit');
    assert(
      blockedRes.data.message?.toLowerCase().includes('plan is full') || blockedRes.data.code === 'PLAN_LIMIT_REACHED',
      'API returns descriptive subscription plan limit warning'
    );

    // Clean up
    await prisma.productVariant.deleteMany({ where: { productId: createdProductId } });
    await prisma.product.deleteMany({ where: { storeId: store.id } });
    await prisma.store.delete({ where: { id: store.id } }).catch(() => {});
    await prisma.user.delete({ where: { email: ownerEmail } }).catch(() => {});
  } catch (err: any) {
    console.error('  ❌ [ERROR] Catalog Variants Limits E2E exception:', err.message);
    failed++;
  }

  return { passed, failed };
}

if (require.main === module) {
  const { startTestServer, stopTestServer } = require('./e2e_helper');
  startTestServer().then(() => {
    return runCatalogVariantsLimitsE2ETests().then(async ({ failed }) => {
      await stopTestServer();
      process.exit(failed > 0 ? 1 : 0);
    });
  });
}
