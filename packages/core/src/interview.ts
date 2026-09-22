export type InterviewQuestionType = "text" | "select" | "confirm";

export interface InterviewQuestion {
  id: string;
  targetEntityId?: string;
  prompt: string;
  requirementIds: string[];
  type: InterviewQuestionType;
  choices?: string[];
}
