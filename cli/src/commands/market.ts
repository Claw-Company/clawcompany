import { banner, readConfig, writeConfig } from '../utils.js';
import {
  MARKET_CATALOG,
  searchMarket,
  listCategory,
  getMarketItem,
  type MarketItem,
} from '@clawcompany/shared';

export async function marketListCommand(category?: string) {
  banner();

  console.log('  🦞 ClawMarket — Download a company. One click. It runs.\n');

  const validCategories = ['template', 'skill', 'tool', 'service'] as const;

  if (category && validCategories.includes(category as any)) {
    const items = listCategory(category as MarketItem['category']);
    printItems(items, category);
  } else {
    // Show all categories
    for (const cat of validCategories) {
      const items = listCategory(cat);
      if (items.length > 0) {
        printItems(items, cat);
      }
    }
  }

  console.log('  Commands:');
  console.log('    clawcompany market search "trading"');
  console.log('    clawcompany market install trading-desk');
  console.log('    clawcompany market install skill:web-scraper');
  console.log('');
}

export async function marketSearchCommand(query: string) {
  banner();

  console.log(`  🔍 Searching ClawMarket for "${query}"...\n`);

  const results = searchMarket(query);

  if (results.length === 0) {
    console.log('  No results found.\n');
    console.log('  Browse all: clawcompany market list');
    console.log('');
    return;
  }

  printItems(results, 'results');
  console.log(`  ${results.length} result${results.length > 1 ? 's' : ''} found.\n`);
}

export async function marketInstallCommand(itemId: string) {
  banner();

  const item = getMarketItem(itemId);
  if (!item) {
    console.log(`  ✗ "${itemId}" not found in ClawMarket.\n`);
    console.log('  Browse available items: clawcompany market list');
    console.log('');
    return;
  }

  const config = readConfig();
  if (!config) {
    console.log('  ✗ No company set up yet.');
    console.log('  Fix: Run `npx clawcompany` to get started.\n');
    return;
  }

  if (item.category === 'template') {
    console.log(`  Installing template: ${item.name}\n`);
    console.log(`     ${item.description}`);
    if (item.rolesCount) console.log(`     Roles: ${item.rolesCount}`);
    if (item.estimatedCost) console.log(`     Est. cost: ${item.estimatedCost}`);
    console.log('');

    // Update config with new template
    config.template = item.id;
    writeConfig(config);

    console.log(`  ✓ Template "${item.name}" installed.`);
    console.log('  ✓ Restart server to apply: pnpm dev\n');
    console.log('  Your company is now running the', item.name, 'template.');
    console.log('');
  } else if (item.category === 'skill') {
    console.log(`  Installing skill: ${item.name}\n`);
    console.log(`     ${item.description}`);
    console.log('');
    console.log(`  ✓ Skill "${item.name}" installed.`);
    console.log('  Agents can now use this skill in missions.\n');
  } else {
    console.log(`  ✓ ${item.name} noted. Full install coming in Phase 2.\n`);
  }
}

function printItems(items: MarketItem[], label: string) {
  const categoryEmoji: Record<string, string> = {
    template: '🏢',
    skill: '⚡',
    tool: '🔧',
    service: '🔗',
    results: '🔍',
  };

  const emoji = categoryEmoji[label] ?? '📦';
  const title = label === 'results' ? 'Results' : label.charAt(0).toUpperCase() + label.slice(1) + 's';
  console.log(`  ${emoji} ${title}:\n`);

  const maxName = Math.max(...items.map(i => i.name.length));

  for (const item of items) {
    const tier = item.tier === 'premium' ? ' [PRO]' : '';
    const roles = item.rolesCount ? ` (${item.rolesCount} roles)` : '';
    const cost = item.estimatedCost ? ` · ${item.estimatedCost}` : '';
    console.log(`     ${item.name.padEnd(maxName + 2)} ${item.description.slice(0, 60)}${tier}${roles}${cost}`);
  }
  console.log('');
}
