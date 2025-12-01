import { CEFRLevel, LevelDetails, Topic } from './types';

export const LEVELS: LevelDetails[] = [
  { id: CEFRLevel.A1, title: 'Beginner', description: 'Basic phrases and everyday expressions.', color: 'bg-green-100 text-green-800 border-green-200' },
  { id: CEFRLevel.A2, title: 'Elementary', description: 'Simple tasks and routine information.', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: CEFRLevel.B1, title: 'Intermediate', description: 'Standard input on familiar matters.', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { id: CEFRLevel.B2, title: 'Upper-Intermediate', description: 'Complex text and technical discussions.', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { id: CEFRLevel.C1, title: 'Advanced', description: 'Demanding, longer texts and implicit meaning.', color: 'bg-purple-100 text-purple-800 border-purple-200' },
];

export const TOPICS: Topic[] = [
  { id: 'work', name: 'Work & Career', icon: '💼' },
  { id: 'school', name: 'School & Education', icon: '🎓' },
  { id: 'daily_life', name: 'Daily Life', icon: '🏠' },
  { id: 'travel', name: 'Travel', icon: '✈️' },
  { id: 'technology', name: 'Technology', icon: '💻' },
  { id: 'family', name: 'Family & Friends', icon: '👨‍👩‍👧‍👦' },
  { id: 'culture', name: 'Culture & Art', icon: '🎨' },
  { id: 'food', name: 'Food & Dining', icon: '🍽️' },
  { id: 'health', name: 'Health & Wellness', icon: '🏥' },
  { id: 'news', name: 'Current Events', icon: '📰' },
];
