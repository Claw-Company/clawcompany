// ============================================================
// ClawMarket — Built-in Registry (Phase 1)
// Templates and skills ship with the npm package
// ============================================================

export interface MarketItem {
  id: string;
  name: string;
  category: 'template' | 'skill' | 'tool' | 'service';
  description: string;
  author: string;
  version: string;
  tags: string[];
  license: string;
  tier: 'free' | 'premium';
  installed?: boolean;
  rolesCount?: number;
  estimatedCost?: string;
}

export const MARKET_CATALOG: MarketItem[] = [
  // ═══ Templates ═══
  {
    id: 'default',
    name: 'Default Company',
    category: 'template',
    description: 'Full AI company. CEO + CTO + CFO + CMO + Researcher + Analyst + Engineer + Secretary + Worker.',
    author: 'clawcompany',
    version: '1.0.0',
    tags: ['general', 'full-team'],
    license: 'MIT',
    tier: 'free',
    rolesCount: 9,
    estimatedCost: '$0.03-0.08 per mission',
  },
  {
    id: 'trading-desk',
    name: 'Trading Desk',
    category: 'template',
    description: 'Crypto/DeFi trading with market analysis, execution, and risk management.',
    author: 'clawcompany',
    version: '1.0.0',
    tags: ['crypto', 'defi', 'trading', 'finance'],
    license: 'MIT',
    tier: 'free',
    rolesCount: 11,
    estimatedCost: '$0.05-0.15 per mission',
  },
  {
    id: 'content-agency',
    name: 'Content Agency',
    category: 'template',
    description: 'Content production with writers, editors, and SEO specialists.',
    author: 'clawcompany',
    version: '1.0.0',
    tags: ['content', 'writing', 'marketing', 'seo'],
    license: 'MIT',
    tier: 'free',
    rolesCount: 10,
    estimatedCost: '$0.04-0.10 per mission',
  },
  {
    id: 'dev-shop',
    name: 'Dev Shop',
    category: 'template',
    description: 'Software development with CTO, engineers, QA, and DevOps.',
    author: 'clawcompany',
    version: '1.0.0',
    tags: ['software', 'development', 'engineering', 'devops'],
    license: 'MIT',
    tier: 'free',
    rolesCount: 10,
    estimatedCost: '$0.05-0.12 per mission',
  },
  {
    id: 'solo-founder',
    name: 'Solo Founder',
    category: 'template',
    description: 'Maximum efficiency. CEO + Worker only. Cheapest option.',
    author: 'clawcompany',
    version: '1.0.0',
    tags: ['solo', 'minimal', 'cheap', 'bootstrap'],
    license: 'MIT',
    tier: 'free',
    rolesCount: 2,
    estimatedCost: '$0.01-0.03 per mission',
  },
  {
    id: 'legal-firm',
    name: 'Legal Firm',
    category: 'template',
    description: 'Contract analysis, legal research, compliance review, document drafting.',
    author: 'clawcompany',
    version: '1.0.0',
    tags: ['legal', 'contracts', 'compliance', 'law'],
    license: 'MIT',
    tier: 'free',
    rolesCount: 8,
    estimatedCost: '$0.05-0.12 per mission',
  },
  {
    id: 'ecommerce',
    name: 'E-commerce Operator',
    category: 'template',
    description: 'Product listings, customer support, inventory management, ad optimization.',
    author: 'clawcompany',
    version: '1.0.0',
    tags: ['ecommerce', 'retail', 'shopify', 'amazon'],
    license: 'MIT',
    tier: 'free',
    rolesCount: 9,
    estimatedCost: '$0.04-0.10 per mission',
  },
  {
    id: 'consulting',
    name: 'Consulting Firm',
    category: 'template',
    description: 'Client research, proposal writing, deliverable production, project management.',
    author: 'clawcompany',
    version: '1.0.0',
    tags: ['consulting', 'proposals', 'deliverables', 'client'],
    license: 'MIT',
    tier: 'free',
    rolesCount: 8,
    estimatedCost: '$0.04-0.10 per mission',
  },

  // ═══ Skills ═══
  {
    id: 'skill:web-scraper',
    name: 'Web Scraper',
    category: 'skill',
    description: 'Extract structured data from web pages. Supports pagination and dynamic content.',
    author: 'clawcompany',
    version: '1.0.0',
    tags: ['web', 'scraping', 'data', 'extraction'],
    license: 'MIT',
    tier: 'free',
  },
  {
    id: 'skill:pdf-generator',
    name: 'PDF Generator',
    category: 'skill',
    description: 'Generate professional PDF reports from markdown or structured data.',
    author: 'clawcompany',
    version: '1.0.0',
    tags: ['pdf', 'report', 'document', 'export'],
    license: 'MIT',
    tier: 'free',
  },
  {
    id: 'skill:price-feed',
    name: 'Crypto Price Feed',
    category: 'skill',
    description: 'Real-time cryptocurrency prices from multiple exchanges.',
    author: 'clawcompany',
    version: '1.0.0',
    tags: ['crypto', 'price', 'exchange', 'data'],
    license: 'MIT',
    tier: 'free',
  },
  {
    id: 'skill:email-sender',
    name: 'Email Sender',
    category: 'skill',
    description: 'Send emails via SMTP or API (SendGrid, Resend, Mailgun).',
    author: 'clawcompany',
    version: '1.0.0',
    tags: ['email', 'smtp', 'sendgrid', 'notification'],
    license: 'MIT',
    tier: 'free',
  },
  {
    id: 'skill:github-ops',
    name: 'GitHub Operations',
    category: 'skill',
    description: 'Create issues, PRs, review code, manage repos via GitHub API.',
    author: 'clawcompany',
    version: '1.0.0',
    tags: ['github', 'git', 'code', 'devops'],
    license: 'MIT',
    tier: 'free',
  },
];

/**
 * Search the marketplace catalog.
 */
export function searchMarket(query: string, category?: MarketItem['category']): MarketItem[] {
  const q = query.toLowerCase();
  return MARKET_CATALOG.filter(item => {
    if (category && item.category !== category) return false;
    return (
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.tags.some(t => t.includes(q))
    );
  });
}

/**
 * Get a specific marketplace item by ID.
 */
export function getMarketItem(id: string): MarketItem | undefined {
  return MARKET_CATALOG.find(item => item.id === id);
}

/**
 * List all items in a category.
 */
export function listCategory(category: MarketItem['category']): MarketItem[] {
  return MARKET_CATALOG.filter(item => item.category === category);
}
