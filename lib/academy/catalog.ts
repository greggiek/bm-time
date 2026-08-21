import curriculum from './catalog.json';

export type AcademyQuestion = { question: string; answers: string[]; correct: number };
export type AcademyModule = {
  code: string;
  school: string;
  title: string;
  summary: string;
  sections: [string, string][];
  quiz: AcademyQuestion[];
  practical?: string[];
  source?: string;
};

export const academyCatalog = curriculum as AcademyModule[];
export const academyModuleByCode = new Map(academyCatalog.map(module => [module.code, module]));

export function publicAcademyModule(module: AcademyModule) {
  return {
    ...module,
    quiz: module.quiz.map(({ question, answers }) => ({ question, answers })),
  };
}
