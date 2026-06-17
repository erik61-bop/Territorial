// Preset quick-chat messages, grouped into the tabs shown in the design.
// {t} is replaced by the target player's label. peace_request/ally_request also drive diplomacy.
export type ChatCategory = 'Diplomacy' | 'Strategy' | 'Warning' | 'Reaction';

export interface ChatTemplate {
  id: string;
  text: string;        // {t} placeholder for the target label
  requiresTarget: boolean;
  category: ChatCategory;
}

export const TEMPLATES: ChatTemplate[] = [
  // Diplomacy
  { id: 'peace_request', text: 'Peace? 🤝', requiresTarget: true, category: 'Diplomacy' },
  { id: 'ally_request', text: 'Alliance? 🛡️', requiresTarget: true, category: 'Diplomacy' },
  { id: 'dont_attack', text: "Don't attack me", requiresTarget: true, category: 'Diplomacy' },
  { id: 'wont_attack', text: "I won't attack you", requiresTarget: true, category: 'Diplomacy' },
  { id: 'fight_later', text: "Let's fight later", requiresTarget: true, category: 'Diplomacy' },
  // Strategy
  { id: 'attack_target', text: 'Attack {t}! ⚔️', requiresTarget: true, category: 'Strategy' },
  { id: 'leader', text: 'Get the leader! 👑', requiresTarget: false, category: 'Strategy' },
  { id: 'attack_now', text: 'Attack now!', requiresTarget: false, category: 'Strategy' },
  { id: 'wait', text: 'Wait…', requiresTarget: false, category: 'Strategy' },
  // Warning
  { id: 'help', text: 'Help me! 🆘', requiresTarget: false, category: 'Warning' },
  { id: 'defend', text: 'Defend!', requiresTarget: false, category: 'Warning' },
  { id: 'enemy_coming', text: 'Enemy incoming!', requiresTarget: false, category: 'Warning' },
  { id: 'surrounded', text: "I'm surrounded!", requiresTarget: false, category: 'Warning' },
  // Reaction
  { id: 'gg', text: 'Good game! 👍', requiresTarget: false, category: 'Reaction' },
  { id: 'nice', text: 'Nice move!', requiresTarget: false, category: 'Reaction' },
  { id: 'oops', text: 'Oops! 😅', requiresTarget: false, category: 'Reaction' },
  { id: 'thanks', text: 'Thanks! 🙏', requiresTarget: false, category: 'Reaction' },
];

export const CATEGORIES: ChatCategory[] = ['Diplomacy', 'Strategy', 'Warning', 'Reaction'];

export const TEMPLATE_BY_ID: Record<string, ChatTemplate> =
  Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

export function formatMessage(templateId: string, target: number, label: (id: number) => string): string {
  const t = TEMPLATE_BY_ID[templateId];
  if (!t) return templateId;
  return t.text.replace('{t}', target >= 0 ? label(target) : '');
}
