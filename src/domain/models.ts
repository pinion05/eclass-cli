import { z } from 'zod';

export const CourseSchema = z.object({
  name: z.string(),
  professor: z.string(),
  time: z.string(),
  kjkey: z.string(),
});
export type Course = z.infer<typeof CourseSchema>;

export const AssignmentSchema = z.object({
  title: z.string(),
  course: z.string(),
  category: z.enum(['report', 'test', 'lecture_weeks', 'project']),
  dDay: z.string(),
  deadline: z.string(),
  status: z.enum(['진행중', '종료']),
  kjkey: z.string(),
  seq: z.string(),
});
export type Assignment = z.infer<typeof AssignmentSchema>;

export const MaterialSchema = z.object({
  title: z.string(),
  author: z.string(),
  views: z.number(),
  publishDate: z.string(),
  hasAttachment: z.boolean(),
  isRead: z.boolean(),
  artlNum: z.string(),
});
export type Material = z.infer<typeof MaterialSchema>;

export const CourseDetailSchema = z.object({
  name: z.string(),
  professor: z.string(),
  email: z.string().nullable(),
  time: z.string(),
  credits: z.string(),
  overview: z.string().nullable(),
  grading: z.string().nullable(),
  weeklyPlan: z.array(z.object({
    week: z.string(),
    content: z.string(),
  })),
  kjkey: z.string(),
});
export type CourseDetail = z.infer<typeof CourseDetailSchema>;

export const SubmissionResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  submittedFiles: z.array(z.string()),
  submittedAt: z.string(),
});
export type SubmissionResult = z.infer<typeof SubmissionResultSchema>;
