import { prisma } from '../../src/config/db';

export const DEFAULT_SUBSCRIPTION_PLANS = [
  {
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
    isActive: true,
  },
  {
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
    isActive: true,
  },
  {
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
    isActive: true,
  },
];

export async function ensureDefaultSubscriptionPlans() {
  for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: {
        maxProducts: plan.maxProducts,
        maxStaff: plan.maxStaff,
        trialDays: plan.trialDays,
        isActive: plan.isActive,
      },
      create: plan,
    });
  }
}
