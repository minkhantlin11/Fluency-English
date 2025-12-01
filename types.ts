export enum CEFRLevel {
  A1 = 'A1',
  A2 = 'A2',
  B1 = 'B1',
  B2 = 'B2',
  C1 = 'C1'
}

export interface LevelDetails {
  id: CEFRLevel;
  title: string;
  description: string;
  color: string;
}

export interface EvaluationResult {
  grammar_correction: string;
  vocabulary_suggestions: string;
  sentence_structure_fix: string;
  strengths: string[];
  weaknesses: string[];
  score: number;
  corrected_answer: string;
  professional_model_answer: string;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  levelId: CEFRLevel;
  topicName: string;
  question: string;
  userAnswer: string;
  evaluation: EvaluationResult;
}

export type ViewState = 'SPLASH' | 'HOME' | 'TOPICS' | 'QUESTION' | 'EVALUATION' | 'LIVE_CONVERSATION' | 'HISTORY';

export interface Topic {
  id: string;
  name: string;
  icon: string;
}