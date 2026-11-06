import {
  PrismaClient,
  Role,
  StaffRole,
  StoreStatus,
  BillingCycle,
  PaymentStatus,
  OrderStatus,
  PaymentProofStatus,
  POSPaymentMethod,
  OrderType,
  ConversationType,
  AlertType,
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting MyMall Database Seeding with Rich Ethiopian Stores, Variants & Multi-Store Staff...');

  const forceReseed = process.argv.includes('--force') || process.env.FORCE_SEED === 'true';

  // Zero-Data-Loss Guard: Only run seed once on initial deployment!
  const existingUser = await prisma.user.findFirst();
  const existingStore = await prisma.store.findFirst();

  if ((existingUser || existingStore) && !forceReseed) {
    console.log('ℹ️ [Zero-Data-Loss Guard] Database has already been initialized (Users or Stores exist).');
    console.log('🔒 Skipping database seed execution to preserve live production data.');
    console.log('   (To re-seed from scratch in development, pass --force or set FORCE_SEED=true)');
    return;
  }

  // 1. Password Hashes (Using strong password standard: P@ssw0rd2026!)
  const STRONG_PASSWORD = 'P@ssw0rd2026!';
  const hashedPassword = await bcrypt.hash(STRONG_PASSWORD, 10);

  // 2. Clear Any Existing Tables in Clean Order (Only if uninitialized or force flag)
  await prisma.alert.deleteMany();
  await prisma.staffInvite.deleteMany();
  await prisma.storeStaffMember.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.chatConversation.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.storeReview.deleteMany();
  await prisma.review.deleteMany();
  await prisma.siteReview.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.pOSSaleItem.deleteMany();
  await prisma.pOSSale.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.storeSubscription.deleteMany();
  await prisma.storeBankAccount.deleteMany();
  await prisma.platformBankAccount.deleteMany();
  await prisma.customerAddress.deleteMany();
  await prisma.store.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.emailVerification.deleteMany();
  await prisma.user.deleteMany();

  console.log('🧹 Cleaned existing records.');

  // 3. Platform Super Admin
  const superAdmin = await prisma.user.create({
    data: {
      email: 'admin.mymall@gmail.com',
      password: hashedPassword,
      name: 'Platform Super Admin',
      phone: '+251911000000',
      role: Role.SUPER_ADMIN,
      isEmailVerified: true,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
    },
  });
  console.log('✅ Super Admin created: admin.mymall@gmail.com / ' + STRONG_PASSWORD);

  // 4. Exactly 3 Subscription Plans (Starter with 5-day trial, Growth, Enterprise)
  const starterPlan = await prisma.subscriptionPlan.create({
    data: {
      name: 'Starter',
      description: 'Ideal for local retail shops & startups in Ethiopia. Includes 5-day free trial.',
      monthlyPrice: 299.0,
      threeMonthsPrice: 799.0,
      sixMonthsPrice: 1499.0,
      yearlyPrice: 2899.0,
      maxProducts: 25,
      maxStaff: 2,
      trialDays: 5,
      searchRankBoost: 1,
      analyticsLevel: 'BASIC',
      customDomainAllowed: false,
    },
  });

  const growthPlan = await prisma.subscriptionPlan.create({
    data: {
      name: 'Growth',
      description: 'For growing merchants needing high visibility, multiple POS cashiers & custom branding.',
      monthlyPrice: 699.0,
      threeMonthsPrice: 1899.0,
      sixMonthsPrice: 3599.0,
      yearlyPrice: 6899.0,
      maxProducts: 150,
      maxStaff: 5,
      trialDays: 0,
      searchRankBoost: 5,
      analyticsLevel: 'ADVANCED',
      customDomainAllowed: false,
    },
  });

  const enterprisePlan = await prisma.subscriptionPlan.create({
    data: {
      name: 'Enterprise',
      description: 'Unlimited scale, top marketplace priority, dedicated POS terminal support & pro analytics.',
      monthlyPrice: 1499.0,
      threeMonthsPrice: 3999.0,
      sixMonthsPrice: 7499.0,
      yearlyPrice: 13999.0,
      maxProducts: 1000,
      maxStaff: 20,
      trialDays: 0,
      searchRankBoost: 10,
      analyticsLevel: 'PRO',
      customDomainAllowed: true,
    },
  });
  console.log('✅ 3 Subscription plans created (Starter [5-day trial], Growth, Enterprise).');

  // 5. Platform Bank Accounts (For Subscription Wire Receipts)
  await prisma.platformBankAccount.createMany({
    data: [
      {
        bankName: 'Commercial Bank of Ethiopia (CBE)',
        accountName: 'MyMall Technologies PLC',
        accountNumber: '1000123456789',
        instructions: 'Please include your Store Name or Subscription ID in the transaction memo/reason.',
      },
      {
        bankName: 'Bank of Abyssinia',
        accountName: 'MyMall Technologies PLC',
        accountNumber: '88776655',
        instructions: 'Transfer via BOA Mobile app or BOA Direct.',
      },
      {
        bankName: 'Telebirr SuperApp Merchant',
        accountName: 'MyMall Technologies',
        accountNumber: '0911223344',
        instructions: 'Pay to Merchant Till Number: 554433',
      },
    ],
  });

  // 6. Users: Store Owners, Cashiers, Accountant, Multi-Store Staff, Customers
  const ownerAddis = await prisma.user.create({
    data: {
      email: 'abuabat521@gmail.com',
      password: hashedPassword,
      name: 'Almaz Tefera',
      phone: '+251911234567',
      role: Role.STORE_OWNER,
      isEmailVerified: true,
      avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80',
    },
  });

  const ownerTech = await prisma.user.create({
    data: {
      email: 'ethiotech.owner@gmail.com',
      password: hashedPassword,
      name: 'Dawit Bekele',
      phone: '+251922345678',
      role: Role.STORE_OWNER,
      isEmailVerified: true,
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
    },
  });

  const cashierAddis = await prisma.user.create({
    data: {
      email: 'addisfashion.cashier@gmail.com',
      password: hashedPassword,
      name: 'Selam Haile',
      phone: '+251933456789',
      role: Role.STORE_STAFF,
      staffRole: StaffRole.CASHIER,
      isEmailVerified: true,
    },
  });

  const accountantAddis = await prisma.user.create({
    data: {
      email: 'addisfashion.accountant@gmail.com',
      password: hashedPassword,
      name: 'Kassahun Worku',
      phone: '+251944567890',
      role: Role.STORE_STAFF,
      staffRole: StaffRole.ACCOUNTANT,
      isEmailVerified: true,
    },
  });

  // Multi-Store Staff (works at Addis Fashion as Cashier with inventory permission, and Ethio Tech as Accountant)
  const multiStaff = await prisma.user.create({
    data: {
      email: 'multistore.staff@gmail.com',
      password: hashedPassword,
      name: 'Yonas Abebe',
      phone: '+251955678901',
      role: Role.STORE_STAFF,
      staffRole: StaffRole.CASHIER,
      isEmailVerified: true,
    },
  });

  const customer1 = await prisma.user.create({
    data: {
      email: 'customer.hana@gmail.com',
      password: hashedPassword,
      name: 'Hana Girma',
      phone: '+251966789012',
      role: Role.CUSTOMER,
      isEmailVerified: true,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
    },
  });

  const customer2 = await prisma.user.create({
    data: {
      email: 'customer.mekonnen@gmail.com',
      password: hashedPassword,
      name: 'Mekonnen Tadesse',
      phone: '+251977890123',
      role: Role.CUSTOMER,
      isEmailVerified: true,
    },
  });

  // Unverified user for testing the email verification gate
  const unverifiedUser = await prisma.user.create({
    data: {
      email: 'customer.unverified@gmail.com',
      password: hashedPassword,
      name: 'Biniam Tesfaye',
      phone: '+251988901234',
      role: Role.CUSTOMER,
      isEmailVerified: false,
    },
  });

  console.log('✅ Users created with @gmail.com addresses & strong password standard.');

  // 7. Store 1: Addis Fashion Hub
  const now = new Date();
  const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const fiveDaysFromNow = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  const addisFashion = await prisma.store.create({
    data: {
      name: 'Addis Fashion Hub',
      slug: 'addis-fashion',
      tagline: 'Authentic Ethiopian Traditional Habesha Kemis & Modern Apparel',
      description:
        'Addis Ababas premier boutique for hand-woven Habesha Kemis, high-grade Ethiopian highland leather jackets, casual streetwear, and traditional artisan crafts.',
      category: 'Fashion & Apparel',
      logoUrl: 'https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?w=300&auto=format&fit=crop&q=80',
      bannerUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80',
      contactEmail: 'abuabat521@gmail.com',
      contactPhone: '+251911234567',
      address: 'Bole Road, Mega Building 2nd Floor, Addis Ababa, Ethiopia',
      currency: 'ETB',
      taxRate: 15.0,
      deliveryFee: 50.0,
      primaryColor: '#4f46e5',
      secondaryColor: '#0f172a',
      accentColor: '#f59e0b',
      hideOutOfStock: false,
      returnPolicy: 'Exchange or store credit within 7 business days with intact tags and proof of purchase.',
      businessHours: JSON.stringify({
        monday: '08:30-18:30',
        tuesday: '08:30-18:30',
        wednesday: '08:30-18:30',
        thursday: '08:30-18:30',
        friday: '08:30-18:30',
        saturday: '09:00-19:00',
        sunday: '10:00-16:00',
      }),
      status: StoreStatus.ACTIVE,
      ownerId: ownerAddis.id,
      currentPlanId: growthPlan.id,
      isTrial: false,
      subscriptionEndsAt: oneYearFromNow,
    },
  });

  // Store 2: Ethio Tech Zone (On 5-Day Free Trial of Starter Plan)
  const ethioTech = await prisma.store.create({
    data: {
      name: 'Ethio Tech Zone',
      slug: 'ethio-tech',
      tagline: 'Genuine Electronics, Smartphones, Laptops & Accessories in Bole',
      description:
        'The premier electronics and digital lifestyle store in Addis Ababa. Official distributor of Apple, Samsung, Dell, Lenovo, and premium audio equipment with warranty.',
      category: 'Electronics & Computers',
      logoUrl: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=300&auto=format&fit=crop&q=80',
      bannerUrl: 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=1200&auto=format&fit=crop&q=80',
      contactEmail: 'ethiotech.owner@gmail.com',
      contactPhone: '+251922345678',
      address: 'Bole Medhanialem, Edna Mall Area, Addis Ababa, Ethiopia',
      currency: 'ETB',
      taxRate: 15.0,
      deliveryFee: 100.0,
      primaryColor: '#0284c7',
      secondaryColor: '#0f172a',
      accentColor: '#10b981',
      hideOutOfStock: false,
      returnPolicy: '1-year warranty on original devices. Replacement within 14 days for manufacturer defects.',
      businessHours: JSON.stringify({
        monday: '09:00-20:00',
        tuesday: '09:00-20:00',
        wednesday: '09:00-20:00',
        thursday: '09:00-20:00',
        friday: '09:00-20:00',
        saturday: '09:00-20:00',
        sunday: 'closed',
      }),
      status: StoreStatus.ACTIVE,
      ownerId: ownerTech.id,
      currentPlanId: starterPlan.id,
      isTrial: true,
      trialEndsAt: fiveDaysFromNow,
      subscriptionEndsAt: fiveDaysFromNow,
    },
  });

  // Update default assignedStore on users for backward compatibility
  await prisma.user.update({ where: { id: cashierAddis.id }, data: { storeId: addisFashion.id } });
  await prisma.user.update({ where: { id: accountantAddis.id }, data: { storeId: addisFashion.id } });
  await prisma.user.update({ where: { id: multiStaff.id }, data: { storeId: addisFashion.id } });

  // 8. StoreStaffMember Junctions (Multi-Store Memberships with Custom Permissions)
  // Selam: Cashier at Addis Fashion
  await prisma.storeStaffMember.create({
    data: {
      storeId: addisFashion.id,
      userId: cashierAddis.id,
      staffRole: StaffRole.CASHIER,
      permissions: JSON.stringify(['process_pos', 'view_receipts']),
      isActive: true,
    },
  });

  // Kassahun: Accountant at Addis Fashion
  await prisma.storeStaffMember.create({
    data: {
      storeId: addisFashion.id,
      userId: accountantAddis.id,
      staffRole: StaffRole.ACCOUNTANT,
      permissions: JSON.stringify(['view_finance', 'export_reports', 'view_invoices']),
      isActive: true,
    },
  });

  // Yonas: Cashier with custom inventory permission at Addis Fashion
  await prisma.storeStaffMember.create({
    data: {
      storeId: addisFashion.id,
      userId: multiStaff.id,
      staffRole: StaffRole.CASHIER,
      permissions: JSON.stringify(['process_pos', 'manage_inventory']), // Owner granted inventory rights to this cashier!
      isActive: true,
    },
  });

  // Yonas: ALSO Accountant at Ethio Tech Zone (Multi-Store Staff!)
  await prisma.storeStaffMember.create({
    data: {
      storeId: ethioTech.id,
      userId: multiStaff.id,
      staffRole: StaffRole.ACCOUNTANT,
      permissions: JSON.stringify(['view_finance', 'export_reports']),
      isActive: true,
    },
  });

  console.log('✅ Multi-store memberships established for staff.');

  // 9. Store Bank Accounts
  await prisma.storeBankAccount.createMany({
    data: [
      {
        storeId: addisFashion.id,
        bankName: 'Commercial Bank of Ethiopia (CBE)',
        accountName: 'Addis Fashion Hub / Almaz Tefera',
        accountNumber: '1000987654321',
        instructions: 'Please put your Order Number in the CBE mobile transfer reason.',
      },
      {
        storeId: addisFashion.id,
        bankName: 'Telebirr Merchant',
        accountName: 'Addis Fashion Hub',
        accountNumber: '0911234567',
        instructions: 'Scan Telebirr QR at store or transfer directly to phone number.',
      },
      {
        storeId: ethioTech.id,
        bankName: 'Bank of Abyssinia',
        accountName: 'Ethio Tech Zone Enterprise',
        accountNumber: '44556677',
        instructions: 'Transfer via BOA mobile with order reference number.',
      },
    ],
  });

  // 10. Product Categories & Products with Variants
  // --- ADDIS FASHION HUB CATEGORIES ---
  const catTraditional = await prisma.productCategory.create({
    data: {
      storeId: addisFashion.id,
      name: 'Habesha Kemis & Traditional',
      slug: 'habesha-kemis',
      description: 'Hand-loomed Ethiopian cotton garments with fine silk embroidery.',
    },
  });

  const catLeather = await prisma.productCategory.create({
    data: {
      storeId: addisFashion.id,
      name: 'Highland Leather',
      slug: 'highland-leather',
      description: 'Premium Ethiopian genuine sheepskin and calfskin leather jackets, bags, and boots.',
    },
  });

  const catStreetwear = await prisma.productCategory.create({
    data: {
      storeId: addisFashion.id,
      name: 'Urban Streetwear',
      slug: 'urban-streetwear',
      description: 'Contemporary Ethiopian graphic tees, heavyweight hoodies, and urban casuals.',
    },
  });

  const catAccessories = await prisma.productCategory.create({
    data: {
      storeId: addisFashion.id,
      name: 'Accessories & Jewelry',
      slug: 'accessories-jewelry',
      description: 'Handmade silver cross pendants, wool fedoras, and authentic Ethiopian crafts.',
    },
  });

  // --- ETHIO TECH ZONE CATEGORIES ---
  const catPhones = await prisma.productCategory.create({
    data: {
      storeId: ethioTech.id,
      name: 'Smartphones & Tablets',
      slug: 'smartphones',
      description: 'Flagship Apple, Samsung, and Google devices with 1-year warranty.',
    },
  });

  const catComputers = await prisma.productCategory.create({
    data: {
      storeId: ethioTech.id,
      name: 'Laptops & Workstations',
      slug: 'laptops',
      description: 'High-performance computing laptops for developers, designers, and creators.',
    },
  });

  const catAudio = await prisma.productCategory.create({
    data: {
      storeId: ethioTech.id,
      name: 'Audio & Wearables',
      slug: 'audio-wearables',
      description: 'Audiophile noise-canceling headphones, smart watches, and portable sound.',
    },
  });

  const catGadgets = await prisma.productCategory.create({
    data: {
      storeId: ethioTech.id,
      name: 'Drones & Smart Gear',
      slug: 'drones-gadgets',
      description: '4K aerial photography drones, high-capacity power banks, and smart accessories.',
    },
  });

  // --- ADDIS FASHION HUB PRODUCTS (10 Products) ---

  // Product 1: Royal Habesha Kemis
  const kemisProduct = await prisma.product.create({
    data: {
      storeId: addisFashion.id,
      categoryId: catTraditional.id,
      brand: 'Shewa Heritage',
      name: 'Royal Hand-Woven Habesha Kemis',
      slug: 'royal-hand-woven-habesha-kemis',
      description:
        'Exquisite hand-woven pure Shewa cotton Habesha dress featuring intricate Tilf and Tibeb border embroidery. Tailored for Timkat celebrations, weddings, and formal Ethiopian ceremonies.',
      sku: 'AF-KMS-001',
      costPrice: 2800.0,
      sellingPrice: 4500.0,
      compareAtPrice: 5200.0,
      stockQuantity: 38,
      lowStockThreshold: 5,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: true,
    },
  });

  await prisma.productVariant.createMany({
    data: [
      {
        productId: kemisProduct.id,
        name: 'Size S / Golden Tibeb',
        sku: 'AF-KMS-GOLD-S',
        price: 4500.0,
        stockQuantity: 10,
        options: JSON.stringify({ size: 'S', color: 'Gold', pattern: 'Royal Tibeb' }),
      },
      {
        productId: kemisProduct.id,
        name: 'Size M / Golden Tibeb',
        sku: 'AF-KMS-GOLD-M',
        price: 4500.0,
        stockQuantity: 15,
        options: JSON.stringify({ size: 'M', color: 'Gold', pattern: 'Royal Tibeb' }),
      },
      {
        productId: kemisProduct.id,
        name: 'Size L / Royal Blue Tibeb',
        sku: 'AF-KMS-BLUE-L',
        price: 4800.0,
        stockQuantity: 8,
        options: JSON.stringify({ size: 'L', color: 'Royal Blue', pattern: 'Classic Tilf' }),
      },
      {
        productId: kemisProduct.id,
        name: 'Size XL / Emerald Green Tibeb',
        sku: 'AF-KMS-GRN-XL',
        price: 4800.0,
        stockQuantity: 5,
        options: JSON.stringify({ size: 'XL', color: 'Emerald Green', pattern: 'Modern Chevron' }),
      },
    ],
  });

  // Product 2: Highland Leather Bomber Jacket
  const leatherJacket = await prisma.product.create({
    data: {
      storeId: addisFashion.id,
      categoryId: catLeather.id,
      brand: 'Addis Leather Works',
      name: 'Highland Genuine Leather Bomber Jacket',
      slug: 'highland-leather-bomber-jacket',
      description:
        'Crafted from 100% Ethiopian highland sheepskin leather known worldwide for its supple texture and durability. Features heavy-duty brass YKK zippers and satin lining.',
      sku: 'AF-LTH-JKT-01',
      costPrice: 4200.0,
      sellingPrice: 6800.0,
      compareAtPrice: 7900.0,
      stockQuantity: 22,
      lowStockThreshold: 4,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1521223890158-f9f7c3d5d504?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: true,
    },
  });

  await prisma.productVariant.createMany({
    data: [
      {
        productId: leatherJacket.id,
        name: 'Size M / Vintage Tan Brown',
        sku: 'AF-LTH-BRN-M',
        price: 6800.0,
        stockQuantity: 6,
        options: JSON.stringify({ size: 'M', color: 'Vintage Tan' }),
      },
      {
        productId: leatherJacket.id,
        name: 'Size L / Vintage Tan Brown',
        sku: 'AF-LTH-BRN-L',
        price: 6800.0,
        stockQuantity: 9,
        options: JSON.stringify({ size: 'L', color: 'Vintage Tan' }),
      },
      {
        productId: leatherJacket.id,
        name: 'Size L / Matte Obsidian Black',
        sku: 'AF-LTH-BLK-L',
        price: 7200.0,
        stockQuantity: 7,
        options: JSON.stringify({ size: 'L', color: 'Matte Obsidian' }),
      },
    ],
  });

  // Product 3: Leather Crossbody Messenger Bag
  const leatherBag = await prisma.product.create({
    data: {
      storeId: addisFashion.id,
      categoryId: catLeather.id,
      brand: 'Addis Leather Works',
      name: 'Handcrafted Addis Leather Crossbody Messenger',
      slug: 'handcrafted-addis-leather-messenger',
      description:
        'Full-grain calfskin leather messenger bag designed for professionals and students. Fits a 14-inch laptop with dedicated sleeve and magnetic clasps.',
      sku: 'AF-BAG-001',
      costPrice: 1100.0,
      sellingPrice: 1950.0,
      compareAtPrice: 2400.0,
      stockQuantity: 30,
      lowStockThreshold: 5,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: true,
    },
  });

  await prisma.productVariant.createMany({
    data: [
      {
        productId: leatherBag.id,
        name: 'Cognac Tan / Brass Hardware',
        sku: 'AF-BAG-TAN',
        price: 1950.0,
        stockQuantity: 18,
        options: JSON.stringify({ color: 'Cognac Tan' }),
      },
      {
        productId: leatherBag.id,
        name: 'Midnight Black / Gunmetal',
        sku: 'AF-BAG-BLK',
        price: 2100.0,
        stockQuantity: 12,
        options: JSON.stringify({ color: 'Midnight Black' }),
      },
    ],
  });

  // Product 4: Chelsea Leather Boots
  const chelseaBoots = await prisma.product.create({
    data: {
      storeId: addisFashion.id,
      categoryId: catLeather.id,
      brand: 'Addis Leather Works',
      name: 'Highland Handcrafted Leather Chelsea Boots',
      slug: 'highland-leather-chelsea-boots',
      description:
        'Durable Ethiopian bovine leather boots equipped with reinforced elastic side gussets and all-weather rubber commando soles.',
      sku: 'AF-BTS-001',
      costPrice: 2200.0,
      sellingPrice: 3850.0,
      compareAtPrice: 4500.0,
      stockQuantity: 28,
      lowStockThreshold: 4,
      unit: 'pairs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1638247025967-b4e38f787b76?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1520639888713-7851133b1ed0?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: true,
    },
  });

  await prisma.productVariant.createMany({
    data: [
      {
        productId: chelseaBoots.id,
        name: 'EU 40 / Dark Chocolate Brown',
        sku: 'AF-BOOT-BRN-40',
        price: 3850.0,
        stockQuantity: 6,
        options: JSON.stringify({ size: '40', color: 'Dark Chocolate' }),
      },
      {
        productId: chelseaBoots.id,
        name: 'EU 41 / Dark Chocolate Brown',
        sku: 'AF-BOOT-BRN-41',
        price: 3850.0,
        stockQuantity: 8,
        options: JSON.stringify({ size: '41', color: 'Dark Chocolate' }),
      },
      {
        productId: chelseaBoots.id,
        name: 'EU 42 / Dark Chocolate Brown',
        sku: 'AF-BOOT-BRN-42',
        price: 3850.0,
        stockQuantity: 9,
        options: JSON.stringify({ size: '42', color: 'Dark Chocolate' }),
      },
      {
        productId: chelseaBoots.id,
        name: 'EU 43 / Onyx Black',
        sku: 'AF-BOOT-BLK-43',
        price: 3850.0,
        stockQuantity: 5,
        options: JSON.stringify({ size: '43', color: 'Onyx Black' }),
      },
    ],
  });

  // Product 5: Sheba Streetwear Heavyweight Hoodie
  const shebaHoodie = await prisma.product.create({
    data: {
      storeId: addisFashion.id,
      categoryId: catStreetwear.id,
      brand: 'Sheba Apparel',
      name: 'Sheba Streetwear 450GSM Heavyweight Hoodie',
      slug: 'sheba-streetwear-heavyweight-hoodie',
      description:
        'Oversized drop-shoulder French terry hoodie featuring Ge’ez typography on the chest and an embossed Lion of Judah emblem on the back.',
      sku: 'AF-SHB-HD-01',
      costPrice: 1200.0,
      sellingPrice: 2200.0,
      compareAtPrice: 2800.0,
      stockQuantity: 35,
      lowStockThreshold: 6,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: true,
    },
  });

  await prisma.productVariant.createMany({
    data: [
      {
        productId: shebaHoodie.id,
        name: 'Size M / Olive Green',
        sku: 'AF-HD-OLV-M',
        price: 2200.0,
        stockQuantity: 12,
        options: JSON.stringify({ size: 'M', color: 'Olive Green' }),
      },
      {
        productId: shebaHoodie.id,
        name: 'Size L / Olive Green',
        sku: 'AF-HD-OLV-L',
        price: 2200.0,
        stockQuantity: 14,
        options: JSON.stringify({ size: 'L', color: 'Olive Green' }),
      },
      {
        productId: shebaHoodie.id,
        name: 'Size XL / Washed Charcoal',
        sku: 'AF-HD-CHR-XL',
        price: 2350.0,
        stockQuantity: 9,
        options: JSON.stringify({ size: 'XL', color: 'Washed Charcoal' }),
      },
    ],
  });

  // Product 6: Entoto Trail Runner Athletic Sneakers
  const entotoSneakers = await prisma.product.create({
    data: {
      storeId: addisFashion.id,
      categoryId: catStreetwear.id,
      brand: 'Entoto Athletic',
      name: 'Entoto Trail Runner Lightweight Sneakers',
      slug: 'entoto-trail-runner-sneakers',
      description:
        'Engineered for altitude training and urban strides. Breathable woven mesh upper with responsive EVA midsole cushioning.',
      sku: 'AF-SNK-ENT-01',
      costPrice: 1600.0,
      sellingPrice: 2950.0,
      compareAtPrice: 3600.0,
      stockQuantity: 24,
      lowStockThreshold: 4,
      unit: 'pairs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: true,
    },
  });

  await prisma.productVariant.createMany({
    data: [
      {
        productId: entotoSneakers.id,
        name: 'EU 40 / Crimson Racer Red',
        sku: 'AF-SNK-RED-40',
        price: 2950.0,
        stockQuantity: 6,
        options: JSON.stringify({ size: '40', color: 'Crimson Red' }),
      },
      {
        productId: entotoSneakers.id,
        name: 'EU 41 / Crimson Racer Red',
        sku: 'AF-SNK-RED-41',
        price: 2950.0,
        stockQuantity: 8,
        options: JSON.stringify({ size: '41', color: 'Crimson Red' }),
      },
      {
        productId: entotoSneakers.id,
        name: 'EU 42 / Crimson Racer Red',
        sku: 'AF-SNK-RED-42',
        price: 2950.0,
        stockQuantity: 10,
        options: JSON.stringify({ size: '42', color: 'Crimson Red' }),
      },
    ],
  });

  // Product 7: Traditional Gabi Blanket
  await prisma.product.create({
    data: {
      storeId: addisFashion.id,
      categoryId: catTraditional.id,
      brand: 'Shewa Heritage',
      name: 'Traditional Ethiopian Pure Cotton Gabi Blanket',
      slug: 'traditional-ethiopian-cotton-gabi',
      description:
        'Authentic Ethiopian multi-layered pure cotton Gabi woven by master artisans in Chencha. Unrivaled warmth, softness, and traditional multicolored edge borders.',
      sku: 'AF-GAB-001',
      costPrice: 850.0,
      sellingPrice: 1650.0,
      compareAtPrice: 1950.0,
      stockQuantity: 40,
      lowStockThreshold: 5,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: true,
    },
  });

  // Product 8: Full-Grain Leather Weekender Duffle
  await prisma.product.create({
    data: {
      storeId: addisFashion.id,
      categoryId: catLeather.id,
      brand: 'Addis Leather Works',
      name: 'Handcrafted Full-Grain Leather Weekender Duffle',
      slug: 'leather-weekender-duffle-bag',
      description:
        '50-liter capacity luxury travel bag made of waxed Ethiopian highland bovine leather. Includes dedicated shoe compartment and brass feet.',
      sku: 'AF-DUF-001',
      costPrice: 3200.0,
      sellingPrice: 5600.0,
      compareAtPrice: 6500.0,
      stockQuantity: 15,
      lowStockThreshold: 3,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: false,
    },
  });

  // Product 9: Addis Vintage Heritage Graphic Tee
  await prisma.product.create({
    data: {
      storeId: addisFashion.id,
      categoryId: catStreetwear.id,
      brand: 'Sheba Apparel',
      name: 'Addis Vintage Heritage Cotton Graphic Tee',
      slug: 'addis-vintage-heritage-graphic-tee',
      description:
        '100% pre-shrunk organic combed cotton featuring archival 1960s Addis Ababa jazz cafe illustrations.',
      sku: 'AF-TEE-ADD-01',
      costPrice: 450.0,
      sellingPrice: 950.0,
      compareAtPrice: 1200.0,
      stockQuantity: 50,
      lowStockThreshold: 10,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: true,
    },
  });

  // Product 10: Axumite Hand-Carved Silver Cross
  await prisma.product.create({
    data: {
      storeId: addisFashion.id,
      categoryId: catAccessories.id,
      brand: 'Lalibela Silversmiths',
      name: 'Artisan Axumite Hand-Carved Silver Cross Pendant',
      slug: 'artisan-axumite-silver-cross-pendant',
      description:
        'Masterfully filigreed 925 sterling silver cross crafted according to 12th-century northern Ethiopian ecclesiastic traditions. Comes with handcrafted silver chain.',
      sku: 'AF-JWL-CRX-01',
      costPrice: 1400.0,
      sellingPrice: 2800.0,
      compareAtPrice: 3400.0,
      stockQuantity: 20,
      lowStockThreshold: 4,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: false,
    },
  });

  // --- ETHIO TECH ZONE PRODUCTS (10 Products) ---

  // Product 1: Samsung Galaxy S24 Ultra
  const galaxyPhone = await prisma.product.create({
    data: {
      storeId: ethioTech.id,
      categoryId: catPhones.id,
      brand: 'Samsung',
      name: 'Samsung Galaxy S24 Ultra 5G',
      slug: 'samsung-galaxy-s24-ultra-5g',
      description:
        'Official Ethiopian import with 200MP camera, built-in S-Pen, Snapdragon 8 Gen 3, and 7 years of OS updates. 1-year local warranty included.',
      sku: 'ET-S24U-001',
      costPrice: 78000.0,
      sellingPrice: 88500.0,
      compareAtPrice: 95000.0,
      stockQuantity: 9,
      lowStockThreshold: 2,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: true,
    },
  });

  await prisma.productVariant.createMany({
    data: [
      {
        productId: galaxyPhone.id,
        name: '256GB / Titanium Gray',
        sku: 'ET-S24U-256-GRY',
        price: 88500.0,
        stockQuantity: 5,
        options: JSON.stringify({ storage: '256GB', color: 'Titanium Gray' }),
      },
      {
        productId: galaxyPhone.id,
        name: '512GB / Titanium Black',
        sku: 'ET-S24U-512-BLK',
        price: 97500.0,
        stockQuantity: 4,
        options: JSON.stringify({ storage: '512GB', color: 'Titanium Black' }),
      },
    ],
  });

  // Product 2: MacBook Pro 14 M3 Pro
  const macBook = await prisma.product.create({
    data: {
      storeId: ethioTech.id,
      categoryId: catComputers.id,
      brand: 'Apple',
      name: 'MacBook Pro 14 M3 Pro (18GB / 512GB)',
      slug: 'macbook-pro-14-m3-pro',
      description:
        'Space Black Apple Silicon laptop engineered for demanding workflows. Liquid Retina XDR display, up to 18 hours battery life, 140W fast charger included.',
      sku: 'ET-MBP-14-M3',
      costPrice: 132000.0,
      sellingPrice: 148000.0,
      compareAtPrice: 155000.0,
      stockQuantity: 6,
      lowStockThreshold: 1,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: false,
    },
  });

  // Product 3: Apple iPhone 16 Pro Max
  const iphone16 = await prisma.product.create({
    data: {
      storeId: ethioTech.id,
      categoryId: catPhones.id,
      brand: 'Apple',
      name: 'Apple iPhone 16 Pro Max (A18 Pro)',
      slug: 'apple-iphone-16-pro-max',
      description:
        'Grade-5 Titanium design with Camera Control button, 48MP Fusion camera system, 5x telephoto optical zoom, and incredible all-day battery life.',
      sku: 'ET-IPH-16PM',
      costPrice: 94000.0,
      sellingPrice: 108000.0,
      compareAtPrice: 115000.0,
      stockQuantity: 12,
      lowStockThreshold: 2,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: true,
    },
  });

  await prisma.productVariant.createMany({
    data: [
      {
        productId: iphone16.id,
        name: '256GB / Natural Titanium',
        sku: 'ET-IPH16-256-NAT',
        price: 108000.0,
        stockQuantity: 4,
        options: JSON.stringify({ storage: '256GB', color: 'Natural Titanium' }),
      },
      {
        productId: iphone16.id,
        name: '512GB / Natural Titanium',
        sku: 'ET-IPH16-512-NAT',
        price: 119000.0,
        stockQuantity: 4,
        options: JSON.stringify({ storage: '512GB', color: 'Natural Titanium' }),
      },
      {
        productId: iphone16.id,
        name: '256GB / Desert Titanium',
        sku: 'ET-IPH16-256-DST',
        price: 108000.0,
        stockQuantity: 4,
        options: JSON.stringify({ storage: '256GB', color: 'Desert Titanium' }),
      },
    ],
  });

  // Product 4: MacBook Air 15 M3 Chip
  const macbookAir = await prisma.product.create({
    data: {
      storeId: ethioTech.id,
      categoryId: catComputers.id,
      brand: 'Apple',
      name: 'MacBook Air 15-inch M3 (16GB / 512GB)',
      slug: 'macbook-air-15-inch-m3',
      description:
        'Strikingly thin and fast. The 15.3-inch Liquid Retina display with M3 chip powers seamless multitasking, silent fanless design, and MagSafe 3 charging.',
      sku: 'ET-MBA-15-M3',
      costPrice: 82000.0,
      sellingPrice: 94500.0,
      compareAtPrice: 99000.0,
      stockQuantity: 8,
      lowStockThreshold: 2,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: true,
    },
  });

  await prisma.productVariant.createMany({
    data: [
      {
        productId: macbookAir.id,
        name: '16GB / 512GB - Midnight',
        sku: 'ET-MBA-MDN-512',
        price: 94500.0,
        stockQuantity: 5,
        options: JSON.stringify({ ram: '16GB', storage: '512GB', color: 'Midnight' }),
      },
      {
        productId: macbookAir.id,
        name: '16GB / 512GB - Starlight',
        sku: 'ET-MBA-STR-512',
        price: 94500.0,
        stockQuantity: 3,
        options: JSON.stringify({ ram: '16GB', storage: '512GB', color: 'Starlight' }),
      },
    ],
  });

  // Product 5: Dell XPS 15 OLED Workstation
  await prisma.product.create({
    data: {
      storeId: ethioTech.id,
      categoryId: catComputers.id,
      brand: 'Dell',
      name: 'Dell XPS 15 OLED 3.5K Touch Workstation',
      slug: 'dell-xps-15-oled-touch',
      description:
        '13th Gen Intel Core i7-13700H, NVIDIA GeForce RTX 4060, 32GB DDR5 RAM, 1TB NVMe SSD. CNC machined aluminum and carbon fiber palm rest.',
      sku: 'ET-DELL-XPS15',
      costPrice: 110000.0,
      sellingPrice: 126000.0,
      compareAtPrice: 135000.0,
      stockQuantity: 5,
      lowStockThreshold: 1,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: false,
    },
  });

  // Product 6: Apple iPad Air 11-inch M2
  const ipadAir = await prisma.product.create({
    data: {
      storeId: ethioTech.id,
      categoryId: catPhones.id,
      brand: 'Apple',
      name: 'Apple iPad Air 11-inch M2',
      slug: 'apple-ipad-air-11-inch-m2',
      description:
        'Supercharged by the Apple M2 chip. Supports Apple Pencil Pro and Magic Keyboard. Liquid Retina display with anti-reflective coating.',
      sku: 'ET-IPAD-AIR-M2',
      costPrice: 42000.0,
      sellingPrice: 48500.0,
      compareAtPrice: 53000.0,
      stockQuantity: 10,
      lowStockThreshold: 2,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1561154464-82e9adf32764?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: true,
    },
  });

  await prisma.productVariant.createMany({
    data: [
      {
        productId: ipadAir.id,
        name: '128GB Wi-Fi / Space Gray',
        sku: 'ET-IPAD-128-GRY',
        price: 48500.0,
        stockQuantity: 6,
        options: JSON.stringify({ storage: '128GB', color: 'Space Gray' }),
      },
      {
        productId: ipadAir.id,
        name: '256GB Wi-Fi / Starlight Blue',
        sku: 'ET-IPAD-256-BLU',
        price: 55000.0,
        stockQuantity: 4,
        options: JSON.stringify({ storage: '256GB', color: 'Starlight Blue' }),
      },
    ],
  });

  // Product 7: Sony WH-1000XM5 Headphones
  const sonyHeadphones = await prisma.product.create({
    data: {
      storeId: ethioTech.id,
      categoryId: catAudio.id,
      brand: 'Sony',
      name: 'Sony WH-1000XM5 Wireless Noise-Canceling Headphones',
      slug: 'sony-wh-1000xm5-headphones',
      description:
        'Industry-leading active noise cancellation with 8 microphones, Auto NC Optimizer, 30-hour battery life, and ultra-comfortable lightweight fit.',
      sku: 'ET-SNY-XM5',
      costPrice: 22000.0,
      sellingPrice: 26500.0,
      compareAtPrice: 29000.0,
      stockQuantity: 14,
      lowStockThreshold: 3,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: true,
    },
  });

  await prisma.productVariant.createMany({
    data: [
      {
        productId: sonyHeadphones.id,
        name: 'Platinum Silver',
        sku: 'ET-XM5-SLV',
        price: 26500.0,
        stockQuantity: 7,
        options: JSON.stringify({ color: 'Platinum Silver' }),
      },
      {
        productId: sonyHeadphones.id,
        name: 'Matte Obsidian Black',
        sku: 'ET-XM5-BLK',
        price: 26500.0,
        stockQuantity: 7,
        options: JSON.stringify({ color: 'Matte Obsidian Black' }),
      },
    ],
  });

  // Product 8: DJI Mini 4 Pro Drone
  await prisma.product.create({
    data: {
      storeId: ethioTech.id,
      categoryId: catGadgets.id,
      brand: 'DJI',
      name: 'DJI Mini 4 Pro Drone (Fly More Combo)',
      slug: 'dji-mini-4-pro-drone',
      description:
        'Under 249g ultra-lightweight drone with omnidirectional obstacle sensing, 4K/60fps HDR true vertical shooting, and up to 34 minutes flight time per battery.',
      sku: 'ET-DJI-M4P',
      costPrice: 58000.0,
      sellingPrice: 68500.0,
      compareAtPrice: 74000.0,
      stockQuantity: 5,
      lowStockThreshold: 1,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1527977966376-1c8408f9f108?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: false,
    },
  });

  // Product 9: Anker 737 PowerBank (PowerCore 24K)
  await prisma.product.create({
    data: {
      storeId: ethioTech.id,
      categoryId: catGadgets.id,
      brand: 'Anker',
      name: 'Anker 737 PowerBank (PowerCore 24K 140W)',
      slug: 'anker-737-powerbank-140w',
      description:
        '24,000mAh portable charger with two-way Power Delivery 3.1 fast charging at up to 140W. Smart digital display shows real-time wattage and battery health.',
      sku: 'ET-ANK-737',
      costPrice: 9500.0,
      sellingPrice: 12800.0,
      compareAtPrice: 14500.0,
      stockQuantity: 20,
      lowStockThreshold: 4,
      unit: 'pcs',
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1609592424368-f9b09a7b9736?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=800&auto=format&fit=crop&q=80',
      ]),
      isActive: true,
      hasVariants: false,
    },
  });

  console.log('✅ 20+ Realistic products with brands, multi-images, and variants created.');

  // 11. Customer Address
  const customerAddress = await prisma.customerAddress.create({
    data: {
      userId: customer1.id,
      label: 'Home',
      recipientName: 'Hana Girma',
      recipientPhone: '+251966789012',
      streetAddress: 'Bole Sub-city, Woreda 03, House 452',
      city: 'Addis Ababa',
      subcity: 'Bole',
      latitude: 9.0062,
      longitude: 38.7758,
      locationPermissionGranted: true,
      isDefault: true,
    },
  });

  // 12. Rich Seed Online Orders (Unified with Storefront, Delivery & Proofs)
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // Addis Fashion - Order 1 (5 days ago - Delivered & Completed)
  await prisma.order.create({
    data: {
      orderNumber: 'ORD-2026-0001',
      storeId: addisFashion.id,
      customerId: customer1.id,
      customerName: 'Hana Girma',
      customerEmail: 'customer.hana@gmail.com',
      customerPhone: '+251966789012',
      orderType: OrderType.DELIVERY,
      shippingAddress: 'Bole Sub-city, Woreda 03, House 452, Addis Ababa',
      deliveryLatitude: 9.0062,
      deliveryLongitude: 38.7758,
      subtotal: 4500.0,
      taxAmount: 675.0,
      shippingCost: 50.0,
      totalAmount: 5225.0,
      status: OrderStatus.COMPLETED,
      paymentMethod: 'BANK_TRANSFER_SCREENSHOT',
      paymentProofUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80',
      paymentProofStatus: PaymentProofStatus.VERIFIED,
      verifiedById: ownerAddis.id,
      createdAt: daysAgo(5),
      items: {
        create: [
          {
            productId: kemisProduct.id,
            quantity: 1,
            unitPrice: 4500.0,
            subtotal: 4500.0,
          },
        ],
      },
    },
  });

  // Addis Fashion - Order 2 (4 days ago - Completed)
  await prisma.order.create({
    data: {
      orderNumber: 'ORD-2026-0002',
      storeId: addisFashion.id,
      customerId: customer2.id,
      customerName: 'Mekonnen Tadesse',
      customerEmail: 'customer.mekonnen@gmail.com',
      customerPhone: '+251977890123',
      orderType: OrderType.DELIVERY,
      shippingAddress: 'Kazanchis, Near UNECA, Addis Ababa',
      deliveryLatitude: 9.0180,
      deliveryLongitude: 38.7650,
      subtotal: 6800.0,
      taxAmount: 1020.0,
      shippingCost: 50.0,
      totalAmount: 7870.0,
      status: OrderStatus.COMPLETED,
      paymentMethod: 'CHAPA',
      chapaTxRef: 'TX-CHAPA-AF-002',
      createdAt: daysAgo(4),
      items: {
        create: [
          {
            productId: leatherJacket.id,
            quantity: 1,
            unitPrice: 6800.0,
            subtotal: 6800.0,
          },
        ],
      },
    },
  });

  // Addis Fashion - Order 3 (3 days ago - In-store Pickup Paid)
  await prisma.order.create({
    data: {
      orderNumber: 'ORD-2026-0003',
      storeId: addisFashion.id,
      customerId: customer1.id,
      customerName: 'Hana Girma',
      customerEmail: 'customer.hana@gmail.com',
      customerPhone: '+251966789012',
      orderType: OrderType.PICKUP,
      pickupStoreAddress: 'Bole Road, Mega Building 2nd Floor, Addis Ababa',
      subtotal: 1950.0,
      taxAmount: 292.5,
      shippingCost: 0.0,
      totalAmount: 2242.5,
      status: OrderStatus.PAID,
      paymentMethod: 'BANK_TRANSFER_SCREENSHOT',
      paymentProofUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80',
      paymentProofStatus: PaymentProofStatus.VERIFIED,
      verifiedById: ownerAddis.id,
      createdAt: daysAgo(3),
      items: {
        create: [
          {
            productId: leatherBag.id,
            quantity: 1,
            unitPrice: 1950.0,
            subtotal: 1950.0,
          },
        ],
      },
    },
  });

  // Addis Fashion - Order 4 (2 days ago - Shipped)
  await prisma.order.create({
    data: {
      orderNumber: 'ORD-2026-0004',
      storeId: addisFashion.id,
      customerId: customer2.id,
      customerName: 'Mekonnen Tadesse',
      customerEmail: 'customer.mekonnen@gmail.com',
      customerPhone: '+251977890123',
      orderType: OrderType.DELIVERY,
      shippingAddress: 'CMC Michael, Safari Area, Addis Ababa',
      deliveryLatitude: 9.0230,
      deliveryLongitude: 38.8250,
      subtotal: 6450.0,
      taxAmount: 967.5,
      shippingCost: 50.0,
      totalAmount: 7467.5,
      status: OrderStatus.SHIPPED,
      paymentMethod: 'BANK_TRANSFER_SCREENSHOT',
      paymentProofStatus: PaymentProofStatus.VERIFIED,
      verifiedById: ownerAddis.id,
      createdAt: daysAgo(2),
      items: {
        create: [
          {
            productId: kemisProduct.id,
            quantity: 1,
            unitPrice: 4500.0,
            subtotal: 4500.0,
          },
          {
            productId: leatherBag.id,
            quantity: 1,
            unitPrice: 1950.0,
            subtotal: 1950.0,
          },
        ],
      },
    },
  });

  // Addis Fashion - Order 5 (Yesterday - Processing)
  await prisma.order.create({
    data: {
      orderNumber: 'ORD-2026-0005',
      storeId: addisFashion.id,
      customerName: 'Yared Shimelis',
      customerEmail: 'yared.s@gmail.com',
      customerPhone: '+251911445566',
      orderType: OrderType.DELIVERY,
      shippingAddress: 'Old Airport, Behind Golf Club, Addis Ababa',
      deliveryLatitude: 8.9890,
      deliveryLongitude: 38.7420,
      subtotal: 4800.0,
      taxAmount: 720.0,
      shippingCost: 50.0,
      totalAmount: 5570.0,
      status: OrderStatus.PROCESSING,
      paymentMethod: 'CHAPA',
      chapaTxRef: 'TX-CHAPA-AF-005',
      createdAt: daysAgo(1),
      items: {
        create: [
          {
            productId: kemisProduct.id,
            quantity: 1,
            unitPrice: 4800.0,
            subtotal: 4800.0,
          },
        ],
      },
    },
  });

  // Addis Fashion - Order 6 (Today - Pending Verification)
  await prisma.order.create({
    data: {
      orderNumber: 'ORD-2026-0006',
      storeId: addisFashion.id,
      customerName: 'Tsedey Bekele',
      customerEmail: 'tsedey.b@gmail.com',
      customerPhone: '+251922556677',
      orderType: OrderType.DELIVERY,
      shippingAddress: 'Bole Medhanialem, Edna Mall Area, Addis Ababa',
      deliveryLatitude: 8.9980,
      deliveryLongitude: 38.7840,
      subtotal: 6800.0,
      taxAmount: 1020.0,
      shippingCost: 50.0,
      totalAmount: 7870.0,
      status: OrderStatus.AWAITING_VERIFICATION,
      paymentMethod: 'BANK_TRANSFER_SCREENSHOT',
      paymentProofUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80',
      paymentProofStatus: PaymentProofStatus.SUBMITTED,
      createdAt: now,
      items: {
        create: [
          {
            productId: leatherJacket.id,
            quantity: 1,
            unitPrice: 6800.0,
            subtotal: 6800.0,
          },
        ],
      },
    },
  });

  // Ethio Tech - Online Order (3 days ago - Completed)
  await prisma.order.create({
    data: {
      orderNumber: 'ORD-ET-2026-01',
      storeId: ethioTech.id,
      customerId: customer1.id,
      customerName: 'Hana Girma',
      customerEmail: 'customer.hana@gmail.com',
      customerPhone: '+251966789012',
      orderType: OrderType.DELIVERY,
      shippingAddress: 'Bole Atlas, Behind Edna Mall, Addis Ababa',
      deliveryLatitude: 9.0062,
      deliveryLongitude: 38.7758,
      subtotal: 88500.0,
      taxAmount: 13275.0,
      shippingCost: 100.0,
      totalAmount: 101875.0,
      status: OrderStatus.COMPLETED,
      paymentMethod: 'CHAPA',
      chapaTxRef: 'TX-CHAPA-ET-001',
      createdAt: daysAgo(3),
      items: {
        create: [
          {
            productId: galaxyPhone.id,
            quantity: 1,
            unitPrice: 88500.0,
            subtotal: 88500.0,
          },
        ],
      },
    },
  });

  // 13. Rich POS Sales for In-Store Counter & Sales Breakdown
  // POS Sale 1 (5 days ago - Cashier Selam)
  await prisma.pOSSale.create({
    data: {
      receiptNumber: 'RCP-2026-0001',
      storeId: addisFashion.id,
      cashierId: cashierAddis.id,
      customerName: 'Walk-in Shopper',
      totalAmount: 1950.0,
      netAmount: 1950.0,
      paymentMethod: POSPaymentMethod.CASH,
      notes: 'Customer purchased leather messenger bag in store',
      createdAt: daysAgo(5),
      items: {
        create: [
          {
            productId: leatherBag.id,
            quantity: 1,
            unitPrice: 1950.0,
            subtotal: 1950.0,
          },
        ],
      },
    },
  });

  // POS Sale 2 (4 days ago - Telebirr)
  await prisma.pOSSale.create({
    data: {
      receiptNumber: 'RCP-2026-0002',
      storeId: addisFashion.id,
      cashierId: cashierAddis.id,
      customerName: 'Alemayehu Z.',
      customerPhone: '+251911334455',
      totalAmount: 4500.0,
      netAmount: 4500.0,
      paymentMethod: POSPaymentMethod.MOBILE_MONEY,
      notes: 'Paid via Telebirr merchant till 554433',
      createdAt: daysAgo(4),
      items: {
        create: [
          {
            productId: kemisProduct.id,
            quantity: 1,
            unitPrice: 4500.0,
            subtotal: 4500.0,
          },
        ],
      },
    },
  });

  // POS Sale 3 (3 days ago - Card)
  await prisma.pOSSale.create({
    data: {
      receiptNumber: 'RCP-2026-0003',
      storeId: addisFashion.id,
      cashierId: cashierAddis.id,
      customerName: 'Bethlehem K.',
      customerPhone: '+251922445566',
      totalAmount: 6800.0,
      netAmount: 6800.0,
      paymentMethod: POSPaymentMethod.CARD,
      notes: 'CBE Birr POS terminal terminal #094',
      createdAt: daysAgo(3),
      items: {
        create: [
          {
            productId: leatherJacket.id,
            quantity: 1,
            unitPrice: 6800.0,
            subtotal: 6800.0,
          },
        ],
      },
    },
  });

  // POS Sale 4 (2 days ago - Cash)
  await prisma.pOSSale.create({
    data: {
      receiptNumber: 'RCP-2026-0004',
      storeId: addisFashion.id,
      cashierId: cashierAddis.id,
      customerName: 'Walk-in Tourist',
      totalAmount: 3900.0,
      netAmount: 3900.0,
      paymentMethod: POSPaymentMethod.CASH,
      notes: '2x Crossbody messenger bags',
      createdAt: daysAgo(2),
      items: {
        create: [
          {
            productId: leatherBag.id,
            quantity: 2,
            unitPrice: 1950.0,
            subtotal: 3900.0,
          },
        ],
      },
    },
  });

  // POS Sale 5 (2 days ago - Multi-store Staff Yonas Abebe)
  await prisma.pOSSale.create({
    data: {
      receiptNumber: 'RCP-2026-0005',
      storeId: addisFashion.id,
      cashierId: multiStaff.id,
      customerName: 'Tariku Mengistu',
      customerPhone: '+251933556677',
      totalAmount: 6450.0,
      netAmount: 6450.0,
      paymentMethod: POSPaymentMethod.MOBILE_MONEY,
      notes: 'Processed by Yonas Abebe via Telebirr QR',
      createdAt: daysAgo(2),
      items: {
        create: [
          {
            productId: kemisProduct.id,
            quantity: 1,
            unitPrice: 4500.0,
            subtotal: 4500.0,
          },
          {
            productId: leatherBag.id,
            quantity: 1,
            unitPrice: 1950.0,
            subtotal: 1950.0,
          },
        ],
      },
    },
  });

  // POS Sale 6 (Yesterday - Cash)
  await prisma.pOSSale.create({
    data: {
      receiptNumber: 'RCP-2026-0006',
      storeId: addisFashion.id,
      cashierId: cashierAddis.id,
      customerName: 'Walk-in Shopper',
      totalAmount: 1950.0,
      netAmount: 1950.0,
      paymentMethod: POSPaymentMethod.CASH,
      notes: 'Walk-in counter sale',
      createdAt: daysAgo(1),
      items: {
        create: [
          {
            productId: leatherBag.id,
            quantity: 1,
            unitPrice: 1950.0,
            subtotal: 1950.0,
          },
        ],
      },
    },
  });

  // POS Sale 7 (Yesterday - Card)
  await prisma.pOSSale.create({
    data: {
      receiptNumber: 'RCP-2026-0007',
      storeId: addisFashion.id,
      cashierId: cashierAddis.id,
      customerName: 'Sara Tesfaye',
      customerPhone: '+251944667788',
      totalAmount: 4800.0,
      netAmount: 4800.0,
      paymentMethod: POSPaymentMethod.CARD,
      notes: 'Bank of Abyssinia Debit Card terminal',
      createdAt: daysAgo(1),
      items: {
        create: [
          {
            productId: kemisProduct.id,
            quantity: 1,
            unitPrice: 4800.0,
            subtotal: 4800.0,
          },
        ],
      },
    },
  });

  // POS Sale 8 (Today - Yonas Abebe)
  await prisma.pOSSale.create({
    data: {
      receiptNumber: 'RCP-2026-0008',
      storeId: addisFashion.id,
      cashierId: multiStaff.id,
      customerName: 'Walk-in Shopper',
      totalAmount: 6800.0,
      netAmount: 6800.0,
      paymentMethod: POSPaymentMethod.CASH,
      notes: 'Leather bomber jacket paid in cash at counter',
      createdAt: now,
      items: {
        create: [
          {
            productId: leatherJacket.id,
            quantity: 1,
            unitPrice: 6800.0,
            subtotal: 6800.0,
          },
        ],
      },
    },
  });

  // Ethio Tech - POS Sale (2 days ago - MacBook Pro 14)
  await prisma.pOSSale.create({
    data: {
      receiptNumber: 'RCP-ET-2026-01',
      storeId: ethioTech.id,
      cashierId: multiStaff.id,
      customerName: 'Tech Consultant Shopper',
      totalAmount: 148000.0,
      netAmount: 148000.0,
      paymentMethod: POSPaymentMethod.CARD,
      notes: 'In-store corporate workstation purchase',
      createdAt: daysAgo(2),
      items: {
        create: [
          {
            productId: macBook.id,
            quantity: 1,
            unitPrice: 148000.0,
            subtotal: 148000.0,
          },
        ],
      },
    },
  });

  // 14. Isolated Alerts (Syncboard Style: Store only, Admin only, Customer only)
  // Store Alert -> Addis Fashion Hub only (superadmin never gets this)
  await prisma.alert.create({
    data: {
      targetType: 'STORE',
      storeId: addisFashion.id,
      type: AlertType.NEW_ORDER,
      title: 'New Order Received: ORD-2026-0001',
      message: 'Hana Girma placed an order for Royal Hand-Woven Habesha Kemis (5,375.00 ETB).',
      isRead: false,
      isSeen: false, // will show popup once
    },
  });

  // Admin Alert -> Super Admin only (store never gets this)
  await prisma.alert.create({
    data: {
      targetType: 'ADMIN',
      type: AlertType.PAYMENT_SUBMITTED,
      title: 'Platform Subscription Renewal Submitted',
      message: 'Store "Addis Fashion Hub" submitted proof of payment for the Growth Plan.',
      isRead: false,
      isSeen: false,
    },
  });

  // Customer Alert -> Customer only
  await prisma.alert.create({
    data: {
      targetType: 'CUSTOMER',
      userId: customer1.id,
      type: AlertType.NEW_ORDER,
      title: 'Order ORD-2026-0001 Confirmed!',
      message: 'Your order at Addis Fashion Hub is now being processed for delivery.',
      isRead: false,
      isSeen: false,
    },
  });

  // 15. Staff Invite Sample (For Testing Invitation Acceptance)
  await prisma.staffInvite.create({
    data: {
      storeId: addisFashion.id,
      email: 'newstaff.addisfashion@gmail.com',
      assignedRole: StaffRole.CASHIER,
      permissions: JSON.stringify(['process_pos']),
      inviteCode: 'INV-ADDIS-2026-X89',
      status: 'PENDING',
      invitedById: ownerAddis.id,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  console.log('✅ Isolated alerts and pending staff invite seeded.');
  console.log('🎉 Seeding successfully completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
