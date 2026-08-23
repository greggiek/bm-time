import curriculum from './catalog.json';

export type AcademyQuestion = { question: string; answers: string[]; correct: number };
export type AcademyTranslation = {
  title: string;
  summary: string;
  sections: [string, string][];
  quiz: AcademyQuestion[];
  practical?: string[];
};
export type AcademyModule = {
  code: string;
  school: string;
  title: string;
  summary: string;
  sections: [string, string][];
  quiz: AcademyQuestion[];
  practical?: string[];
  source?: string;
  translations?: { es?: AcademyTranslation };
};

export const academyCatalog = curriculum as AcademyModule[];
export const academyModuleByCode = new Map(academyCatalog.map(module => [module.code, module]));

export function publicAcademyModule(module: AcademyModule) {
  const translations = module.translations
    ? Object.fromEntries(Object.entries(module.translations).map(([language, translation]) => [
      language,
      translation ? {
        ...translation,
        quiz: translation.quiz.map(({ question, answers }) => ({ question, answers })),
      } : translation,
    ]))
    : undefined;
  return {
    ...module,
    quiz: module.quiz.map(({ question, answers }) => ({ question, answers })),
    translations,
  };
}
